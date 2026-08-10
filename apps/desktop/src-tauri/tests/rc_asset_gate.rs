use image::{Rgb, RgbImage};
use research_canvas_desktop_lib::{
    commands::fetch_asset::{
        content_addressed_import, ingest_fetched_asset_at, list_fetch_records_at, sha256_hex,
        sniff_image_mime, IngestFetchedAssetRequest,
    },
    db::{
        connection::Database,
        repositories::{
            FetchRecordRepository, REDACTION_STATUS_PENDING, REDACTION_STATUS_REDACTED,
            StreetViewRegion, StreetViewRepository,
        },
    },
};
use tempfile::tempdir;

const SESSION: &str = "research-canvas-0123456789abcdef";
const PLACE_AMSTERDAM: &str = "root-archetypal-field:place-amsterdam";

fn request(
    database_path: &str,
    media_root: &str,
    profile_scope: &str,
    source_path: &str,
) -> IngestFetchedAssetRequest {
    IngestFetchedAssetRequest {
        database_path: database_path.into(),
        media_root: media_root.into(),
        profile_scope: Some(profile_scope.into()),
        agent_session_id: SESSION.into(),
        source_url: "https://upload.wikimedia.org/wikipedia/commons/example.png".into(),
        license: "public domain".into(),
        fetched_at: Some("2026-08-10T10:00:00.000Z".into()),
        source_path: source_path.into(),
        place_id: Some(PLACE_AMSTERDAM.into()),
        walk_id: None,
        scene_id: None,
        redaction_regions: vec![],
        cap_bytes: None,
    }
}

fn write_real_png(path: &std::path::Path) {
    let mut image = RgbImage::from_pixel(64, 64, Rgb([40, 80, 120]));
    for y in 0..16 {
        for x in 0..16 {
            image.put_pixel(
                x,
                y,
                if (x + y) % 2 == 0 {
                    Rgb([200, 30, 30])
                } else {
                    Rgb([250, 240, 220])
                },
            );
        }
    }
    image.save(path).expect("write real png fixture");
}

fn write_real_jpeg(path: &std::path::Path) {
    let mut image = RgbImage::from_pixel(64, 64, Rgb([90, 140, 60]));
    for y in 0..16 {
        for x in 0..16 {
            image.put_pixel(
                x,
                y,
                if (x + y) % 2 == 0 {
                    Rgb([220, 40, 40])
                } else {
                    Rgb([240, 230, 200])
                },
            );
        }
    }
    image.save(path).expect("write real jpeg fixture");
}

/// A minimal, real GIF89a file (1x1). The gate sniffs the magic bytes and
/// imports it without decoding; the local redaction codecs only decode
/// PNG/JPEG, so this fixture carries no redaction regions.
fn write_real_gif(path: &std::path::Path) {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"GIF89a");
    // Logical screen descriptor: 1x1, global color table follows (2 entries).
    bytes.extend_from_slice(&[0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]);
    // Global color table: black, white.
    bytes.extend_from_slice(&[0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF]);
    // Image descriptor: 1x1 at origin, no local color table.
    bytes.extend_from_slice(&[0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    // Image data: LZW min code size, one sub-block, terminator.
    bytes.extend_from_slice(&[0x02, 0x02, 0x44, 0x01, 0x00]);
    // Trailer.
    bytes.push(0x3B);
    std::fs::write(path, bytes).expect("write real gif fixture");
}

fn fixture_dir() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let staging = dir.path().join("staging");
    std::fs::create_dir_all(&staging).unwrap();
    dir
}

#[test]
fn sniff_image_mime_recognizes_real_image_magic_bytes() {
    let dir = fixture_dir();
    let staging = dir.path().join("staging");
    write_real_png(&staging.join("photo.png"));
    write_real_jpeg(&staging.join("photo.jpg"));
    write_real_gif(&staging.join("photo.gif"));

    let png = std::fs::read(staging.join("photo.png")).unwrap();
    let jpeg = std::fs::read(staging.join("photo.jpg")).unwrap();
    let gif = std::fs::read(staging.join("photo.gif")).unwrap();

    assert_eq!(sniff_image_mime(&png), Some("image/png"));
    assert_eq!(sniff_image_mime(&jpeg), Some("image/jpeg"));
    assert_eq!(sniff_image_mime(&gif), Some("image/gif"));
    assert_eq!(sniff_image_mime(b"not an image at all"), None);
    assert_eq!(sniff_image_mime(b""), None);
}

#[test]
fn content_addressed_import_writes_digest_path_and_dedups() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let bytes = b"the same bytes twice";
    let hash = sha256_hex(bytes);

    let first = content_addressed_import(&media_root, bytes, "image/png").expect("import");
    assert_eq!(first, format!("street-view/imported/{hash}.png"));
    let file = media_root.join(&first);
    assert!(file.is_file(), "imported artifact exists");
    assert_eq!(std::fs::read(&file).unwrap(), bytes);

    // Identical bytes dedup: re-import does not rewrite and returns the same path.
    let second = content_addressed_import(&media_root, bytes, "image/png").expect("re-import");
    assert_eq!(first, second);

    let unsupported =
        content_addressed_import(&media_root, bytes, "application/octet-stream").expect_err("reject");
    assert!(unsupported.contains("unsupported mime"));
}

#[test]
fn valid_png_ingest_lands_in_street_view_store_with_full_provenance() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("amsterdam-canal.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let record = ingest_fetched_asset_at(&request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    ))
    .expect("ingest accepted");
    assert!(record.validation.all_ok(), "gate passes a real licensed image");
    assert_eq!(record.mime_type, "image/png");
    assert_eq!(record.agent_session_id, SESSION);
    assert_eq!(record.place_id.as_deref(), Some(PLACE_AMSTERDAM));
    assert_eq!(record.redaction_status, REDACTION_STATUS_PENDING);

    let bytes = std::fs::read(&source).unwrap();
    assert_eq!(record.content_hash, sha256_hex(&bytes));
    assert_eq!(
        record.artifact_path,
        format!("street-view/imported/{}.png", record.content_hash)
    );
    assert!(
        media_root.join(&record.artifact_path).is_file(),
        "imported bytes exist under the media root"
    );

    // The street-view store registered the image, keyed by the record link.
    let sv_id = record.street_view_image_id.as_deref().expect("linked street view image");
    let db = Database::open(&database_path).unwrap();
    let sv = StreetViewRepository::new(db.connection())
        .get_by_id(sv_id)
        .unwrap()
        .expect("street view image exists");
    assert_eq!(sv.artifact_path, record.artifact_path);
    assert_eq!(sv.profile_scope, "bootstrapping");
    assert_eq!(sv.redaction_status, REDACTION_STATUS_PENDING);

    // Fetch records list and the place association both resolve.
    let listed = list_fetch_records_at(&database_path, "bootstrapping").expect("list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, record.id);
    let place_records = FetchRecordRepository::new(db.connection())
        .list_for_place("bootstrapping", PLACE_AMSTERDAM)
        .unwrap();
    assert_eq!(place_records.len(), 1);
    assert_eq!(place_records[0].id, record.id);
}

#[test]
fn jpeg_ingest_with_regions_redacts_locally_and_leaves_raw_bytes_untouched() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("market-square.jpg");
    write_real_jpeg(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let mut req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    req.redaction_regions = vec![StreetViewRegion {
        x: 0.0,
        y: 0.0,
        width: 0.25,
        height: 0.25,
        reason: "face".into(),
        source: "manual".into(),
    }];

    let record = ingest_fetched_asset_at(&req).expect("ingest accepted");
    assert!(record.validation.all_ok());
    assert_eq!(record.redaction_status, REDACTION_STATUS_REDACTED);
    let sv_id = record.street_view_image_id.as_deref().expect("linked street view image");

    let db = Database::open(&database_path).unwrap();
    let sv = StreetViewRepository::new(db.connection())
        .get_by_id(sv_id)
        .unwrap()
        .expect("street view image exists");
    assert_eq!(sv.redaction_status, REDACTION_STATUS_REDACTED);
    let redacted_path = sv.redacted_artifact_path.as_deref().expect("redacted artifact path");
    assert!(media_root.join(redacted_path).is_file(), "redacted derived copy written");

    // The redacted copy differs from the raw imported bytes at the top-left.
    let redacted = image::open(media_root.join(redacted_path)).unwrap().to_rgb8();
    let raw = image::open(media_root.join(&record.artifact_path)).unwrap().to_rgb8();
    assert_ne!(redacted.get_pixel(8, 8), raw.get_pixel(8, 8), "blur changes the region");

    // Raw bytes are untouched: the imported artifact still hashes to the fetch
    // record's content hash.
    let imported = std::fs::read(media_root.join(&record.artifact_path)).unwrap();
    assert_eq!(sha256_hex(&imported), record.content_hash);
}

#[test]
fn gif_is_accepted_by_the_gate_and_imported() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("map.gif");
    write_real_gif(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let record = ingest_fetched_asset_at(&request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    ))
    .expect("gif accepted at the gate");
    assert!(record.validation.all_ok());
    assert_eq!(record.mime_type, "image/gif");
    assert!(media_root.join(&record.artifact_path).is_file());
}

#[test]
fn invalid_mime_is_rejected_with_reason_and_no_import() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("not-an-image.png");
    std::fs::write(&source, b"this is not an image, just text").unwrap();
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let record = ingest_fetched_asset_at(&request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    ))
    .expect("rejection is a record, not a hard error");
    assert!(!record.validation.all_ok());
    assert!(!record.validation.mime_ok);
    assert!(record.artifact_path.is_empty(), "no bytes imported");
    assert!(record.street_view_image_id.is_none(), "no street view image");

    let db = Database::open(&database_path).unwrap();
    assert!(StreetViewRepository::new(db.connection())
        .list_for_profile("bootstrapping")
        .unwrap()
        .is_empty());
}

#[test]
fn oversize_is_rejected_against_the_byte_cap() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("big.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let mut req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    req.cap_bytes = Some(100); // real PNG is well over 100 bytes

    let record = ingest_fetched_asset_at(&req).expect("rejection is a record");
    assert!(!record.validation.size_ok, "real PNG exceeds the 100-byte cap");
    assert!(!record.validation.all_ok());
    assert!(record.artifact_path.is_empty());
    assert!(record.validation.mime_ok, "mime still passes independently");
}

#[test]
fn missing_license_is_rejected_with_license_flag_false() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let mut req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    req.license = "   ".into();

    let record = ingest_fetched_asset_at(&req).expect("rejection is a record");
    assert!(!record.validation.license_ok);
    assert!(!record.validation.all_ok());
    assert!(record.artifact_path.is_empty());

    // The blank license is preserved in the rejected record as the audit trail.
    let listed = list_fetch_records_at(&database_path, "bootstrapping").unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].license, "   ");
}

#[test]
fn unauthorized_source_host_is_rejected_with_source_flag_false() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let mut req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    req.source_url = "https://example.com/photos/photo.png".into();

    let record = ingest_fetched_asset_at(&req).expect("rejection is a record");
    assert!(!record.validation.source_ok);
    assert!(!record.validation.all_ok());
    assert!(record.artifact_path.is_empty());

    // A non-http URL (e.g. file://) also fails the source check.
    req.source_url = "file:///etc/passwd".into();
    let record = ingest_fetched_asset_at(&req).expect("rejection is a record");
    assert!(!record.validation.source_ok);
}

#[test]
fn accepted_reingest_is_idempotent() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    let first = ingest_fetched_asset_at(&req).expect("first ingest");
    let second = ingest_fetched_asset_at(&req).expect("re-ingest");

    assert_eq!(first.id, second.id, "same session + url + hash returns the same record");
    assert_eq!(first.street_view_image_id, second.street_view_image_id);

    let db = Database::open(&database_path).unwrap();
    let listed = list_fetch_records_at(&database_path, "bootstrapping").unwrap();
    assert_eq!(listed.len(), 1, "no duplicate fetch record");
    assert_eq!(
        StreetViewRepository::new(db.connection())
            .list_for_profile("bootstrapping")
            .unwrap()
            .len(),
        1,
        "no duplicate street view image"
    );
}

#[test]
fn rejected_attempt_then_corrected_reingest_lands() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let mut req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    req.license = "proprietary".into();
    let rejected = ingest_fetched_asset_at(&req).expect("rejection is a record");
    assert!(!rejected.validation.all_ok());
    assert!(rejected.artifact_path.is_empty());

    // Correct the license and re-ingest — the rejected row (empty artifact
    // path) is outside the accepted-dedup index, so this lands fresh.
    req.license = "public domain".into();
    let accepted = ingest_fetched_asset_at(&req).expect("corrected re-ingest");
    assert!(accepted.validation.all_ok());
    assert_ne!(accepted.id, rejected.id);
    assert!(accepted.street_view_image_id.is_some());

    let listed = list_fetch_records_at(&database_path, "bootstrapping").unwrap();
    assert_eq!(listed.len(), 2, "rejected + accepted records both persist");
}

#[test]
fn gate_requires_profile_scope_media_root_and_agent_session() {
    let dir = fixture_dir();
    let media_root = dir.path().join("media");
    let staging = dir.path().join("staging");
    let source = staging.join("photo.png");
    write_real_png(&source);
    let database_path = dir.path().join("rc-asset.sqlite").to_string_lossy().to_string();
    let media_root_str = media_root.to_string_lossy().to_string();

    let mut req = request(
        &database_path,
        &media_root_str,
        "bootstrapping",
        source.to_string_lossy().as_ref(),
    );
    req.profile_scope = None;
    let error = ingest_fetched_asset_at(&req).expect_err("blank profile scope rejected");
    assert!(error.contains("profileScope"));

    req.profile_scope = Some("bootstrapping".into());
    req.media_root = "   ".into();
    let error = ingest_fetched_asset_at(&req).expect_err("blank media root rejected");
    assert!(error.contains("mediaRoot"));

    req.media_root = media_root_str.clone();
    req.agent_session_id = "   ".into();
    let error = ingest_fetched_asset_at(&req).expect_err("blank agent session rejected");
    assert!(error.contains("agentSessionId"));
}
