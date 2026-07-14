use std::{
    fs,
    io::{BufReader, Read},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    commands::graph::resolve_db_path,
    db::{
        connection::Database,
        repositories::{
            graph::{ContentOrigin, EntityType},
            DocumentContentInput, DocumentMetadataProjection, LocalNodeDocument, NodeAttachment,
            NodeAttachmentRepository, NodeDocumentMutation, NodeDocumentRepository,
        },
        transaction::TransactionGuard,
    },
    SharedApiState,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNodeImageRequest {
    pub workspace_root: String,
    pub graph_node_id: String,
    pub source_absolute_path: String,
}

/// The authoritative remote projection supplied by the caller before a
/// local-first attachment mutation. It is only used to initialise a missing
/// local document; an existing local user document is always retained.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoritativeDocumentSnapshot {
    pub body: String,
    pub summary: String,
    pub content_origin: String,
    pub content_revision: i64,
    #[serde(default)]
    pub body_source_coordinates: Vec<String>,
    pub entity_type: String,
    pub title: String,
    pub schema_version: i64,
}

/// One native media operation. Image and file inputs intentionally enter the
/// same service; `kind` describes the bytes while `role` describes how this
/// record currently presents them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachNodeAttachmentRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub workspace_root: String,
    pub graph_node_id: String,
    pub source_absolute_path: String,
    pub kind: String,
    pub role: String,
    #[serde(default)]
    pub caption: String,
    pub authoritative_document: AuthoritativeDocumentSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachNodeAttachmentResult {
    pub attachment: NodeAttachment,
    pub document: LocalNodeDocument,
    /// The exact remote baseline the caller read before this local-first
    /// mutation. It lets the JS transport perform its normal CAS projection
    /// without reconstructing ownership from a stale local document.
    pub expected_remote_origin: String,
    pub expected_remote_revision: i64,
}

/// Build the workspace-relative asset path `assets/<graph_node_id>/<file>` using
/// only the final file-name component of the source (directory parts stripped),
/// always with forward slashes.
pub fn compute_node_asset_relative_path(graph_node_id: &str, source_file_name: &str) -> String {
    let file_name = Path::new(source_file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    format!("assets/{graph_node_id}/{file_name}")
}

/// Validate that `graph_node_id` is a plain identifier segment: it must not contain
/// path separators or `..` components that could escape the `assets/` directory.
fn validate_graph_node_id(graph_node_id: &str) -> Result<(), String> {
    let p = Path::new(graph_node_id);
    // Reject anything that resolves to a different final component than the raw string,
    // which catches separators, `..`, absolute paths, and multi-component paths.
    let is_plain = p
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n == graph_node_id)
        .unwrap_or(false);
    if is_plain {
        Ok(())
    } else {
        Err(format!(
            "invalid graph_node_id {:?}: must be a plain identifier with no path separators or '..'",
            graph_node_id
        ))
    }
}

/// Copy an external image into `<workspace_root>/assets/<graph_node_id>/<file>` and
/// return the workspace-relative path. Errors are returned as strings (Tauri command shape).
pub fn import_node_image(request: ImportNodeImageRequest) -> Result<String, String> {
    validate_graph_node_id(&request.graph_node_id)?;

    let source = Path::new(&request.source_absolute_path);
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "source path has no file name".to_string())?;

    let relative = compute_node_asset_relative_path(&request.graph_node_id, file_name);

    let target = Path::new(&request.workspace_root)
        .join("assets")
        .join(&request.graph_node_id)
        .join(file_name);

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    // Compatibility path for already-shipped callers. New writes use
    // `attach_node_attachment_at_path` below. Never silently overwrite a
    // distinct same-named asset in a legacy node folder.
    if target.exists() && !same_file_content(source, &target)? {
        return Err(format!(
            "refusing to overwrite existing asset with the same filename: {}",
            target.display()
        ));
    }
    if !target.exists() {
        fs::copy(source, &target).map_err(|error| error.to_string())?;
    }

    Ok(relative)
}

#[tauri::command]
pub fn import_node_image_command(request: ImportNodeImageRequest) -> Result<String, String> {
    import_node_image(request)
}

/// Tauri boundary for durable attachment insertion. The write is local-first:
/// the managed bytes, attachment identity, role usage, local document and
/// metadata revision are either committed together or none are visible.
#[tauri::command]
pub async fn attach_node_attachment_command(
    request: AttachNodeAttachmentRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<AttachNodeAttachmentResult, String> {
    let path = resolve_db_path(&request.database_path, &api_state)?;
    attach_node_attachment_at_path(&path, request)
}

pub fn attach_node_attachment_at_path(
    database_path: impl AsRef<Path>,
    request: AttachNodeAttachmentRequest,
) -> Result<AttachNodeAttachmentResult, String> {
    attach_node_attachment_at_path_with_hook(database_path.as_ref(), request, || Ok(()))
}

fn attach_node_attachment_at_path_with_hook<F>(
    database_path: &Path,
    request: AttachNodeAttachmentRequest,
    before_commit: F,
) -> Result<AttachNodeAttachmentResult, String>
where
    F: FnOnce() -> Result<(), String>,
{
    validate_graph_node_id(&request.graph_node_id)?;
    validate_kind_and_role(&request.kind, &request.role)?;
    let source = canonical_source_file(&request.source_absolute_path)?;
    let source_file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "source path has no valid UTF-8 filename".to_string())?;
    let source_hash = sha256_file(&source)?;
    let database = Database::open(database_path).map_err(|error| error.to_string())?;
    let attachment_repo = NodeAttachmentRepository::new(database.connection());
    let document_repo = NodeDocumentRepository::new(database.connection());

    let existing = attachment_repo
        .find_by_content_identity(&request.graph_node_id, &source_hash)
        .map_err(|error| error.to_string())?;
    let new_attachment = existing.is_none();
    let attachment = existing.unwrap_or_else(|| {
        let id = uuid::Uuid::new_v4().to_string();
        let file_name = portable_file_name(source_file_name);
        let managed_path = format!("assets/{}/{source_hash}-{file_name}", request.graph_node_id);
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        NodeAttachment {
            id,
            graph_node_id: request.graph_node_id.clone(),
            managed_path,
            original_filename: source_file_name.to_string(),
            mime_type: mime_type_for_file_name(source_file_name),
            kind: request.kind.clone(),
            content_hash: source_hash.clone(),
            caption: request.caption.clone(),
            role: request.role.clone(),
            provenance_source_path: source.to_string_lossy().into_owned(),
            created_at: now.clone(),
            updated_at: now,
        }
    });

    let workspace_root = Path::new(&request.workspace_root);
    if !workspace_root.is_dir() {
        return Err(format!(
            "workspace root is not a directory: {}",
            workspace_root.display()
        ));
    }
    let target = portable_path_to_workspace_path(workspace_root, &attachment.managed_path)?;
    let staged = if new_attachment {
        Some(stage_file(&source, &target, &attachment.id)?)
    } else {
        if !target.is_file() {
            return Err(format!(
                "attachment database row points to missing managed file: {}",
                target.display()
            ));
        }
        Some(PathBuf::new())
    };

    let transaction =
        TransactionGuard::begin(database.connection()).map_err(|error| error.to_string())?;
    let result = (|| -> Result<AttachNodeAttachmentResult, String> {
        let base_document = ensure_local_document(
            &document_repo,
            &request.graph_node_id,
            &request.authoritative_document,
        )?;

        if new_attachment {
            attachment_repo
                .insert(&attachment)
                .map_err(|error| error.to_string())?;
        }
        attachment_repo
            .ensure_usage(&attachment.id, &request.role)
            .map_err(|error| error.to_string())?;

        let document = if request.role == "cover" {
            base_document
        } else {
            append_attachment_document_block(
                &document_repo,
                &base_document,
                &attachment,
                &request.role,
            )?
        };

        before_commit()?;
        if new_attachment {
            let staged_path = staged.as_ref().expect("new attachment has staged file");
            fs::rename(staged_path, &target).map_err(|error| error.to_string())?;
        }
        Ok(AttachNodeAttachmentResult {
            attachment: attachment.clone(),
            document,
            expected_remote_origin: request.authoritative_document.content_origin.clone(),
            expected_remote_revision: request.authoritative_document.content_revision,
        })
    })();

    match result {
        Ok(result) => {
            if let Err(error) = transaction.commit() {
                if new_attachment {
                    fs::remove_file(&target).ok();
                }
                return Err(error.to_string());
            }
            Ok(result)
        }
        Err(error) => {
            if new_attachment {
                if let Some(staged_path) = staged.as_ref() {
                    fs::remove_file(staged_path).ok();
                }
                // If the rename happened before a later error, remove the
                // unique new target too. The transaction drop rolls DB state
                // back, so no visible attachment or document remains.
                fs::remove_file(&target).ok();
            }
            Err(error)
        }
    }
}

fn ensure_local_document(
    repository: &NodeDocumentRepository<'_>,
    graph_node_id: &str,
    snapshot: &AuthoritativeDocumentSnapshot,
) -> Result<LocalNodeDocument, String> {
    if let Some(document) = repository
        .get_node_document(graph_node_id)
        .map_err(|error| error.to_string())?
    {
        return Ok(document);
    }
    let origin = ContentOrigin::try_from(snapshot.content_origin.clone())?;
    let entity_type = EntityType::try_from(snapshot.entity_type.clone())?;
    let input = DocumentContentInput {
        graph_node_id: graph_node_id.to_string(),
        body: snapshot.body.clone(),
        summary: snapshot.summary.clone(),
        content_origin: origin,
        content_revision: snapshot.content_revision,
        body_source_coordinates: snapshot.body_source_coordinates.clone(),
        neo4j_synced: true,
    };
    let projection = DocumentMetadataProjection {
        entity_type: entity_type.as_str().to_string(),
        title: snapshot.title.clone(),
        schema_version: snapshot.schema_version,
    };
    match repository
        .apply_reconciliation_with_projection_in_existing_transaction(
            &input,
            None,
            Some(&projection),
        )
        .map_err(|error| error.to_string())?
    {
        NodeDocumentMutation::Created
        | NodeDocumentMutation::Updated
        | NodeDocumentMutation::Preserved => {}
        NodeDocumentMutation::Conflict { reason, .. } => {
            return Err(format!("could not initialise local document: {reason}"));
        }
    }
    repository
        .get_node_document(graph_node_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "local document initialisation produced no document".to_string())
}

fn append_attachment_document_block(
    repository: &NodeDocumentRepository<'_>,
    base: &LocalNodeDocument,
    attachment: &NodeAttachment,
    role: &str,
) -> Result<LocalNodeDocument, String> {
    let body = append_attachment_block(&base.body, attachment, role)?;
    if body == base.body {
        return Ok(base.clone());
    }
    let next_revision = base
        .content_revision
        .checked_add(1)
        .ok_or_else(|| "content revision exceeds JavaScript safe integer".to_string())?;
    let input = DocumentContentInput {
        graph_node_id: base.graph_node_id.clone(),
        body,
        summary: base.summary.clone(),
        content_origin: ContentOrigin::UserAuthored,
        content_revision: next_revision,
        body_source_coordinates: base.body_source_coordinates.clone(),
        neo4j_synced: false,
    };
    match repository
        .apply_reconciliation_with_projection_in_existing_transaction(
            &input,
            Some(base.content_revision),
            None,
        )
        .map_err(|error| error.to_string())?
    {
        NodeDocumentMutation::Updated
        | NodeDocumentMutation::Created
        | NodeDocumentMutation::Preserved => {}
        NodeDocumentMutation::Conflict { reason, .. } => {
            return Err(format!(
                "could not append attachment to local document: {reason}"
            ));
        }
    }
    repository
        .get_node_document(&base.graph_node_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "attachment document write produced no document".to_string())
}

fn append_attachment_block(
    body: &str,
    attachment: &NodeAttachment,
    role: &str,
) -> Result<String, String> {
    let trimmed = body.trim();
    let mut blocks = if trimmed.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str::<Vec<serde_json::Value>>(trimmed)
            .map_err(|_| "local document body is not a BlockNote block array".to_string())?
    };
    let contains_attachment = blocks.iter().any(|block| {
        block
            .get("props")
            .and_then(|props| props.get("attachmentId"))
            .and_then(serde_json::Value::as_str)
            == Some(attachment.id.as_str())
    });
    if contains_attachment {
        return Ok(serde_json::to_string(&blocks).expect("serialise parsed JSON"));
    }
    let block = if role == "inline" {
        serde_json::json!({
            "type": "image",
            "props": {
                "url": attachment.managed_path,
                "caption": attachment.caption,
                "attachmentId": attachment.id,
            }
        })
    } else {
        serde_json::json!({
            "type": "paragraph",
            "props": { "attachmentId": attachment.id },
            "content": [{
                "type": "text",
                "text": format!("Attached file: {} ({})", attachment.original_filename, attachment.managed_path),
            }]
        })
    };
    blocks.push(block);
    serde_json::to_string(&blocks).map_err(|error| error.to_string())
}

fn validate_kind_and_role(kind: &str, role: &str) -> Result<(), String> {
    if !matches!(kind, "image" | "file") {
        return Err("attachment kind must be image or file".into());
    }
    if !matches!(role, "inline" | "cover" | "file") {
        return Err("attachment role must be inline, cover, or file".into());
    }
    if kind == "image" && role == "file" {
        return Err("an image attachment must be inline or cover".into());
    }
    if kind == "file" && role != "file" {
        return Err("a file attachment must use the file role".into());
    }
    Ok(())
}

fn canonical_source_file(source_absolute_path: &str) -> Result<PathBuf, String> {
    let source = fs::canonicalize(source_absolute_path).map_err(|error| error.to_string())?;
    let metadata = fs::metadata(&source).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err(format!(
            "attachment source is not a file: {}",
            source.display()
        ));
    }
    Ok(source)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn same_file_content(left: &Path, right: &Path) -> Result<bool, String> {
    Ok(sha256_file(left)? == sha256_file(right)?)
}

fn portable_file_name(file_name: &str) -> String {
    let candidate = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    candidate
        .chars()
        .map(|character| match character {
            '/' | '\\' | '\0' => '_',
            value => value,
        })
        .collect()
}

fn portable_path_to_workspace_path(
    workspace_root: &Path,
    managed_path: &str,
) -> Result<PathBuf, String> {
    if !managed_path.starts_with("assets/")
        || managed_path.contains("..")
        || managed_path.contains('\\')
    {
        return Err("managed attachment path must remain below assets/".into());
    }
    Ok(workspace_root.join(managed_path))
}

fn stage_file(source: &Path, target: &Path, attachment_id: &str) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "attachment target has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let staged = parent.join(format!(".{attachment_id}.stage"));
    fs::copy(source, &staged).map_err(|error| error.to_string())?;
    Ok(staged)
}

fn mime_type_for_file_name(file_name: &str) -> String {
    match Path::new(file_name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn computes_forward_slash_relative_path_under_node_folder() {
        let rel = compute_node_asset_relative_path("n1", "cat.png");
        assert_eq!(rel, "assets/n1/cat.png");
    }

    #[test]
    fn strips_directory_components_from_source_file_name() {
        let rel = compute_node_asset_relative_path("n1", "weird/../cat.png");
        assert_eq!(rel, "assets/n1/cat.png");
    }

    #[test]
    fn imports_file_into_workspace_assets_and_returns_relative_path() {
        let temp = std::env::temp_dir().join(format!("ws4-assets-{}", std::process::id()));
        let workspace = temp.join("workspace");
        let source_dir = temp.join("src");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("cat.png");
        fs::write(&source, b"PNGDATA").unwrap();

        let request = ImportNodeImageRequest {
            workspace_root: workspace.to_string_lossy().to_string(),
            graph_node_id: "n1".to_string(),
            source_absolute_path: source.to_string_lossy().to_string(),
        };

        let rel = import_node_image(request).unwrap();
        assert_eq!(rel, "assets/n1/cat.png");

        let copied = workspace.join("assets").join("n1").join("cat.png");
        assert_eq!(fs::read(&copied).unwrap(), b"PNGDATA");

        fs::remove_dir_all(&temp).ok();
    }

    #[test]
    fn rejects_graph_node_id_with_path_traversal() {
        let temp =
            std::env::temp_dir().join(format!("ws4-assets-traversal-{}", std::process::id()));
        let workspace = temp.join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        // A valid source file so the error must come from graph_node_id validation.
        let source_dir = temp.join("src");
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("cat.png");
        fs::write(&source, b"PNGDATA").unwrap();

        for bad_id in &["../../etc", "../sibling", "/absolute", "a/b"] {
            let request = ImportNodeImageRequest {
                workspace_root: workspace.to_string_lossy().to_string(),
                graph_node_id: bad_id.to_string(),
                source_absolute_path: source.to_string_lossy().to_string(),
            };
            assert!(
                import_node_image(request).is_err(),
                "expected Err for graph_node_id {:?}",
                bad_id
            );
        }

        fs::remove_dir_all(&temp).ok();
    }

    #[test]
    fn errors_when_source_file_missing() {
        let temp = std::env::temp_dir().join(format!("ws4-assets-missing-{}", std::process::id()));
        let workspace = temp.join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let request = ImportNodeImageRequest {
            workspace_root: workspace.to_string_lossy().to_string(),
            graph_node_id: "n1".to_string(),
            source_absolute_path: workspace
                .join("does-not-exist.png")
                .to_string_lossy()
                .to_string(),
        };

        assert!(import_node_image(request).is_err());
        fs::remove_dir_all(&temp).ok();
    }

    #[test]
    fn attaches_an_image_into_a_fresh_local_document_and_survives_reopen() {
        // This is deliberately a real workspace and a real migrated SQLite
        // database: image attachment cannot be proved with an in-memory mock
        // because its contract is a durable portable asset plus document row.
        let temp =
            std::env::temp_dir().join(format!("attachment-service-{}", uuid::Uuid::new_v4()));
        let workspace = temp.join("workspace");
        let source_dir = temp.join("source");
        let database_path = temp.join("workspace.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("portrait.png");
        fs::write(&source, b"real-image-bytes").unwrap();

        let result = attach_node_attachment_at_path(
            &database_path,
            AttachNodeAttachmentRequest {
                database_path: None,
                workspace_root: workspace.to_string_lossy().into_owned(),
                graph_node_id: "timeline-record".into(),
                source_absolute_path: source.to_string_lossy().into_owned(),
                kind: "image".into(),
                role: "inline".into(),
                caption: "A portrait".into(),
                authoritative_document: AuthoritativeDocumentSnapshot {
                    body: "[]".into(),
                    summary: "A timeline record".into(),
                    content_origin: "seed".into(),
                    content_revision: 0,
                    body_source_coordinates: vec!["episodes/2.md#portrait".into()],
                    entity_type: "Event".into(),
                    title: "Timeline record".into(),
                    schema_version: 1,
                },
            },
        )
        .expect("attachment succeeds without a pre-existing local document");

        assert!(result
            .attachment
            .managed_path
            .starts_with("assets/timeline-record/"));
        assert!(workspace.join(&result.attachment.managed_path).is_file());
        assert!(result
            .document
            .body
            .contains(&result.attachment.managed_path));

        let reopened = crate::db::connection::Database::open(&database_path)
            .expect("reopen migrated SQLite database");
        let stored = crate::db::repositories::NodeDocumentRepository::new(reopened.connection())
            .get_node_document("timeline-record")
            .expect("read durable document")
            .expect("document is durable");
        assert_eq!(stored.body, result.document.body);
        assert!(stored.body.contains(&result.attachment.id));

        fs::remove_dir_all(&temp).ok();
    }

    #[test]
    fn preserves_distinct_same_named_files_as_distinct_content_addressed_assets() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let left = directory.path().join("left");
        let right = directory.path().join("right");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&left).unwrap();
        fs::create_dir_all(&right).unwrap();
        let first_source = left.join("same-name.png");
        let second_source = right.join("same-name.png");
        fs::write(&first_source, b"first image bytes").unwrap();
        fs::write(&second_source, b"second image bytes").unwrap();

        let first = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n1", &first_source, "inline"),
        )
        .expect("first asset imports");
        let second = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n1", &second_source, "inline"),
        )
        .expect("second same-named asset imports without overwriting the first");

        assert_ne!(first.attachment.id, second.attachment.id);
        assert_ne!(
            first.attachment.managed_path,
            second.attachment.managed_path
        );
        assert_eq!(
            fs::read(workspace.join(&first.attachment.managed_path)).unwrap(),
            b"first image bytes"
        );
        assert_eq!(
            fs::read(workspace.join(&second.attachment.managed_path)).unwrap(),
            b"second image bytes"
        );
    }

    #[test]
    fn failed_attachment_rolls_back_attachment_and_document_state() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("portrait.png");
        fs::write(&source, b"bytes that must not become visible").unwrap();

        let error = attach_node_attachment_at_path_with_hook(
            &database_path,
            attachment_request(&workspace, "n-failing", &source, "inline"),
            || Err("injected pre-commit failure".into()),
        )
        .expect_err("injected failure rejects the import");
        assert!(error.contains("injected pre-commit failure"));

        let database = crate::db::connection::Database::open(&database_path).unwrap();
        assert!(
            crate::db::repositories::NodeDocumentRepository::new(database.connection())
                .get_node_document("n-failing")
                .unwrap()
                .is_none()
        );
        let count: i64 = database
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM node_attachment WHERE graph_node_id='n-failing'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
        assert!(
            !workspace.join("assets/n-failing").exists()
                || fs::read_dir(workspace.join("assets/n-failing"))
                    .unwrap()
                    .next()
                    .is_none()
        );
    }

    #[test]
    fn cover_and_inline_share_one_attachment_identity_and_portable_path() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("shared.png");
        fs::write(&source, b"one identity, multiple presentation roles").unwrap();

        let inline = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-shared", &source, "inline"),
        )
        .expect("inline attachment imports");
        let cover = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-shared", &source, "cover"),
        )
        .expect("cover reuses existing attachment bytes and identity");

        assert_eq!(inline.attachment.id, cover.attachment.id);
        assert_eq!(
            inline.attachment.managed_path,
            cover.attachment.managed_path
        );
        let reopened = crate::db::connection::Database::open(&database_path).unwrap();
        let usages = crate::db::repositories::NodeAttachmentRepository::new(reopened.connection())
            .usages(&inline.attachment.id)
            .unwrap();
        assert_eq!(usages, vec!["cover", "inline"]);
        assert_eq!(
            fs::read(workspace.join(&cover.attachment.managed_path)).unwrap(),
            b"one identity, multiple presentation roles"
        );
        assert_eq!(inline.document.body, cover.document.body);
    }

    #[test]
    fn arbitrary_files_use_the_same_durable_service_with_a_file_role() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("evidence.pdf");
        fs::write(&source, b"%PDF-real-source-bytes").unwrap();

        let mut request = attachment_request(&workspace, "n-file", &source, "file");
        request.kind = "file".into();
        request.caption = "Primary evidence".into();
        let result = attach_node_attachment_at_path(&database_path, request)
            .expect("file attachment uses the shared durable service");

        assert_eq!(result.attachment.kind, "file");
        assert_eq!(result.attachment.role, "file");
        assert_eq!(result.attachment.mime_type, "application/pdf");
        assert!(result.document.body.contains("Attached file: evidence.pdf"));
        assert!(workspace.join(&result.attachment.managed_path).is_file());
    }

    fn attachment_request(
        workspace: &Path,
        graph_node_id: &str,
        source: &Path,
        role: &str,
    ) -> AttachNodeAttachmentRequest {
        AttachNodeAttachmentRequest {
            database_path: None,
            workspace_root: workspace.to_string_lossy().into_owned(),
            graph_node_id: graph_node_id.into(),
            source_absolute_path: source.to_string_lossy().into_owned(),
            kind: "image".into(),
            role: role.into(),
            caption: "A source-derived image".into(),
            authoritative_document: AuthoritativeDocumentSnapshot {
                body: "[]".into(),
                summary: "A timeline record".into(),
                content_origin: "seed".into(),
                content_revision: 0,
                body_source_coordinates: vec!["episodes/2.md#image".into()],
                entity_type: "Event".into(),
                title: "Timeline record".into(),
                schema_version: 1,
            },
        }
    }
}
