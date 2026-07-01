// apps/desktop/src-tauri/tests/support/mod.rs
use research_canvas_desktop_lib::db::neo4j::{self, config::Neo4jConfig, SharedGraph};

/// Returns a live graph + a unique run id (used to namespace test graph_node_ids)
/// + the database name, or None when NEO4J_TEST_URI is unset (test should skip).
pub fn neo4j_test_graph() -> Option<(SharedGraph, String, String)> {
    let uri = std::env::var("NEO4J_TEST_URI").ok()?;
    std::env::set_var("NEO4J_URI", &uri);
    if std::env::var("NEO4J_PASSWORD").is_err() {
        std::env::set_var("NEO4J_PASSWORD", "antichrist-dev-pw");
    }
    let config = Neo4jConfig::from_env().expect("config");
    let database = config.database.clone();
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio rt");
    let graph = rt.block_on(neo4j::connect(&config)).expect("connect to test neo4j");
    let run_id = uuid::Uuid::new_v4().to_string();
    Some((graph, run_id, database))
}

/// Block on a future using a fresh current-thread runtime (enable_all for bolt I/O).
pub fn block_on<F: std::future::Future>(fut: F) -> F::Output {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio rt")
        .block_on(fut)
}
