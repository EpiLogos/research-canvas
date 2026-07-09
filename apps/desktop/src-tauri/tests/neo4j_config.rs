// apps/desktop/src-tauri/tests/neo4j_config.rs
use research_canvas_desktop_lib::db::neo4j::config::Neo4jConfig;
use std::io::Write;

#[test]
fn from_env_uses_defaults_and_requires_password() {
    std::env::set_var("NEO4J_PASSWORD", "pw-123");
    std::env::remove_var("NEO4J_URI");
    std::env::remove_var("NEO4J_USER");
    std::env::remove_var("NEO4J_DATABASE");

    let missing_dotenv = std::env::temp_dir().join("research-canvas-missing-neo4j.env");
    let cfg = Neo4jConfig::from_env_with_dotenv_file(&missing_dotenv).expect("config from env");
    assert_eq!(cfg.uri, "bolt://127.0.0.1:17687");
    assert_eq!(cfg.user, "neo4j");
    assert_eq!(cfg.password, "pw-123");
    assert_eq!(cfg.database, "neo4j");
}

#[test]
fn from_env_errors_when_password_missing() {
    std::env::remove_var("NEO4J_PASSWORD");
    let missing_dotenv = std::env::temp_dir().join("research-canvas-missing-neo4j.env");
    let err = Neo4jConfig::from_env_with_dotenv_file(&missing_dotenv)
        .expect_err("missing password is an error");
    assert!(
        err.contains("NEO4J_PASSWORD"),
        "error mentions the missing var: {err}"
    );
}

#[test]
fn from_env_with_dotenv_file_uses_file_values_when_process_env_is_missing() {
    std::env::remove_var("NEO4J_URI");
    std::env::remove_var("NEO4J_USER");
    std::env::remove_var("NEO4J_PASSWORD");
    std::env::remove_var("NEO4J_DATABASE");

    let mut dotenv = tempfile::NamedTempFile::new().expect("temp dotenv");
    writeln!(
        dotenv,
        "NEO4J_URI=bolt://127.0.0.1:27687\nNEO4J_USER=neo4j-file\nNEO4J_PASSWORD=file-pw\nNEO4J_DATABASE=neo4j-file"
    )
    .expect("write dotenv");

    let cfg = Neo4jConfig::from_env_with_dotenv_file(dotenv.path()).expect("config from dotenv");

    assert_eq!(cfg.uri, "bolt://127.0.0.1:27687");
    assert_eq!(cfg.user, "neo4j-file");
    assert_eq!(cfg.password, "file-pw");
    assert_eq!(cfg.database, "neo4j-file");
}
