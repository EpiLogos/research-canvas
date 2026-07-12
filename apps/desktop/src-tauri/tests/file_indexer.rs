use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use research_canvas_desktop_lib::fs::indexer::{index_directory, IndexedEntryKind};
use tempfile::TempDir;

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

#[test]
fn skips_common_build_and_cache_directories() {
    let temp_dir = TempDir::new().expect("create temp dir");
    write_file(temp_dir.path(), "notes/keep.md", "# Keep\n");
    write_file(
        temp_dir.path(),
        "node_modules/pkg/index.txt",
        "dependency text",
    );
    write_file(temp_dir.path(), "target/debug/output.txt", "compiled text");
    write_file(temp_dir.path(), "dist/bundle.txt", "bundled text");
    write_file(temp_dir.path(), ".next/cache/page.txt", "next cache text");

    let entries = index_directory(temp_dir.path()).expect("index temp tree");

    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "notes/keep.md"));
    for skipped_path in [
        "node_modules",
        "node_modules/pkg/index.txt",
        "target",
        "target/debug/output.txt",
        "dist",
        "dist/bundle.txt",
        ".next",
        ".next/cache/page.txt",
    ] {
        assert!(
            entries
                .iter()
                .all(|entry| entry.relative_path != skipped_path),
            "{skipped_path} should be skipped by the indexer"
        );
    }
}

#[test]
fn does_not_follow_directory_symlinks_outside_the_root() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path().join("root");
    let outside = temp_dir.path().join("outside");
    fs::create_dir_all(&root).expect("create root");
    fs::create_dir_all(&outside).expect("create outside");
    write_file(&root, "inside.md", "# Inside\n");
    write_file(&outside, "outside.md", "# Outside\n");

    let link = root.join("outside-link");
    if create_directory_symlink(&outside, &link).is_err() {
        return;
    }

    let entries = index_directory(&root).expect("index root");

    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "inside.md"));
    assert!(entries
        .iter()
        .all(|entry| entry.relative_path != "outside-link"));
    assert!(entries
        .iter()
        .all(|entry| entry.relative_path != "outside-link/outside.md"));
}

#[test]
fn does_not_follow_directory_symlink_cycles_back_to_an_ancestor() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path().join("root");
    fs::create_dir_all(&root).expect("create root");
    write_file(&root, "inside.md", "# Inside\n");

    let link = root.join("root-link");
    if create_directory_symlink(&root, &link).is_err() {
        return;
    }

    let entries = index_directory(&root).expect("index root");

    assert_eq!(
        entries
            .iter()
            .filter(|entry| entry.relative_path == "inside.md")
            .count(),
        1
    );
    assert!(entries
        .iter()
        .all(|entry| !entry.relative_path.starts_with("root-link")));
}

fn write_file(root: &Path, relative_path: &str, contents: &str) -> PathBuf {
    let path = root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create fixture parent directory");
    }
    fs::write(&path, contents).expect("write fixture file");
    path
}

#[cfg(unix)]
fn create_directory_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_directory_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
}

#[cfg(not(any(unix, windows)))]
fn create_directory_symlink(_target: &Path, _link: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "directory symlinks are not supported on this platform",
    ))
}
