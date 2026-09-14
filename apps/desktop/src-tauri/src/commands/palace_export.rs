use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Palace export writer (refinement-2 D5.10): the palace scene bundle is built
/// by the shared TS scene builder (`buildPalaceScene`), which is the authority
/// for room geometry, QL 6+6' shaping, and encapsulation objectification. This
/// command validates the portable JSON and writes `palace-bundle.json` into the
/// output directory so the public viewer can render the 3D palace offline.
/// The bundle is fully self-contained (no media references), so no copying is
/// required beyond the single JSON file.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritePalaceBundleRequest {
    pub output_dir: String,
    pub bundle_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PalaceWriteResult {
    pub bundle_path: String,
}

#[tauri::command]
pub fn write_palace_bundle_command(
    request: WritePalaceBundleRequest,
) -> Result<PalaceWriteResult, String> {
    write_palace_bundle_at(&request.output_dir, &request.bundle_json)
}

pub fn write_palace_bundle_at(
    output_dir: &str,
    bundle_json: &str,
) -> Result<PalaceWriteResult, String> {
    if output_dir.trim().is_empty() {
        return Err("outputDir must not be empty".into());
    }
    let bundle: Value =
        serde_json::from_str(bundle_json).map_err(|error| format!("palace bundle is not valid JSON: {error}"))?;
    let format_version = bundle
        .get("formatVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "palace bundle missing numeric formatVersion".to_string())?;
    if format_version != 1 {
        return Err(format!("unsupported palace bundle format version {format_version}"));
    }
    if bundle.get("scene").is_none() {
        return Err("palace bundle missing scene".into());
    }

    let output_root = PathBuf::from(output_dir);
    std::fs::create_dir_all(&output_root).map_err(|error| error.to_string())?;
    let bundle_path = output_root.join("palace-bundle.json");
    std::fs::write(&bundle_path, bundle_json).map_err(|error| error.to_string())?;

    Ok(PalaceWriteResult {
        bundle_path: "palace-bundle.json".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_valid_palace_bundle_to_the_output_dir() {
        let dir = std::env::temp_dir().join(format!("palace-export-test-{}", std::process::id()));
        let json = r#"{"formatVersion":1,"profileScope":"bootstrapping","scene":{"rooms":[]},"nodes":[],"relationships":[],"encapsulationEdges":[],"curation":{"chambers":[]}}"#;
        let result = write_palace_bundle_at(dir.to_str().unwrap(), json).unwrap();
        assert_eq!(result.bundle_path, "palace-bundle.json");
        let written = std::fs::read_to_string(dir.join("palace-bundle.json")).unwrap();
        assert!(written.contains("\"formatVersion\":1"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_a_non_palace_bundle() {
        let err = write_palace_bundle_at("/tmp", r#"{"formatVersion":2}"#).unwrap_err();
        assert!(err.contains("unsupported palace bundle format version"));
        let err2 = write_palace_bundle_at("/tmp", "not json").unwrap_err();
        assert!(err2.contains("not valid JSON"));
    }
}
