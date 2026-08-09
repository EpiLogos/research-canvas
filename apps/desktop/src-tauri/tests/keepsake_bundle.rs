use std::fs;

use research_canvas_desktop_lib::commands::keepsake::write_keepsake_bundle_at;
use tempfile::tempdir;

fn manifest_json() -> String {
    serde_json::json!({
        "formatVersion": 1,
        "title": "The Crossing",
        "profileScope": "migration",
        "defaultLanguage": "original",
        "scenes": [
            {
                "sceneId": "scene-arrival",
                "placeId": "pleiades:520998",
                "title": "Arrival",
                "languageVariants": [
                    { "language": "ar", "derivedArtifactId": "translations/ar/arrival.vtt" }
                ],
                "passages": [
                    {
                        "artifactId": "recording-001",
                        "unit": { "kind": "timestamp_range", "startMs": 12000, "endMs": 45000 },
                        "gaps": []
                    }
                ],
                "media": ["media/arrival.mp3", "transcripts/arrival.vtt", "translations/ar/arrival.vtt"]
            }
        ],
        "media": ["media/arrival.mp3", "transcripts/arrival.vtt", "translations/ar/arrival.vtt"],
        "walk": [{ "latitude": 41.0082, "longitude": 28.9784 }]
    })
    .to_string()
}

fn manifest_value() -> serde_json::Value {
    serde_json::from_str(&manifest_json()).unwrap()
}

#[test]
fn keepsake_bundle_copies_media_and_writes_the_manifest() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    fs::create_dir_all(media_root.join("media")).unwrap();
    fs::create_dir_all(media_root.join("translations/ar")).unwrap();
    fs::create_dir_all(media_root.join("transcripts")).unwrap();
    fs::write(media_root.join("media/arrival.mp3"), b"audio").unwrap();
    fs::write(media_root.join("transcripts/arrival.vtt"), "WEBVTT\n").unwrap();
    fs::write(media_root.join("translations/ar/arrival.vtt"), "WEBVTT\n").unwrap();
    let output_dir = dir.path().join("keepsake");

    let result = write_keepsake_bundle_at(
        output_dir.to_string_lossy().as_ref(),
        media_root.to_string_lossy().as_ref(),
        &manifest_json(),
    )
    .expect("write keepsake");

    assert_eq!(result.media_copied, 3);
    assert!(output_dir.join("keepsake.json").is_file());
    assert!(output_dir.join("media/arrival.mp3").is_file());
    assert!(output_dir.join("translations/ar/arrival.vtt").is_file());
    let written = fs::read_to_string(output_dir.join("keepsake.json")).unwrap();
    assert!(written.contains("\"profileScope\":\"migration\""));
}

#[test]
fn keepsake_bundle_rejects_traversal_and_missing_media() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    fs::create_dir_all(&media_root).unwrap();
    fs::write(media_root.join("ok.mp3"), b"audio").unwrap();
    let output_dir = dir.path().join("keepsake");

    let mut traversal = manifest_value();
    traversal["media"] = serde_json::json!(["../../outside.mp3"]);
    let error = write_keepsake_bundle_at(
        output_dir.to_string_lossy().as_ref(),
        media_root.to_string_lossy().as_ref(),
        &traversal.to_string(),
    )
    .expect_err("traversal must be rejected");
    assert!(error.contains("non-portable"));

    let mut missing = manifest_value();
    missing["media"] = serde_json::json!(["media/not-there.mp3"]);
    let error = write_keepsake_bundle_at(
        output_dir.to_string_lossy().as_ref(),
        media_root.to_string_lossy().as_ref(),
        &missing.to_string(),
    )
    .expect_err("missing media must be rejected");
    assert!(error.contains("not found"));
}

#[test]
fn keepsake_bundle_rejects_unknown_formats_and_non_original_defaults() {
    let dir = tempdir().unwrap();
    let output_dir = dir.path().join("keepsake");
    let media_root = dir.path().join("media");

    let mut bad_version = manifest_value();
    bad_version["formatVersion"] = serde_json::json!(2);
    let error = write_keepsake_bundle_at(
        output_dir.to_string_lossy().as_ref(),
        media_root.to_string_lossy().as_ref(),
        &bad_version.to_string(),
    )
    .expect_err("unsupported version");
    assert!(error.contains("format version"));

    let mut bad_default = manifest_value();
    bad_default["defaultLanguage"] = serde_json::json!("ar");
    let error = write_keepsake_bundle_at(
        output_dir.to_string_lossy().as_ref(),
        media_root.to_string_lossy().as_ref(),
        &bad_default.to_string(),
    )
    .expect_err("default language must stay canonical");
    assert!(error.contains("defaultLanguage"));
}
