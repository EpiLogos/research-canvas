// apps/desktop/src-tauri/tests/neo4j_deps.rs
#[test]
fn neo4rs_and_tokio_are_available() {
    // Compile-time proof the crates are linked; constructing a config does not connect.
    let _q = neo4rs::query("RETURN 1");
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("tokio runtime");
    let two = rt.block_on(async { 1 + 1 });
    assert_eq!(two, 2);
}
