// apps/desktop/src-tauri/src/db/neo4j/mod.rs
pub mod config;

use config::Neo4jConfig;

pub type SharedGraph = std::sync::Arc<neo4rs::Graph>;

pub async fn connect(config: &Neo4jConfig) -> Result<SharedGraph, String> {
    let neo_config = neo4rs::ConfigBuilder::default()
        .uri(config.uri.clone())
        .user(config.user.clone())
        .password(config.password.clone())
        .db(config.database.clone())
        .build()
        .map_err(|e| format!("neo4j config build failed: {e}"))?;
    let graph = neo4rs::Graph::connect(neo_config)
        .await
        .map_err(|e| format!("neo4j connect failed: {e}"))?;
    Ok(std::sync::Arc::new(graph))
}
