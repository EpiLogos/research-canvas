use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNodeImageRequest {
    pub workspace_root: String,
    pub graph_node_id: String,
    pub source_absolute_path: String,
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

/// Copy an external image into `<workspace_root>/assets/<graph_node_id>/<file>` and
/// return the workspace-relative path. Errors are returned as strings (Tauri command shape).
pub fn import_node_image(request: ImportNodeImageRequest) -> Result<String, String> {
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

    fs::copy(source, &target).map_err(|error| error.to_string())?;

    Ok(relative)
}

#[tauri::command]
pub fn import_node_image_command(request: ImportNodeImageRequest) -> Result<String, String> {
    import_node_image(request)
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
    fn errors_when_source_file_missing() {
        let temp = std::env::temp_dir().join(format!("ws4-assets-missing-{}", std::process::id()));
        let workspace = temp.join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let request = ImportNodeImageRequest {
            workspace_root: workspace.to_string_lossy().to_string(),
            graph_node_id: "n1".to_string(),
            source_absolute_path: workspace.join("does-not-exist.png").to_string_lossy().to_string(),
        };

        assert!(import_node_image(request).is_err());
        fs::remove_dir_all(&temp).ok();
    }
}
