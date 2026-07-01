// apps/desktop/src-tauri/src/db/neo4j/config.rs
#[derive(Debug)]
pub struct Neo4jConfig {
    pub uri: String,
    pub user: String,
    pub password: String,
    pub database: String,
}

impl Neo4jConfig {
    pub fn from_env() -> Result<Self, String> {
        let uri = std::env::var("NEO4J_URI")
            .unwrap_or_else(|_| "bolt://127.0.0.1:7687".to_string());
        let user = std::env::var("NEO4J_USER").unwrap_or_else(|_| "neo4j".to_string());
        let password = std::env::var("NEO4J_PASSWORD")
            .map_err(|_| "NEO4J_PASSWORD is required (set it in .env)".to_string())?;
        let database = std::env::var("NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string());
        Ok(Self { uri, user, password, database })
    }
}
