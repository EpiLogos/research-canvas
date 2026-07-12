// apps/desktop/src-tauri/src/db/neo4j/config.rs
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub struct Neo4jConfig {
    pub uri: String,
    pub user: String,
    pub password: String,
    pub database: String,
}

impl Neo4jConfig {
    pub fn from_env() -> Result<Self, String> {
        Self::from_env_with_optional_dotenv(default_dotenv_path())
    }

    pub fn from_env_with_dotenv_file(path: impl AsRef<Path>) -> Result<Self, String> {
        Self::from_env_with_optional_dotenv(Some(path.as_ref().to_path_buf()))
    }

    fn from_env_with_optional_dotenv(dotenv_path: Option<PathBuf>) -> Result<Self, String> {
        let dotenv_values = match dotenv_path {
            Some(path) => read_dotenv_file(&path)?,
            None => HashMap::new(),
        };
        let value_for = |key: &str| {
            std::env::var(key)
                .ok()
                .or_else(|| dotenv_values.get(key).cloned())
        };

        let uri = value_for("NEO4J_URI").unwrap_or_else(|| "bolt://127.0.0.1:17687".to_string());
        let user = value_for("NEO4J_USER").unwrap_or_else(|| "neo4j".to_string());
        let password = value_for("NEO4J_PASSWORD")
            .ok_or_else(|| "NEO4J_PASSWORD is required (set it in .env)".to_string())?;
        let database = value_for("NEO4J_DATABASE").unwrap_or_else(|| "neo4j".to_string());
        Ok(Self {
            uri,
            user,
            password,
            database,
        })
    }
}

fn default_dotenv_path() -> Option<PathBuf> {
    find_up(Path::new(env!("CARGO_MANIFEST_DIR")), ".env")
}

fn find_up(start: &Path, file_name: &str) -> Option<PathBuf> {
    for dir in start.ancestors() {
        let candidate = dir.join(file_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn read_dotenv_file(path: &Path) -> Result<HashMap<String, String>, String> {
    if !path.exists() {
        return Ok(HashMap::new());
    }

    let text = std::fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let mut values = HashMap::new();
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((raw_key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = raw_key.trim();
        if key.is_empty() {
            continue;
        }
        let value = raw_value.trim().trim_matches(['"', '\'']).to_string();
        values.insert(key.to_string(), value);
    }
    Ok(values)
}
