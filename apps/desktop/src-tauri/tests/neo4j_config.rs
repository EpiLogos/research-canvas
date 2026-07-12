// apps/desktop/src-tauri/tests/neo4j_config.rs
use research_canvas_desktop_lib::db::neo4j::config::Neo4jConfig;

#[test]
fn from_env_uses_defaults_and_requires_password() {
    std::env::set_var("NEO4J_PASSWORD", "pw-123");
    std::env::remove_var("NEO4J_URI");
    std::env::remove_var("NEO4J_USER");
    std::env::remove_var("NEO4J_DATABASE");

    let cfg = Neo4jConfig::from_env().expect("config from env");
    assert_eq!(cfg.uri, "bolt://127.0.0.1:7687");
    assert_eq!(cfg.user, "neo4j");
    assert_eq!(cfg.password, "pw-123");
    assert_eq!(cfg.database, "neo4j");
}

#[test]
fn from_env_errors_when_password_missing() {
    std::env::remove_var("NEO4J_PASSWORD");
    let err = Neo4jConfig::from_env().expect_err("missing password is an error");
    assert!(
        err.contains("NEO4J_PASSWORD"),
        "error mentions the missing var: {err}"
    );
}
