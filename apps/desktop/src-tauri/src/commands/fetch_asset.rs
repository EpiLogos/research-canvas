use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::commands::constellations::resolve_active_profile_scope;
use crate::db::{
    connection::Database,
    repositories::{
        apply_region_redaction, assert_portable_street_view_path, FetchRecord,
        FetchRecordRepository, FetchValidation, REDACTION_STATUS_PENDING,
        REDACTION_STATUS_REDACTED, StreetViewImageRecord, StreetViewRegion,
        StreetViewRepository,
    },
};
use crate::SharedApiState;

/// `rc-asset ingest` — the deterministic app-side gate for agent-gathered
/// imagery (refinement-2 D3, ticket #20). The gate is the trust boundary on
/// what an agent produces in the background tmux session: it validates mime
/// type and byte size against allow-lists, captures source URL + license +
/// retrieval timestamp, imports the bytes into the content-addressed media
/// store, runs the local redaction pipeline, and only then associates the
/// image with a place / walk / scene, writing the D3 fetch-record provenance.
///
/// The gate itself never makes a network call: the agent is the explicit live
/// opt-in that fetches the bytes; the gate only reads the file the agent
/// already placed on disk.

/// Default byte-size cap for gathered imagery (10 MiB).
pub const DEFAULT_CAP_BYTES: u64 = 10 * 1024 * 1024;

/// Acceptable licenses, CC0 / CC BY / public domain first. Comparison is
/// case-insensitive so the agent's `--license` free text can say "CC0" or
/// "public domain".
pub const LICENSE_ALLOW_LIST: [&str; 6] = [
    "CC0",
    "CC BY",
    "CC BY-SA",
    "PD",
    "public domain",
    "public-domain",
];

/// Source hosts the gate accepts for provenance. Matching is suffix-based
/// (`host == allowed || host.ends_with(".{allowed}")`), so `wikimedia.org`
/// covers `commons.wikimedia.org` and `upload.wikimedia.org`.
pub const SOURCE_ALLOW_LIST: [&str; 2] = ["wikimedia.org", "rawpixel.com"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestFetchedAssetRequest {
    pub database_path: String,
    pub media_root: String,
    pub profile_scope: Option<String>,
    /// Links to the tmux session that produced the asset (durable session id).
    pub agent_session_id: String,
    /// Provenance: the URL the agent fetched the bytes from (gate never fetches).
    pub source_url: String,
    /// Provenance: the license the agent verified at the source.
    pub license: String,
    /// Provenance: retrieval timestamp; defaults to now.
    pub fetched_at: Option<String>,
    /// Absolute path to the bytes the agent already placed on disk.
    pub source_path: String,
    pub place_id: Option<String>,
    pub walk_id: Option<String>,
    pub scene_id: Option<String>,
    #[serde(default)]
    pub redaction_regions: Vec<StreetViewRegion>,
    /// Byte-size cap; defaults to `DEFAULT_CAP_BYTES`.
    pub cap_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRecordScopeRequest {
    pub database_path: String,
    pub profile_scope: Option<String>,
}

#[tauri::command]
pub fn ingest_fetched_asset_command(
    request: IngestFetchedAssetRequest,
    api_state: tauri::State<SharedApiState>,
) -> Result<FetchRecord, String> {
    let request = resolve_profile_scope(request, &api_state)?;
    ingest_fetched_asset_at(&request)
}

#[tauri::command]
pub fn list_fetch_records_command(
    request: FetchRecordScopeRequest,
    api_state: tauri::State<SharedApiState>,
) -> Result<Vec<FetchRecord>, String> {
    let profile_scope = resolve_active_profile_scope(&api_state, request.profile_scope.as_deref())?;
    list_fetch_records_at(&request.database_path, &profile_scope)
}

pub fn list_fetch_records_at(
    database_path: &str,
    profile_scope: &str,
) -> Result<Vec<FetchRecord>, String> {
    let db = open_database(database_path)?;
    let repo = FetchRecordRepository::new(db.connection());
    repo.list_for_profile(profile_scope)
        .map_err(|error| error.to_string())
}

fn resolve_profile_scope(
    mut request: IngestFetchedAssetRequest,
    api_state: &SharedApiState,
) -> Result<IngestFetchedAssetRequest, String> {
    if request
        .profile_scope
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        request.profile_scope = Some(resolve_active_profile_scope(api_state, None)?);
    }
    Ok(request)
}

/// The full gate. Every ingest attempt — accepted OR rejected — writes exactly
/// one fetch record (the audit trail). Validation rejections are NOT hard
/// errors: they produce a fetch record with the failing `validation` flags so
/// the reason is visible to the agent (the CLI prints it back into the tmux
/// session) and to the frontend. Redaction-decode failures (a gate-accepted
/// GIF with regions, or a magic-matching-but-corrupt PNG/JPEG with regions) are
/// pre-flighted BEFORE any import/register, and the defensive rollback on
/// redaction I/O errors deletes the just-written file + street-view row, so no
/// orphaned media or street-view row can exist without its fetch record. Hard
/// errors (unreadable source, missing database) are returned as `Err`.
pub fn ingest_fetched_asset_at(
    request: &IngestFetchedAssetRequest,
) -> Result<FetchRecord, String> {
    let profile_scope = request
        .profile_scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| "fetch asset profileScope must not be blank".to_string())?;
    if request.media_root.trim().is_empty() {
        return Err("fetch asset mediaRoot must not be blank".into());
    }
    if request.agent_session_id.trim().is_empty() {
        return Err("fetch asset agentSessionId must not be blank".into());
    }
    let db = open_database(&request.database_path)?;
    let repo = FetchRecordRepository::new(db.connection());
    let media_root = PathBuf::from(&request.media_root);

    let source = PathBuf::from(&request.source_path);

    // M3: stat the source first and reject over-cap files before reading +
    // hashing the whole file. The mime sniff below still reads only a small
    // header, so an oversize file is rejected cheaply.
    let file_len = std::fs::metadata(&source)
        .map_err(|error| {
            format!(
                "cannot stat source path {}: {error}",
                request.source_path
            )
        })?
        .len();
    let cap_bytes = request.cap_bytes.unwrap_or(DEFAULT_CAP_BYTES);
    let size_ok = file_len > 0 && file_len <= cap_bytes;

    // Sniff the mime type from the first bytes without a full read.
    let header = read_image_header(&source)?;
    let mime_type = sniff_image_mime(&header)
        .unwrap_or("application/octet-stream")
        .to_string();

    // Read + hash the whole file only when under cap.
    let (bytes, content_hash) = if size_ok {
        let bytes = std::fs::read(&source).map_err(|error| {
            format!(
                "cannot read source path {}: {error}",
                request.source_path
            )
        })?;
        let content_hash = sha256_hex(&bytes);
        (Some(bytes), content_hash)
    } else {
        (None, String::new())
    };

    // Idempotent re-ingest (M2): the same profile + session + source URL +
    // bytes already landed as an accepted record — return it instead of
    // duplicating bytes or a street-view image. Rejected records (empty
    // artifact path) never match, so a corrected re-ingest can still proceed.
    if let Some(bytes) = &bytes {
        let hash = sha256_hex(bytes);
        if let Some(existing) = repo
            .find_accepted_by_dedup_key(
                profile_scope,
                &request.agent_session_id,
                &request.source_url,
                &hash,
            )
            .map_err(|error| error.to_string())?
        {
            return Ok(existing);
        }
    }

    let validation = FetchValidation {
        mime_ok: matches!(
            mime_type.as_str(),
            "image/png" | "image/jpeg" | "image/gif"
        ),
        size_ok,
        license_ok: LICENSE_ALLOW_LIST
            .iter()
            .any(|allowed| request.license.trim().eq_ignore_ascii_case(allowed)),
        source_ok: source_url_host(&request.source_url)
            .map(|host| source_host_allowed(&host))
            .unwrap_or(false),
    };
    let all_ok = validation.all_ok();
    let fetched_at = request
        .fetched_at
        .clone()
        .unwrap_or_else(current_timestamp);
    let byte_size = bytes
        .as_ref()
        .map(|bytes| bytes.len() as i64)
        .unwrap_or(file_len as i64);

    let (artifact_path, street_view_image_id, redaction_status) = if all_ok {
        let bytes = bytes.as_deref().expect("all_ok implies bytes were read");

        // I1 pre-flight: when redaction regions are present, the local pipeline
        // must be able to decode the bytes. The gate accepts GIF by magic bytes,
        // but the redaction codecs only handle PNG/JPEG, and a magic-matching
        // corrupt file also fails decode. Run BEFORE any import/register so a
        // decode failure can never orphan media or a street-view row — the
        // attempt still writes a fetch record (with `mimeOk` false).
        if !request.redaction_regions.is_empty() {
            if image::load_from_memory(bytes).is_err() {
                return build_failed_fetch_record(
                    &repo,
                    request,
                    profile_scope,
                    fetched_at,
                    mime_type,
                    byte_size,
                    content_hash,
                    FetchValidation {
                        mime_ok: false,
                        size_ok,
                        license_ok: validation.license_ok,
                        source_ok: validation.source_ok,
                    },
                );
            }
        }

        let artifact_path = content_addressed_import(&media_root, bytes, &mime_type)?;
        let sv_repo = StreetViewRepository::new(db.connection());
        let registered = sv_repo
            .register(StreetViewImageRecord {
                id: Uuid::new_v4().to_string(),
                profile_scope: profile_scope.to_string(),
                artifact_path: artifact_path.clone(),
                captured_at: Some(fetched_at.clone()),
                latitude: None,
                longitude: None,
                heading_degrees: None,
                redaction_status: REDACTION_STATUS_PENDING.to_string(),
                redaction_regions: request.redaction_regions.clone(),
                redacted_artifact_path: None,
                created_at: String::new(),
                updated_at: String::new(),
            })
            .map_err(|error| error.to_string())?;
        let status = if !request.redaction_regions.is_empty() {
            // pending → manual/detected regions → redacted derived copy; the
            // raw bytes at the content-addressed path are never modified.
            match apply_region_redaction(&media_root, &registered) {
                Ok(output) => {
                    sv_repo
                        .set_redacted(&registered.id, &output)
                        .map_err(|error| error.to_string())?;
                    REDACTION_STATUS_REDACTED.to_string()
                }
                Err(_) => {
                    // Defensive rollback: decode passed pre-flight but the
                    // redaction write itself failed (I/O). Remove the just-
                    // imported file and the just-inserted street-view row so no
                    // orphan remains, and still audit the attempt.
                    let _ = std::fs::remove_file(media_root.join(&artifact_path));
                    let _ = sv_repo.delete(&registered.id);
                    return build_failed_fetch_record(
                        &repo,
                        request,
                        profile_scope,
                        fetched_at,
                        mime_type,
                        byte_size,
                        content_hash,
                        FetchValidation {
                            mime_ok: false,
                            size_ok,
                            license_ok: validation.license_ok,
                            source_ok: validation.source_ok,
                        },
                    );
                }
            }
        } else {
            REDACTION_STATUS_PENDING.to_string()
        };
        (artifact_path, Some(registered.id), status)
    } else {
        (String::new(), None, REDACTION_STATUS_PENDING.to_string())
    };

    let record = FetchRecord {
        id: Uuid::new_v4().to_string(),
        profile_scope: profile_scope.to_string(),
        agent_session_id: request.agent_session_id.clone(),
        source_url: request.source_url.clone(),
        license: request.license.clone(),
        fetched_at,
        mime_type,
        byte_size,
        validation,
        content_hash,
        artifact_path,
        redaction_status,
        street_view_image_id,
        place_id: request.place_id.clone(),
        walk_id: request.walk_id.clone(),
        scene_id: request.scene_id.clone(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    repo.create(record).map_err(|error| error.to_string())
}

/// Builds and persists a failed-attempt fetch record (empty artifact path, no
/// street-view link) so the attempt is audited even when the bytes cannot be
/// processed. Every ingest attempt must produce exactly one fetch record.
fn build_failed_fetch_record(
    repo: &FetchRecordRepository,
    request: &IngestFetchedAssetRequest,
    profile_scope: &str,
    fetched_at: String,
    mime_type: String,
    byte_size: i64,
    content_hash: String,
    validation: FetchValidation,
) -> Result<FetchRecord, String> {
    let record = FetchRecord {
        id: Uuid::new_v4().to_string(),
        profile_scope: profile_scope.to_string(),
        agent_session_id: request.agent_session_id.clone(),
        source_url: request.source_url.clone(),
        license: request.license.clone(),
        fetched_at,
        mime_type,
        byte_size,
        validation,
        content_hash,
        artifact_path: String::new(),
        redaction_status: REDACTION_STATUS_PENDING.to_string(),
        street_view_image_id: None,
        place_id: request.place_id.clone(),
        walk_id: request.walk_id.clone(),
        scene_id: request.scene_id.clone(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    repo.create(record).map_err(|error| error.to_string())
}

/// Reads up to 16 bytes of the source file — enough for every magic-byte
/// signature the gate recognises — without a full read.
fn read_image_header(source: &Path) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(source).map_err(|error| {
        format!(
            "cannot open source path {}: {error}",
            source.to_string_lossy()
        )
    })?;
    let mut header = [0u8; 16];
    let read = file.read(&mut header).map_err(|error| {
        format!(
            "cannot read source path {}: {error}",
            source.to_string_lossy()
        )
    })?;
    Ok(header[..read].to_vec())
}

/// Sniffs real image magic bytes. Returns the canonical mime type or `None`.
/// Deliberately independent of the `image` crate so GIF (which the redaction
/// codecs cannot decode) is still recognised at the gate and rejected later by
/// the redaction pipeline with a clear error rather than a silent pass.
pub fn sniff_image_mime(bytes: &[u8]) -> Option<&'static str> {
    let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.starts_with(&png) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    None
}

/// Content-addressed import into the media store: bytes land under
/// `street-view/imported/{sha256}.{ext}` so identical bytes dedup naturally.
/// Returns the portable relative path.
pub fn content_addressed_import(
    media_root: &Path,
    bytes: &[u8],
    mime_type: &str,
) -> Result<String, String> {
    let extension = match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        other => {
            return Err(format!(
                "cannot content-address import unsupported mime type: {other}"
            ))
        }
    };
    let hash = sha256_hex(bytes);
    let relative = format!("street-view/imported/{hash}.{extension}");
    assert_portable_street_view_path(&relative, "fetch record artifact")
        .map_err(|error| error.to_string())?;
    let destination = media_root.join(&relative);
    if !destination.is_file() {
        let parent = destination
            .parent()
            .ok_or_else(|| "imported artifact has no parent directory".to_string())?;
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        std::fs::write(&destination, bytes).map_err(|error| error.to_string())?;
    }
    Ok(relative)
}

/// Strips the scheme and returns the lowercased host of a `http(s)` URL.
/// The scheme strip is case-insensitive (`HTTPS://…` is accepted, M4).
/// Implemented without a URL-parsing dependency (the gate is offline-first and
/// deterministic); known-good hosts are public image repositories.
pub fn source_url_host(source_url: &str) -> Option<String> {
    let after_scheme = ["https://", "http://"]
        .iter()
        .find_map(|prefix| {
            let scheme = &source_url[..prefix.len().min(source_url.len())];
            if scheme.eq_ignore_ascii_case(prefix) {
                Some(&source_url[prefix.len()..])
            } else {
                None
            }
        })?;
    let host = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

pub fn source_host_allowed(host: &str) -> bool {
    SOURCE_ALLOW_LIST
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn open_database(database_path: &str) -> Result<Database, String> {
    if database_path.trim().is_empty() {
        return Err("databasePath must not be empty".into());
    }
    Database::open(PathBuf::from(database_path)).map_err(|error| error.to_string())
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
