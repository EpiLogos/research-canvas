use std::{
    collections::BTreeSet,
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
            graph::{ContentOrigin, EntityType, GraphNode},
            DocumentContentInput, DocumentMetadataProjection, GraphNodeMetadataRepository,
            LocalNodeDocument, NodeAttachment, NodeAttachmentRepository, NodeDocumentMutation,
            NodeDocumentRepository, SyncState,
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
    pub authoritative_document: Option<AuthoritativeDocumentSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachNodeAttachmentResult {
    pub attachment: NodeAttachment,
    pub document: LocalNodeDocument,
    /// The local graph projection after the one SQLite attachment transaction.
    /// It is the reader's immediately visible state and does not depend on a
    /// live `SharedGraphState`.
    pub graph_node: GraphNode,
    /// The remote baseline supplied by the caller or recovered from a synced
    /// local projection. It lets the JS transport make a best-effort CAS only
    /// after the local attachment transaction has succeeded.
    pub expected_remote_origin: String,
    pub expected_remote_revision: i64,
    /// A caller-provided or synced local baseline is safe to CAS after the
    /// local write. A pending local-only projection is not: it has no
    /// trustworthy remote revision, so the renderer must retain it locally.
    pub remote_sync_eligible: bool,
}

#[derive(Debug, Clone)]
struct AttachmentBaseline {
    snapshot: AuthoritativeDocumentSnapshot,
    remote_sync_eligible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadNodeAttachmentPresentationRequest {
    #[serde(default)]
    pub database_path: Option<String>,
    pub graph_node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeAttachmentPresentation {
    pub cover: Option<NodeAttachment>,
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

/// Resolves the canonical, durable cover independently from any canvas
/// layout. Readers use this after reload; canvas hydration folds it into an
/// ephemeral thumbnail projection for the same reason.
#[tauri::command]
pub async fn read_node_attachment_presentation_command(
    request: ReadNodeAttachmentPresentationRequest,
    api_state: tauri::State<'_, SharedApiState>,
) -> Result<NodeAttachmentPresentation, String> {
    validate_graph_node_id(&request.graph_node_id)?;
    let path = resolve_db_path(&request.database_path, &api_state)?;
    read_node_attachment_presentation_at_path(&path, &request.graph_node_id)
}

pub fn read_node_attachment_presentation_at_path(
    database_path: impl AsRef<Path>,
    graph_node_id: &str,
) -> Result<NodeAttachmentPresentation, String> {
    validate_graph_node_id(graph_node_id)?;
    let database = Database::open(database_path).map_err(|error| error.to_string())?;
    let cover = NodeAttachmentRepository::new(database.connection())
        .selected_cover_for_node(graph_node_id)
        .map_err(|error| error.to_string())?;
    Ok(NodeAttachmentPresentation { cover })
}

pub fn attach_node_attachment_at_path(
    database_path: impl AsRef<Path>,
    request: AttachNodeAttachmentRequest,
) -> Result<AttachNodeAttachmentResult, String> {
    attach_node_attachment_at_path_with_hooks(
        database_path.as_ref(),
        request,
        |_| Ok(()),
        || Ok(()),
    )
}

/// The hooks make the filesystem/SQLite boundary observable in real native
/// tests. Production uses no-op hooks; the service itself never relies on
/// timing for correctness.
fn attach_node_attachment_at_path_with_hooks<AfterStage, BeforeCommit>(
    database_path: &Path,
    request: AttachNodeAttachmentRequest,
    after_stage: AfterStage,
    before_commit: BeforeCommit,
) -> Result<AttachNodeAttachmentResult, String>
where
    AfterStage: FnOnce(&Path) -> Result<(), String>,
    BeforeCommit: FnOnce() -> Result<(), String>,
{
    validate_graph_node_id(&request.graph_node_id)?;
    validate_kind_and_role(&request.kind, &request.role)?;
    let source = canonical_source_file(&request.source_absolute_path)?;
    let workspace_root = Path::new(&request.workspace_root);
    if !workspace_root.is_dir() {
        return Err(format!(
            "workspace root is not a directory: {}",
            workspace_root.display()
        ));
    }
    let source_file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "source path has no valid UTF-8 filename".to_string())?;
    let database = Database::open(database_path).map_err(|error| error.to_string())?;
    let attachment_repo = NodeAttachmentRepository::new(database.connection());
    let document_repo = NodeDocumentRepository::new(database.connection());
    let metadata_repo = GraphNodeMetadataRepository::new(database.connection());
    // Every attachment operation obtains the SQLite writer lock before
    // sweeping or staging bytes. That makes the recovery pass safe across
    // processes: another import cannot have an uncommitted staged or
    // published file while this operation decides whether it is unreferenced.
    let transaction =
        TransactionGuard::begin(database.connection()).map_err(|error| error.to_string())?;
    let mut staged: Option<PathBuf> = None;
    let mut published_target: Option<PathBuf> = None;
    let result = (|| -> Result<AttachNodeAttachmentResult, String> {
        // Resolve this before touching the filesystem. A caller snapshot is
        // useful when it is available, but the opened SQLite document and
        // metadata projection are the offline authority. In particular, a
        // caller snapshot never replaces pending local authored content.
        let baseline = resolve_attachment_baseline(
            &document_repo,
            &metadata_repo,
            &request.graph_node_id,
            request.authoritative_document.as_ref(),
        )?;
        recover_attachment_files(workspace_root, &attachment_repo)?;

        // Copy before hashing: attachment identity must name the immutable
        // staged bytes we will publish, not a mutable source file that can
        // change mid-import.
        let staged_path = stage_source_file(workspace_root, &source)?;
        staged = Some(staged_path);
        let staged_path = staged
            .as_deref()
            .ok_or_else(|| "attachment staging path was not created".to_string())?;
        after_stage(staged_path)?;
        let source_hash = sha256_file(staged_path)?;
        let candidate = new_attachment_identity(&request, source_file_name, &source, &source_hash);

        // This check is deliberately inside BEGIN IMMEDIATE. A concurrent
        // import can only see a committed identity here, so it cannot insert
        // a duplicate row or cause recovery to delete another invocation's
        // published bytes.
        let existing = attachment_repo
            .find_by_content_identity(&request.graph_node_id, &source_hash)
            .map_err(|error| error.to_string())?;
        if let Some(existing) = &existing {
            if existing.kind != request.kind {
                return Err(format!(
                    "attachment content identity already exists as kind {}; cannot reuse it as {}",
                    existing.kind, request.kind
                ));
            }
        }
        let new_attachment = existing.is_none();
        let attachment = existing.unwrap_or_else(|| candidate.clone());
        let target = portable_path_to_workspace_path(workspace_root, &attachment.managed_path)?;
        if !new_attachment && !target.is_file() {
            return Err(format!(
                "attachment database row points to missing managed file: {}",
                target.display()
            ));
        }
        // A repeated request that names an already-recorded attachment is
        // idempotent, even though the first request made the local document
        // pending remote sync. Any *new* attachment still has to protect that
        // pending authored work through `ensure_local_document`.
        let base_document = if !new_attachment {
            document_repo
                .get_node_document(&request.graph_node_id)
                .map_err(|error| error.to_string())?
                .filter(|document| {
                    request.role == "cover"
                        || document_contains_attachment(&document.body, &attachment.id)
                })
                .map(Ok)
                .unwrap_or_else(|| {
                    ensure_local_document(
                        &document_repo,
                        &request.graph_node_id,
                        &baseline.snapshot,
                    )
                })?
        } else {
            ensure_local_document(&document_repo, &request.graph_node_id, &baseline.snapshot)?
        };

        if new_attachment {
            attachment_repo
                .insert(&attachment)
                .map_err(|error| error.to_string())?;
        }
        attachment_repo
            .ensure_usage(&attachment.id, &request.role)
            .map_err(|error| error.to_string())?;
        if request.role == "cover" {
            attachment_repo
                .select_cover(&request.graph_node_id, &attachment.id)
                .map_err(|error| error.to_string())?;
        }

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
        let graph_node =
            graph_node_from_local_projection(&metadata_repo, &request.graph_node_id, &document)?;

        before_commit()?;
        if new_attachment {
            if publish_staged_file(staged_path, &target)? {
                published_target = Some(target);
            }
        }
        Ok(AttachNodeAttachmentResult {
            attachment: attachment.clone(),
            document,
            graph_node,
            expected_remote_origin: baseline.snapshot.content_origin,
            expected_remote_revision: baseline.snapshot.content_revision,
            remote_sync_eligible: baseline.remote_sync_eligible,
        })
    })();

    match result {
        Ok(result) => {
            if let Err(error) = transaction.commit() {
                if let Some(target) = published_target.as_ref() {
                    fs::remove_file(target).ok();
                }
                if let Some(staged) = staged.as_ref() {
                    fs::remove_file(staged).ok();
                }
                return Err(error.to_string());
            }
            if let Some(staged) = staged.as_ref() {
                fs::remove_file(staged).ok();
            }
            Ok(result)
        }
        Err(error) => {
            if let Some(staged) = staged.as_ref() {
                fs::remove_file(staged).ok();
            }
            if let Some(target) = published_target.as_ref() {
                // Delete only a path we created with create-new semantics;
                // never remove an existing committed attachment on conflict.
                fs::remove_file(target).ok();
            }
            Err(error)
        }
    }
}

fn resolve_attachment_baseline(
    documents: &NodeDocumentRepository<'_>,
    metadata: &GraphNodeMetadataRepository<'_>,
    graph_node_id: &str,
    caller_snapshot: Option<&AuthoritativeDocumentSnapshot>,
) -> Result<AttachmentBaseline, String> {
    if let Some(snapshot) = caller_snapshot {
        return Ok(AttachmentBaseline {
            snapshot: snapshot.clone(),
            remote_sync_eligible: true,
        });
    }

    let metadata = metadata
        .get(graph_node_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            format!(
                "attachment needs either a caller snapshot or a local graph metadata projection for {graph_node_id}"
            )
        })?;
    let document = documents
        .get_node_document(graph_node_id)
        .map_err(|error| error.to_string())?;
    if let Some(document) = &document {
        if document.content_origin != metadata.content_origin
            || document.content_revision != metadata.content_revision
            || document.body_source_coordinates != metadata.body_source_coordinates
        {
            return Err(format!(
                "local document and graph metadata projections disagree for {graph_node_id}"
            ));
        }
    }
    let remote_sync_eligible = metadata.sync_state == SyncState::Synced
        && document
            .as_ref()
            .map(|document| document.neo4j_synced)
            .unwrap_or(true);
    let (body, summary, content_origin, content_revision, body_source_coordinates) = match document
    {
        Some(document) => (
            document.body,
            document.summary,
            document.content_origin.as_str().to_string(),
            document.content_revision,
            document.body_source_coordinates,
        ),
        None => (
            "[]".to_string(),
            String::new(),
            metadata.content_origin.as_str().to_string(),
            metadata.content_revision,
            metadata.body_source_coordinates.clone(),
        ),
    };
    Ok(AttachmentBaseline {
        snapshot: AuthoritativeDocumentSnapshot {
            body,
            summary,
            content_origin,
            content_revision,
            body_source_coordinates,
            entity_type: metadata.entity_type.as_str().to_string(),
            title: metadata.title,
            schema_version: metadata.schema_version,
        },
        remote_sync_eligible,
    })
}

fn graph_node_from_local_projection(
    metadata_repository: &GraphNodeMetadataRepository<'_>,
    graph_node_id: &str,
    document: &LocalNodeDocument,
) -> Result<GraphNode, String> {
    let record = metadata_repository
        .get_with_timestamps(graph_node_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("local graph metadata projection is missing for {graph_node_id}"))?;
    let metadata = record.metadata;
    Ok(GraphNode {
        graph_node_id: metadata.graph_node_id,
        entity_type: metadata.entity_type,
        title: metadata.title,
        body: document.body.clone(),
        summary: document.summary.clone(),
        archetypal_resonance: metadata.archetypal_resonance,
        coordinate: metadata.coordinate,
        source_coordinates: metadata.source_coordinates,
        evidence_tags: metadata.evidence_tags,
        source_kind: metadata.source_kind,
        content_origin: Some(document.content_origin),
        content_revision: Some(document.content_revision),
        seed_schema_version: metadata.seed_schema_version,
        body_source_coordinates: document.body_source_coordinates.clone(),
        historicity: metadata.historicity,
        claim_kind: metadata.claim_kind,
        evidence_status: metadata.evidence_status,
        temporal_role: metadata.temporal_role,
        place_coverage: metadata.place_coverage,
        ql_form: metadata.ql_form,
        ql_unit_id: metadata.ql_unit_id,
        ql_arc: metadata.ql_arc,
        ql_topology: metadata.ql_topology,
        ql_schema_version: metadata.ql_schema_version,
        ql_source_coordinates: metadata.ql_source_coordinates,
        ql_completeness_status: metadata.ql_completeness_status,
        is_temporal: metadata.is_temporal,
        valid_from: metadata.valid_from,
        valid_to: metadata.valid_to,
        temporal_precision: metadata.temporal_precision,
        created_at: record.created_at,
        updated_at: record.updated_at,
    })
}

fn ensure_local_document(
    repository: &NodeDocumentRepository<'_>,
    graph_node_id: &str,
    snapshot: &AuthoritativeDocumentSnapshot,
) -> Result<LocalNodeDocument, String> {
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
    if let Some(document) = repository
        .get_node_document(graph_node_id)
        .map_err(|error| error.to_string())?
    {
        if !document.neo4j_synced {
            // This operation is a monotonic local merge: it appends a new
            // attachment block to the already-durable user body and never
            // substitutes the supplied remote snapshot for that body. Keep
            // the document pending sync, rather than losing authored work or
            // pretending it has been reconciled remotely.
            return Ok(document);
        }
        if document.content_revision > snapshot.content_revision {
            return Err(format!(
                "local synced document revision {} is ahead of authoritative remote revision {}",
                document.content_revision, snapshot.content_revision
            ));
        }
        if document.content_revision == snapshot.content_revision
            && (document.body != snapshot.body
                || document.summary != snapshot.summary
                || document.content_origin != origin
                || document.body_source_coordinates != snapshot.body_source_coordinates)
        {
            return Err(
                "local synced document differs from the authoritative remote snapshot at the same revision"
                    .into(),
            );
        }
        // A synced old local document is a cache, not competing authored
        // work. Advance it to the supplied authoritative snapshot inside the
        // attachment transaction before appending user content. Supplying the
        // projection also repairs legitimate legacy rows that predate local
        // graph metadata.
        let decision = repository
            .apply_reconciliation_with_projection_in_existing_transaction(
                &input,
                Some(document.content_revision),
                Some(&projection),
            )
            .map_err(|error| error.to_string())?;
        if let NodeDocumentMutation::Conflict { reason, .. } = decision {
            return Err(format!("could not reconcile local document: {reason}"));
        }
        return repository
            .get_node_document(graph_node_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "local document reconciliation produced no document".to_string());
    }
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
    let contains_attachment = blocks_contain_attachment(&blocks, &attachment.id);
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

fn document_contains_attachment(body: &str, attachment_id: &str) -> bool {
    serde_json::from_str::<Vec<serde_json::Value>>(body)
        .map(|blocks| blocks_contain_attachment(&blocks, attachment_id))
        .unwrap_or(false)
}

fn blocks_contain_attachment(blocks: &[serde_json::Value], attachment_id: &str) -> bool {
    blocks.iter().any(|block| {
        block
            .get("props")
            .and_then(|props| props.get("attachmentId"))
            .and_then(serde_json::Value::as_str)
            == Some(attachment_id)
    })
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

fn new_attachment_identity(
    request: &AttachNodeAttachmentRequest,
    source_file_name: &str,
    source: &Path,
    content_hash: &str,
) -> NodeAttachment {
    let node_key = sha256_text(&request.graph_node_id);
    let extension = safe_extension(source_file_name);
    let managed_path = match extension {
        Some(extension) => format!("assets/attachments/{node_key}/{content_hash}.{extension}"),
        None => format!("assets/attachments/{node_key}/{content_hash}"),
    };
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    NodeAttachment {
        id: uuid::Uuid::new_v4().to_string(),
        graph_node_id: request.graph_node_id.clone(),
        managed_path,
        original_filename: source_file_name.to_string(),
        mime_type: mime_type_for_file_name(source_file_name),
        kind: request.kind.clone(),
        content_hash: content_hash.to_string(),
        caption: request.caption.clone(),
        role: request.role.clone(),
        provenance_source_path: source.to_string_lossy().into_owned(),
        created_at: now.clone(),
        updated_at: now,
    }
}

fn sha256_text(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn safe_extension(file_name: &str) -> Option<String> {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())?
        .to_ascii_lowercase();
    if extension.is_empty()
        || extension.len() > 16
        || !extension.bytes().all(|byte| byte.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(extension)
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

/// Recovers only crash residue in the attachment service's private
/// namespaces. This runs while the caller owns SQLite's writer transaction;
/// a concurrent attachment cannot publish a file until after it has a row in
/// that transaction, so an unreferenced file here is safe to remove.
fn recover_attachment_files(
    workspace_root: &Path,
    attachment_repo: &NodeAttachmentRepository<'_>,
) -> Result<(), String> {
    sweep_staging_residue(workspace_root)?;

    let managed_root = workspace_root.join("assets").join("attachments");
    let referenced_paths = attachment_repo
        .managed_paths()
        .map_err(|error| error.to_string())?
        .into_iter()
        // Legacy assets/<node-id>/ files are not owned by this new service
        // namespace and are deliberately outside recovery's remit.
        .filter(|managed_path| managed_path.starts_with("assets/attachments/"))
        .map(|managed_path| {
            let managed_path = portable_path_to_workspace_path(workspace_root, &managed_path)?;
            managed_path
                .strip_prefix(&managed_root)
                .map(Path::to_path_buf)
                .map_err(|_| {
                    "managed attachment path escaped the dedicated attachments namespace"
                        .to_string()
                })
        })
        .collect::<Result<BTreeSet<_>, _>>()?;

    sweep_unreferenced_managed_files(&managed_root, &managed_root, &referenced_paths)
}

/// A stage or journal is only created while the writer transaction is held.
/// If this recovery pass can run, any such file was left by a crashed writer.
/// Unrecognised files are intentionally retained for operator inspection.
fn sweep_staging_residue(workspace_root: &Path) -> Result<(), String> {
    let staging = workspace_root.join("assets").join(".attachment-staging");
    let entries = match fs::read_dir(&staging) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if !file_type.is_file() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.ends_with(".stage") || name.ends_with(".journal") {
            fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn sweep_unreferenced_managed_files(
    managed_root: &Path,
    current: &Path,
    referenced_paths: &BTreeSet<PathBuf>,
) -> Result<(), String> {
    let entries = match fs::read_dir(current) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir() {
            sweep_unreferenced_managed_files(managed_root, &path, referenced_paths)?;
            // Empty directories are managed artefacts too. Never force-delete
            // a directory: if an unknown file remains, it is retained.
            match fs::remove_dir(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) if error.kind() == std::io::ErrorKind::DirectoryNotEmpty => {}
                Err(error) => return Err(error.to_string()),
            }
            continue;
        }
        if !file_type.is_file() {
            // Symlinks and special files cannot have been published by this
            // service, so recovery leaves them untouched.
            continue;
        }
        let relative = path
            .strip_prefix(managed_root)
            .map(Path::to_path_buf)
            .map_err(|_| "managed attachment traversal escaped its root".to_string())?;
        if !referenced_paths.contains(&relative) {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn stage_source_file(workspace_root: &Path, source: &Path) -> Result<PathBuf, String> {
    use std::io::Write;

    let staging = workspace_root.join("assets").join(".attachment-staging");
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let staged = staging.join(format!("{}.stage", uuid::Uuid::new_v4()));
    let copy_result = (|| -> Result<(), std::io::Error> {
        let mut input = fs::File::open(source)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staged)?;
        std::io::copy(&mut input, &mut output)?;
        output.flush()?;
        output.sync_all()?;
        Ok(())
    })();
    if let Err(error) = copy_result {
        fs::remove_file(&staged).ok();
        return Err(error.to_string());
    }
    Ok(staged)
}

/// Publishes without replacement. `true` means this invocation created the
/// target and may remove it if the SQLite commit fails; `false` means an
/// identical pre-existing target won the race and must never be deleted here.
fn publish_staged_file(staged: &Path, target: &Path) -> Result<bool, String> {
    use std::io::Write;

    let parent = target
        .parent()
        .ok_or_else(|| "attachment target has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    match fs::hard_link(staged, target) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            if same_file_content(staged, target)? {
                Ok(false)
            } else {
                Err(format!(
                    "managed attachment target already exists with different bytes: {}",
                    target.display()
                ))
            }
        }
        Err(error) => {
            let mut destination = match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)
            {
                Ok(destination) => destination,
                Err(create_error) if create_error.kind() == std::io::ErrorKind::AlreadyExists => {
                    return if same_file_content(staged, target)? {
                        Ok(false)
                    } else {
                        Err(format!(
                            "managed attachment target already exists with different bytes: {}",
                            target.display()
                        ))
                    };
                }
                Err(create_error) => {
                    return Err(format!(
                        "could not publish attachment after hard-link failure {error}: {create_error}"
                    ));
                }
            };
            let copy_result = (|| -> Result<(), std::io::Error> {
                let mut input = fs::File::open(staged)?;
                std::io::copy(&mut input, &mut destination)?;
                destination.flush()?;
                destination.sync_all()?;
                Ok(())
            })();
            if let Err(write_error) = copy_result {
                fs::remove_file(target).ok();
                return Err(write_error.to_string());
            }
            Ok(true)
        }
    }
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
    use std::{
        fs,
        sync::{Arc, Barrier},
        thread,
    };

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
                authoritative_document: Some(AuthoritativeDocumentSnapshot {
                    body: "[]".into(),
                    summary: "A timeline record".into(),
                    content_origin: "seed".into(),
                    content_revision: 0,
                    body_source_coordinates: vec!["episodes/2.md#portrait".into()],
                    entity_type: "Event".into(),
                    title: "Timeline record".into(),
                    schema_version: 1,
                }),
            },
        )
        .expect("attachment succeeds without a pre-existing local document");

        assert!(result
            .attachment
            .managed_path
            .starts_with("assets/attachments/"));
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
        assert!(second.document.body.contains(&first.attachment.id));
        assert!(second.document.body.contains(&second.attachment.id));
    }

    #[test]
    fn concurrent_imports_converge_on_one_attachment_identity() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("same.png");
        fs::write(&source, b"one immutable image for two native connections").unwrap();

        // Migrate before the workers race. Each invocation still opens its own
        // SQLite connection, then both start together. The service takes the
        // writer lock before staging so recovery and publication remain one
        // serializable operation.
        drop(Database::open(&database_path).expect("initialise SQLite"));
        let start = Arc::new(Barrier::new(2));
        let request = attachment_request(&workspace, "n-race", &source, "inline");
        let spawn_import = |barrier: Arc<Barrier>| {
            let request = request.clone();
            let database_path = database_path.clone();
            thread::spawn(move || {
                barrier.wait();
                attach_node_attachment_at_path_with_hooks(
                    &database_path,
                    request,
                    |_| Ok(()),
                    || Ok(()),
                )
            })
        };

        let first = spawn_import(Arc::clone(&start));
        let second = spawn_import(Arc::clone(&start));
        let first = first
            .join()
            .expect("first worker joins")
            .expect("first import");
        let second = second
            .join()
            .expect("second worker joins")
            .expect("second import");

        assert_eq!(first.attachment.id, second.attachment.id);
        assert_eq!(
            first.attachment.managed_path,
            second.attachment.managed_path
        );
        assert_eq!(
            fs::read(workspace.join(&first.attachment.managed_path)).unwrap(),
            b"one immutable image for two native connections"
        );
        let database = Database::open(&database_path).unwrap();
        let attachment_count: i64 = database
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM node_attachment WHERE graph_node_id='n-race'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(attachment_count, 1);
    }

    #[test]
    fn hashes_the_staged_bytes_when_the_external_source_changes_mid_import() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("mutable.png");
        fs::write(&source, b"original staged bytes").unwrap();

        let mutation_source = source.clone();
        let result = attach_node_attachment_at_path_with_hooks(
            &database_path,
            attachment_request(&workspace, "n-mutable", &source, "inline"),
            move |_| {
                fs::write(&mutation_source, b"new external source bytes")
                    .map_err(|error| error.to_string())?;
                Ok(())
            },
            || Ok(()),
        )
        .expect("staged bytes remain the imported identity");

        assert_eq!(
            fs::read(workspace.join(&result.attachment.managed_path)).unwrap(),
            b"original staged bytes"
        );
        assert_ne!(
            result.attachment.content_hash,
            sha256_file(&source).unwrap()
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

        let error = attach_node_attachment_at_path_with_hooks(
            &database_path,
            attachment_request(&workspace, "n-failing", &source, "inline"),
            |_| Ok(()),
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
        let presentation = read_node_attachment_presentation_at_path(&database_path, "n-shared")
            .expect("canonical cover survives a fresh native read");
        assert_eq!(
            presentation.cover.expect("selected cover").id,
            cover.attachment.id
        );
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

    #[test]
    fn rejects_reusing_image_bytes_as_a_file_attachment() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("shared.png");
        fs::write(&source, b"same bytes must retain their image identity").unwrap();

        attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-role", &source, "inline"),
        )
        .expect("image attachment imports");

        let mut incompatible = attachment_request(&workspace, "n-role", &source, "file");
        incompatible.kind = "file".into();
        let error = attach_node_attachment_at_path(&database_path, incompatible)
            .expect_err("the existing image identity cannot be reused as an arbitrary file");

        assert!(error.contains("kind"));
        let database = crate::db::connection::Database::open(&database_path).unwrap();
        let usages = crate::db::repositories::NodeAttachmentRepository::new(database.connection())
            .usages(
                &crate::db::repositories::NodeAttachmentRepository::new(database.connection())
                    .find_by_content_identity("n-role", &sha256_file(&source).unwrap())
                    .unwrap()
                    .unwrap()
                    .id,
            )
            .unwrap();
        assert_eq!(usages, vec!["inline"]);
    }

    #[test]
    fn sqlite_rejects_an_incompatible_usage_role_even_outside_the_command_service() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("schema-guard.png");
        fs::write(&source, b"image bytes protected by the SQLite usage guard").unwrap();

        let attached = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-schema-guard", &source, "inline"),
        )
        .expect("valid image attachment imports");
        let database = Database::open(&database_path).unwrap();
        let error = database.connection().execute(
            "INSERT INTO node_attachment_usage(attachment_id,role) VALUES(?1,'file')",
            [&attached.attachment.id],
        );

        assert!(
            error.is_err(),
            "the database itself rejects image-as-file usage"
        );
    }

    #[test]
    fn sqlite_rejects_invalid_usage_updates_and_cover_presentation_rows() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let first_source = source_dir.join("first.png");
        let second_source = source_dir.join("second.png");
        let third_source = source_dir.join("third.png");
        fs::write(&first_source, b"first guarded image").unwrap();
        fs::write(&second_source, b"second guarded image").unwrap();
        fs::write(&third_source, b"third guarded image").unwrap();

        let first = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-presentation-a", &first_source, "inline"),
        )
        .expect("first valid image attachment imports");
        let second = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-presentation-b", &second_source, "inline"),
        )
        .expect("second valid image attachment imports");
        let third = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-presentation-a", &third_source, "inline"),
        )
        .expect("third valid image attachment imports");
        let database = Database::open(&database_path).unwrap();

        let incompatible_usage_update = database.connection().execute(
            "UPDATE node_attachment_usage SET role='file' WHERE attachment_id=?1 AND role='inline'",
            [&first.attachment.id],
        );
        assert!(
            incompatible_usage_update.is_err(),
            "updating an image usage to file is rejected just like inserting it"
        );

        let missing_cover_usage = database.connection().execute(
            "INSERT INTO node_attachment_presentation(graph_node_id,cover_attachment_id) VALUES(?1,?2)",
            [&first.attachment.graph_node_id, &first.attachment.id],
        );
        assert!(
            missing_cover_usage.is_err(),
            "a canonical presentation must reference an attachment marked for cover use"
        );

        let foreign_attachment = database.connection().execute(
            "INSERT INTO node_attachment_presentation(graph_node_id,cover_attachment_id) VALUES(?1,?2)",
            [&first.attachment.graph_node_id, &second.attachment.id],
        );
        assert!(
            foreign_attachment.is_err(),
            "a canonical presentation cannot select an attachment from another graph node"
        );

        NodeAttachmentRepository::new(database.connection())
            .select_cover(&first.attachment.graph_node_id, &first.attachment.id)
            .expect("the repository creates one valid canonical cover before update checks");
        let missing_cover_usage_update = database.connection().execute(
            "UPDATE node_attachment_presentation SET cover_attachment_id=?1 WHERE graph_node_id=?2",
            [&third.attachment.id, &first.attachment.graph_node_id],
        );
        assert!(
            missing_cover_usage_update.is_err(),
            "updating a canonical cover also requires cover usage"
        );
        let foreign_attachment_update = database.connection().execute(
            "UPDATE node_attachment_presentation SET graph_node_id=?1 WHERE graph_node_id=?2",
            [
                &second.attachment.graph_node_id,
                &first.attachment.graph_node_id,
            ],
        );
        assert!(
            foreign_attachment_update.is_err(),
            "updating a canonical presentation cannot detach it from its owning graph node"
        );
    }

    #[test]
    fn sqlite_rejects_deleting_the_usage_of_a_selected_cover() {
        let (_directory, database_path, selected, _, _) = selected_cover_fixture();
        let database = Database::open(&database_path).unwrap();

        let deletion = database.connection().execute(
            "DELETE FROM node_attachment_usage WHERE attachment_id=?1 AND role='cover'",
            [&selected.id],
        );

        assert!(
            deletion.is_err(),
            "a selected canonical cover cannot lose its cover usage through direct SQL"
        );
    }

    #[test]
    fn sqlite_rejects_retargeting_the_usage_of_a_selected_cover() {
        let (_directory, database_path, selected, alternate, _) = selected_cover_fixture();
        let database = Database::open(&database_path).unwrap();

        let role_change = database.connection().execute(
            "UPDATE node_attachment_usage SET role='inline' WHERE attachment_id=?1 AND role='cover'",
            [&selected.id],
        );
        assert!(
            role_change.is_err(),
            "a selected canonical cover must retain the cover role"
        );

        let attachment_change = database.connection().execute(
            "UPDATE node_attachment_usage SET attachment_id=?1 WHERE attachment_id=?2 AND role='cover'",
            [&alternate.id, &selected.id],
        );
        assert!(
            attachment_change.is_err(),
            "a selected canonical cover usage cannot be moved to a different attachment"
        );
    }

    #[test]
    fn sqlite_rejects_moving_an_attachment_selected_as_a_canonical_cover() {
        let (_directory, database_path, selected, _, _) = selected_cover_fixture();
        let database = Database::open(&database_path).unwrap();

        let node_change = database.connection().execute(
            "UPDATE node_attachment SET graph_node_id='n-reassigned' WHERE id=?1",
            [&selected.id],
        );

        assert!(
            node_change.is_err(),
            "a presentation-selected attachment cannot be reassigned to another graph node"
        );
    }

    #[test]
    fn sqlite_allows_unselected_attachment_usage_and_ownership_mutations() {
        let (_directory, database_path, _, _, unrelated) = selected_cover_fixture();
        let database = Database::open(&database_path).unwrap();

        let deleted_usage = database.connection().execute(
            "DELETE FROM node_attachment_usage WHERE attachment_id=?1 AND role='inline'",
            [&unrelated.id],
        );
        assert_eq!(
            deleted_usage.expect("unselected attachment usage remains mutable"),
            1
        );
        let moved_attachment = database.connection().execute(
            "UPDATE node_attachment SET graph_node_id='n-relocated' WHERE id=?1",
            [&unrelated.id],
        );
        assert_eq!(
            moved_attachment.expect("unselected attachment ownership remains mutable"),
            1
        );
    }

    #[test]
    fn sqlite_rejects_primary_kind_role_changes_that_conflict_with_cover_usage() {
        let (_directory, database_path, selected, _, _) = selected_cover_fixture();
        let database = Database::open(&database_path).unwrap();

        let corruption = database.connection().execute(
            "UPDATE node_attachment SET kind='file', role='file' WHERE id=?1",
            [&selected.id],
        );
        assert!(
            corruption.is_err(),
            "a selected image cover cannot be converted into a file through direct SQL"
        );
        let selected_cover = NodeAttachmentRepository::new(database.connection())
            .selected_cover_for_node(&selected.graph_node_id)
            .unwrap()
            .expect("the rejected mutation preserves the canonical cover");
        assert_eq!(selected_cover.kind, "image");
        assert_eq!(
            NodeAttachmentRepository::new(database.connection())
                .usages(&selected.id)
                .unwrap(),
            vec!["cover"]
        );

        let unused = NodeAttachment {
            id: "unreferenced-kind-change".into(),
            graph_node_id: "n-unreferenced".into(),
            managed_path: "assets/attachments/unreferenced/kind-change.png".into(),
            original_filename: "kind-change.png".into(),
            mime_type: "image/png".into(),
            kind: "image".into(),
            content_hash: "unreferenced-kind-change-hash".into(),
            caption: String::new(),
            role: "inline".into(),
            provenance_source_path: "/vault/kind-change.png".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        };
        NodeAttachmentRepository::new(database.connection())
            .insert(&unused)
            .expect("create an unreferenced attachment for the legal control");
        let valid_change = database.connection().execute(
            "UPDATE node_attachment SET kind='file', role='file' WHERE id=?1",
            [&unused.id],
        );
        assert_eq!(
            valid_change.expect("an attachment with no incompatible usage remains mutable"),
            1
        );
    }

    #[test]
    fn canonical_cover_queries_hide_historical_primary_record_corruption() {
        // Upgrade safety is deliberately tested against the real 0022 schema:
        // that historical schema allowed a primary image record to become a
        // file while a cover usage/presentation row remained. The new query is
        // defensive even if a database was corrupted before 0023 could guard
        // it.
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrations::MigrationRunner::migrate_through(
            &connection,
            "0022_node_attachment_presentation_indirect_guards",
        )
        .unwrap();
        let attachment = NodeAttachment {
            id: "historical-corrupt-cover".into(),
            graph_node_id: "n-historical-cover".into(),
            managed_path: "assets/attachments/historical/cover.png".into(),
            original_filename: "cover.png".into(),
            mime_type: "image/png".into(),
            kind: "image".into(),
            content_hash: "historical-corrupt-cover-hash".into(),
            caption: String::new(),
            role: "inline".into(),
            provenance_source_path: "/vault/cover.png".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        };
        let repository = NodeAttachmentRepository::new(&connection);
        repository.insert(&attachment).unwrap();
        repository.ensure_usage(&attachment.id, "cover").unwrap();
        repository
            .select_cover(&attachment.graph_node_id, &attachment.id)
            .unwrap();
        connection
            .execute(
                "UPDATE node_attachment SET kind='file', role='file' WHERE id=?1",
                [&attachment.id],
            )
            .expect("the pre-0023 schema permitted this historical corruption");

        assert!(repository
            .selected_cover_for_node(&attachment.graph_node_id)
            .unwrap()
            .is_none());
        assert!(repository.selected_covers().unwrap().is_empty());
    }

    #[test]
    fn attaches_from_the_local_sqlite_projection_without_a_remote_snapshot() {
        let directory = tempfile::tempdir().expect("temporary offline attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("offline-cover.png");
        fs::write(&source, b"offline cover bytes").unwrap();

        let database =
            Database::open(&database_path).expect("open the local-only SQLite workspace");
        let documents = NodeDocumentRepository::new(database.connection());
        documents
            .apply_reconciliation_with_projection(
                &DocumentContentInput {
                    graph_node_id: "n-offline".into(),
                    body: "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Offline reader body\"}]}]".into(),
                    summary: "Offline reader pith".into(),
                    content_origin: ContentOrigin::Seed,
                    content_revision: 7,
                    body_source_coordinates: vec!["episode-2.md#offline".into()],
                    neo4j_synced: true,
                },
                None,
                Some(&DocumentMetadataProjection {
                    entity_type: "Event".into(),
                    title: "Offline reader node".into(),
                    schema_version: 1,
                }),
            )
            .expect("seed an authoritative local graph/document projection");
        drop(database);

        let request: AttachNodeAttachmentRequest = serde_json::from_value(serde_json::json!({
            "workspaceRoot": workspace,
            "graphNodeId": "n-offline",
            "sourceAbsolutePath": source,
            "kind": "image",
            "role": "cover",
            "caption": "An offline canonical cover"
        }))
        .expect("attachment requests may omit an unavailable remote graph snapshot");
        let attached = attach_node_attachment_at_path(&database_path, request)
            .expect("durably attach without any SharedGraphState or remote graph read");

        assert!(workspace.join(&attached.attachment.managed_path).is_file());
        assert_eq!(attached.document.summary, "Offline reader pith");
        assert_eq!(attached.graph_node.title, "Offline reader node");
        assert_eq!(attached.graph_node.summary, "Offline reader pith");
        assert_eq!(attached.graph_node.content_revision, Some(7));
        assert!(attached.remote_sync_eligible);
        let reopened = Database::open(&database_path).unwrap();
        let durable_document = NodeDocumentRepository::new(reopened.connection())
            .get_node_document("n-offline")
            .unwrap()
            .expect("local document survives reopening the SQLite workspace");
        assert_eq!(durable_document.body, attached.document.body);
        let presentation = NodeAttachmentRepository::new(reopened.connection())
            .selected_cover_for_node("n-offline")
            .unwrap()
            .expect("offline cover selection survives reopening the SQLite workspace");
        assert_eq!(presentation.id, attached.attachment.id);
    }

    #[test]
    fn caller_snapshot_never_replaces_a_pending_local_document() {
        let directory = tempfile::tempdir().expect("temporary pending attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let first_source = source_dir.join("first.png");
        let second_source = source_dir.join("second.png");
        fs::write(&first_source, b"first local attachment").unwrap();
        fs::write(&second_source, b"second local attachment").unwrap();

        let first = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-pending-local", &first_source, "inline"),
        )
        .expect("first local attachment creates a pending authored document");
        assert!(!first.document.neo4j_synced);

        let mut second_request =
            attachment_request(&workspace, "n-pending-local", &second_source, "inline");
        let caller_snapshot = second_request
            .authoritative_document
            .as_mut()
            .expect("test request carries a caller snapshot");
        caller_snapshot.body = "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"remote replacement must not win\"}]}]".into();
        caller_snapshot.summary = "Remote replacement".into();
        caller_snapshot.content_revision = 99;
        let second = attach_node_attachment_at_path(&database_path, second_request)
            .expect("second attachment preserves pending local document before appending");

        assert!(!second.document.neo4j_synced);
        assert!(second.document.body.contains(&first.attachment.id));
        assert!(second.document.body.contains(&second.attachment.id));
        assert!(!second
            .document
            .body
            .contains("remote replacement must not win"));
        assert_ne!(second.document.summary, "Remote replacement");
        assert_eq!(second.graph_node.body, second.document.body);
    }

    #[test]
    fn attachment_service_sweeps_crash_residue_without_touching_referenced_bytes() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let referenced_source = source_dir.join("referenced.png");
        let recovery_source = source_dir.join("recovery.png");
        fs::write(&referenced_source, b"durably referenced attachment").unwrap();
        fs::write(&recovery_source, b"attachment that triggers recovery").unwrap();

        let referenced = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-recovery", &referenced_source, "inline"),
        )
        .expect("persist the attachment recovery must preserve");
        let referenced_path = workspace.join(&referenced.attachment.managed_path);
        let staging = workspace.join("assets/.attachment-staging");
        let orphan_published = workspace.join("assets/attachments/orphan/stranded.png");
        let stale_stage = staging.join("abandoned.stage");
        let stale_journal = staging.join("attachment-stage-4294967295-stale.journal");
        fs::create_dir_all(orphan_published.parent().unwrap()).unwrap();
        fs::create_dir_all(&staging).unwrap();
        fs::write(&orphan_published, b"bytes published before a process crash").unwrap();
        fs::write(&stale_stage, b"bytes staged before a process crash").unwrap();
        fs::write(&stale_journal, r#"{"pid":4294967295}"#).unwrap();

        attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-recovery", &recovery_source, "inline"),
        )
        .expect("service startup sweeps stale attachment residue before import");

        assert!(
            referenced_path.is_file(),
            "never delete a managed path referenced by SQLite"
        );
        assert!(
            !orphan_published.exists(),
            "remove an unreferenced published asset"
        );
        assert!(
            !stale_stage.exists(),
            "remove an unowned stale staging file"
        );
        assert!(
            !stale_journal.exists(),
            "remove the stale staging ownership marker"
        );
    }

    #[test]
    fn reconciles_a_synced_stale_local_document_before_appending_an_attachment() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("new.png");
        fs::write(&source, b"image after remote revision six").unwrap();

        let database = crate::db::connection::Database::open(&database_path).unwrap();
        let repository =
            crate::db::repositories::NodeDocumentRepository::new(database.connection());
        repository
            .apply_reconciliation_with_projection(
                &crate::db::repositories::DocumentContentInput {
                    graph_node_id: "n-stale".into(),
                    body: "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"old local revision\"}]}]".into(),
                    summary: "stale local".into(),
                    content_origin: crate::db::repositories::graph::ContentOrigin::Seed,
                    content_revision: 5,
                    body_source_coordinates: vec!["episode-2.md#old".into()],
                    neo4j_synced: true,
                },
                None,
                Some(&crate::db::repositories::DocumentMetadataProjection {
                    entity_type: "Event".into(),
                    title: "Stale document".into(),
                    schema_version: 1,
                }),
            )
            .unwrap();
        drop(database);

        let mut request = attachment_request(&workspace, "n-stale", &source, "inline");
        let snapshot = request
            .authoritative_document
            .as_mut()
            .expect("test request carries a remote snapshot");
        snapshot.body = "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"remote revision six\"}]}]".into();
        snapshot.summary = "remote six".into();
        snapshot.content_revision = 6;
        snapshot.body_source_coordinates = vec!["episode-2.md#remote-six".into()];
        snapshot.title = "Stale document".into();
        let attached = attach_node_attachment_at_path(&database_path, request)
            .expect("synced stale local document is reconciled to remote before attach");

        assert_eq!(attached.document.content_revision, 7);
        assert!(attached.document.body.contains("remote revision six"));
        assert!(attached.document.body.contains(&attached.attachment.id));
    }

    #[test]
    fn upgrades_a_legacy_document_without_metadata_from_the_remote_snapshot() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("legacy.png");
        fs::write(&source, b"legacy local document upgrade").unwrap();

        let database = crate::db::connection::Database::open(&database_path).unwrap();
        let repository =
            crate::db::repositories::NodeDocumentRepository::new(database.connection());
        repository
            .apply_reconciliation(
                &crate::db::repositories::DocumentContentInput {
                    graph_node_id: "n-legacy".into(),
                    body: "[]".into(),
                    summary: "legacy".into(),
                    content_origin: crate::db::repositories::graph::ContentOrigin::Seed,
                    content_revision: 0,
                    body_source_coordinates: vec![],
                    neo4j_synced: true,
                },
                None,
            )
            .unwrap();
        drop(database);

        let mut request = attachment_request(&workspace, "n-legacy", &source, "inline");
        let snapshot = request
            .authoritative_document
            .as_mut()
            .expect("test request carries a remote snapshot");
        snapshot.content_revision = 1;
        snapshot.body = "[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"canonical remote\"}]}]".into();
        let attached = attach_node_attachment_at_path(&database_path, request)
            .expect("legacy document is upgraded and attached");

        assert_eq!(attached.document.content_revision, 2);
        assert!(attached.document.body.contains("canonical remote"));
        let reopened = crate::db::connection::Database::open(&database_path).unwrap();
        let metadata_count: i64 = reopened
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM graph_node_metadata WHERE graph_node_id='n-legacy'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(metadata_count, 1);
    }

    #[test]
    fn new_attachment_paths_do_not_expose_hostile_node_or_windows_filename_characters() {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("hostile:name?.png");
        fs::write(&source, b"platform safe asset bytes").unwrap();

        let attached = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "root:archetype*?", &source, "inline"),
        )
        .expect("hostile logical ids are encoded into a portable managed path");

        assert!(attached
            .attachment
            .managed_path
            .starts_with("assets/attachments/"));
        assert!(!attached.attachment.managed_path.contains(':'));
        assert!(!attached.attachment.managed_path.contains('*'));
        assert!(!attached.attachment.managed_path.contains('?'));
        assert!(workspace.join(&attached.attachment.managed_path).is_file());
    }

    #[test]
    fn legacy_asset_paths_remain_resolvable_while_new_paths_are_portable() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let legacy = portable_path_to_workspace_path(
            workspace.path(),
            "assets/root:archetype/legacy-cover.png",
        )
        .expect("already-persisted legacy paths remain readable");
        assert_eq!(
            legacy,
            workspace
                .path()
                .join("assets/root:archetype/legacy-cover.png")
        );

        let candidate = new_attachment_identity(
            &attachment_request(
                workspace.path(),
                "root:archetype*?",
                Path::new("/tmp/hostile:name?.png"),
                "inline",
            ),
            "hostile:name?.png",
            Path::new("/tmp/hostile:name?.png"),
            "f00dbabe",
        );
        assert!(candidate.managed_path.starts_with("assets/attachments/"));
        assert!(candidate.managed_path.ends_with("/f00dbabe.png"));
        assert!(!candidate.managed_path.contains(':'));
        assert!(!candidate.managed_path.contains('*'));
        assert!(!candidate.managed_path.contains('?'));
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
            authoritative_document: Some(AuthoritativeDocumentSnapshot {
                body: "[]".into(),
                summary: "A timeline record".into(),
                content_origin: "seed".into(),
                content_revision: 0,
                body_source_coordinates: vec!["episodes/2.md#image".into()],
                entity_type: "Event".into(),
                title: "Timeline record".into(),
                schema_version: 1,
            }),
        }
    }

    fn selected_cover_fixture() -> (
        tempfile::TempDir,
        PathBuf,
        NodeAttachment,
        NodeAttachment,
        NodeAttachment,
    ) {
        let directory = tempfile::tempdir().expect("temporary attachment workspace");
        let workspace = directory.path().join("workspace");
        let source_dir = directory.path().join("source");
        let database_path = directory.path().join("attachments.sqlite");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let selected_source = source_dir.join("selected-cover.png");
        let alternate_source = source_dir.join("alternate.png");
        let unrelated_source = source_dir.join("unrelated.png");
        fs::write(&selected_source, b"selected canonical cover").unwrap();
        fs::write(&alternate_source, b"other image for the same graph node").unwrap();
        fs::write(&unrelated_source, b"unrelated attachment").unwrap();

        let selected = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-selected", &selected_source, "cover"),
        )
        .expect("create a selected cover through the real attachment service")
        .attachment;
        let alternate = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-selected", &alternate_source, "inline"),
        )
        .expect("create an unselected image for the same graph node")
        .attachment;
        let unrelated = attach_node_attachment_at_path(
            &database_path,
            attachment_request(&workspace, "n-unrelated", &unrelated_source, "inline"),
        )
        .expect("create an unrelated attachment")
        .attachment;

        (directory, database_path, selected, alternate, unrelated)
    }
}
