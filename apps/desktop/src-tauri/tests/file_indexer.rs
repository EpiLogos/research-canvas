use std::path::PathBuf;

use research_canvas_desktop_lib::fs::indexer::{index_directory, IndexedEntryKind};

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("tests/fixtures/sample-project")
}

#[test]
fn indexes_a_real_fixture_tree_and_discovers_nested_files() {
    let fixture = fixture_root();
    let entries = index_directory(&fixture).expect("index fixture");

    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "README.md"));
    assert!(entries.iter().any(|entry| entry.relative_path == "notes"));
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "notes/outline.md"));
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "assets/example.png"));

    let image_entry = entries
        .iter()
        .find(|entry| entry.relative_path == "assets/example.png")
        .expect("image entry");
    assert_eq!(image_entry.kind, IndexedEntryKind::Image);
    assert!(image_entry.size_bytes > 0);
}

#[test]
fn ignores_hidden_noise_when_scanning_the_fixture_tree() {
    let fixture = fixture_root();
    let entries = index_directory(&fixture).expect("index fixture");

    assert!(entries.iter().all(|entry| !entry.name.starts_with('.')));
}
