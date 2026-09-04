use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::repositories::assert_portable_street_view_path as assert_portable_path;

/// Keepsake export writer (vision §3.13/§3.16, tickets #8/#11): the manifest
/// is built by the shared TS exporter (the semantic authority for consent
/// filtering and language variants); this command validates the portable-path
/// invariants and copies the referenced media into a self-contained bundle
/// with no hardcoded local paths.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteKeepsakeRequest {
    pub output_dir: String,
    pub media_root: String,
    pub manifest_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepsakeManifestWire {
    pub format_version: u32,
    pub title: String,
    pub profile_scope: String,
    pub default_language: String,
    pub scenes: Vec<KeepsakeSceneWire>,
    pub media: Vec<String>,
    pub walk: Vec<KeepsakeWalkPointWire>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepsakeSceneWire {
    pub scene_id: String,
    pub place_id: String,
    pub title: String,
    pub language_variants: Vec<Value>,
    pub passages: Vec<Value>,
    pub media: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepsakeWalkPointWire {
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepsakeWriteResult {
    pub media_copied: usize,
    pub manifest_path: String,
}

#[tauri::command]
pub fn write_keepsake_bundle_command(
    request: WriteKeepsakeRequest,
) -> Result<KeepsakeWriteResult, String> {
    write_keepsake_bundle_at(&request.output_dir, &request.media_root, &request.manifest_json)
}

pub fn write_keepsake_bundle_at(
    output_dir: &str,
    media_root: &str,
    manifest_json: &str,
) -> Result<KeepsakeWriteResult, String> {
    if output_dir.trim().is_empty() || media_root.trim().is_empty() {
        return Err("outputDir and mediaRoot must not be empty".into());
    }
    let manifest: KeepsakeManifestWire =
        serde_json::from_str(manifest_json).map_err(|error| {
            format!("keepsake manifest is not valid JSON: {error}")
        })?;
    if manifest.format_version != 1 {
        return Err(format!(
            "unsupported keepsake format version {}",
            manifest.format_version
        ));
    }
    if manifest.default_language != "original" {
        return Err("keepsake defaultLanguage must be the canonical 'original'".into());
    }

    let media_paths = collect_media_paths(&manifest)?;
    let output_root = PathBuf::from(output_dir);
    std::fs::create_dir_all(&output_root).map_err(|error| error.to_string())?;

    let mut copied = 0usize;
    for relative in &media_paths {
        assert_portable_path(relative, "keepsake media").map_err(|error| error.to_string())?;
        let source = Path::new(media_root).join(relative);
        if !source.is_file() {
            return Err(format!(
                "keepsake media source not found at media root: {relative}"
            ));
        }
        let destination = output_root.join(relative);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::copy(&source, &destination).map_err(|error| {
            format!("cannot copy keepsake media {relative}: {error}")
        })?;
        copied += 1;
    }

    let manifest_path = output_root.join("keepsake.json");
    std::fs::write(&manifest_path, manifest_json).map_err(|error| error.to_string())?;

    Ok(KeepsakeWriteResult {
        media_copied: copied,
        manifest_path: "keepsake.json".into(),
    })
}

fn collect_media_paths(manifest: &KeepsakeManifestWire) -> Result<Vec<String>, String> {
    let mut paths: Vec<String> = manifest.media.clone();
    for scene in &manifest.scenes {
        for media in &scene.media {
            if !paths.contains(media) {
                paths.push(media.clone());
            }
        }
    }
    paths.sort();
    Ok(paths)
}
