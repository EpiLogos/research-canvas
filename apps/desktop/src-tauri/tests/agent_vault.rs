use research_canvas_desktop_lib::agent::types::VaultDocument;
use research_canvas_desktop_lib::agent::vault::index_vault_roots;
use serde_json::json;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn write_file(root: &Path, relative_path: &str, contents: impl AsRef<[u8]>) -> PathBuf {
    let path = root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create fixture parent directory");
    }
    fs::write(&path, contents).expect("write fixture file");
    path
}

fn canonical_string(path: &Path) -> String {
    path.canonicalize()
        .expect("canonicalize path")
        .to_string_lossy()
        .into_owned()
}

fn document_by_relative_path<'a>(
    documents: &'a [VaultDocument],
    relative_path: &str,
) -> &'a VaultDocument {
    documents
        .iter()
        .find(|document| document.relative_path == relative_path)
        .expect("document exists for relative path")
}

#[test]
fn indexes_markdown_metadata_from_a_real_root() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let markdown = concat!(
        "---\n",
        "title: The Antichrist\n",
        "tags:\n",
        "  - critique\n",
        "  - source\n",
        "---\n",
        "# First Thesis\n",
        "Body with [[People/Nietzsche|Nietzsche]] and [[Values]].\n",
        "## Consequence\n",
    );
    let file_path = write_file(temp_dir.path(), "notes/antichrist.md", markdown);

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    let document = document_by_relative_path(&documents, "notes/antichrist.md");
    assert_eq!(document.title, "The Antichrist");
    assert_eq!(document.absolute_path, canonical_string(&file_path));
    assert_eq!(document.path, document.absolute_path);
    assert_eq!(
        document.root_path,
        canonical_string(temp_dir.path()).as_str()
    );
    assert_eq!(document.relative_path, "notes/antichrist.md");
    assert_eq!(document.tags, vec!["critique", "source"]);
    assert_eq!(document.headings.len(), 2);
    assert_eq!(document.headings[0].level, 1);
    assert_eq!(document.headings[0].text, "First Thesis");
    assert_eq!(document.headings[1].level, 2);
    assert_eq!(document.headings[1].text, "Consequence");
    assert_eq!(document.wikilinks.len(), 2);
    assert_eq!(document.wikilinks[0].target, "People/Nietzsche");
    assert_eq!(document.wikilinks[0].label.as_deref(), Some("Nietzsche"));
    assert_eq!(document.wikilinks[1].target, "Values");
    assert_eq!(document.frontmatter["title"], json!("The Antichrist"));
    assert_eq!(document.frontmatter["tags"], json!(["critique", "source"]));
    assert_eq!(document.size_bytes, markdown.as_bytes().len() as u64);
    assert!(document.snippet.contains("Body with"));
}

#[test]
fn includes_text_like_non_markdown_and_excludes_images_without_markdown_metadata() {
    let temp_dir = TempDir::new().expect("create temp dir");
    write_file(
        temp_dir.path(),
        "notes/plain.txt",
        "Plain text with [[Not Parsed]].\n# Not a markdown heading here.\n",
    );
    write_file(
        temp_dir.path(),
        "assets/pixel.png",
        [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'],
    );

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    let document = document_by_relative_path(&documents, "notes/plain.txt");
    assert_eq!(document.title, "plain");
    assert!(document.tags.is_empty());
    assert!(document.headings.is_empty());
    assert!(document.wikilinks.is_empty());
    assert!(document.frontmatter.is_empty());
    assert!(document.snippet.contains("[[Not Parsed]]"));
    assert!(documents
        .iter()
        .all(|document| document.relative_path != "assets/pixel.png"));
}

#[test]
fn skips_hidden_directories_and_files_through_the_existing_indexer() {
    let temp_dir = TempDir::new().expect("create temp dir");
    write_file(temp_dir.path(), "visible.md", "# Visible\n");
    write_file(temp_dir.path(), ".hidden/secret.md", "# Secret\n");
    write_file(temp_dir.path(), ".secret.md", "# Also Secret\n");

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].relative_path, "visible.md");
    assert!(documents
        .iter()
        .all(|document| !document.relative_path.contains(".hidden")));
    assert!(documents
        .iter()
        .all(|document| document.relative_path != ".secret.md"));
}

#[test]
fn skips_text_like_files_under_common_build_and_cache_directories() {
    let temp_dir = TempDir::new().expect("create temp dir");
    write_file(temp_dir.path(), "notes/keep.txt", "Keep this text.\n");
    write_file(
        temp_dir.path(),
        "node_modules/pkg/generated.txt",
        "dependency cache text",
    );
    write_file(temp_dir.path(), "target/debug/build.txt", "compiled text");
    write_file(temp_dir.path(), "dist/assets/bundle.txt", "bundled text");
    write_file(temp_dir.path(), ".next/cache/page.txt", "next cache text");

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].relative_path, "notes/keep.txt");
    for skipped_path in [
        "node_modules/pkg/generated.txt",
        "target/debug/build.txt",
        "dist/assets/bundle.txt",
        ".next/cache/page.txt",
    ] {
        assert!(
            documents
                .iter()
                .all(|document| document.relative_path != skipped_path),
            "{skipped_path} should not be indexed as a vault document"
        );
    }
}

#[test]
fn deduplicates_multiple_roots_by_canonical_document_path() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path().join("vault");
    fs::create_dir_all(&root).expect("create vault root");
    let file_path = write_file(&root, "shared.md", "# Shared\n");
    let symlink_path = temp_dir.path().join("vault-link");

    let roots = match create_directory_symlink(&root, &symlink_path) {
        Ok(()) => vec![root.clone(), symlink_path],
        Err(_) => vec![root.clone(), root.clone()],
    };

    let documents = index_vault_roots(roots.iter()).expect("index vault roots");

    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].absolute_path, canonical_string(&file_path));
    assert_eq!(documents[0].relative_path, "shared.md");
}

#[test]
fn uses_search_text_policy_and_does_not_index_sensitive_or_unsupported_files() {
    let temp_dir = TempDir::new().expect("create temp dir");
    write_file(temp_dir.path(), "notes/keep.md", "# Keep\n");
    write_file(temp_dir.path(), "notes/plain.txt", "Plain text.\n");
    write_file(temp_dir.path(), ".env", "SECRET=hidden\n");
    write_file(temp_dir.path(), "prod.env", "SECRET=visible\n");
    write_file(temp_dir.path(), "notes/custom.foo", "Unsupported text.\n");

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");
    let relative_paths: Vec<&str> = documents
        .iter()
        .map(|document| document.relative_path.as_str())
        .collect();

    assert_eq!(relative_paths, vec!["notes/keep.md", "notes/plain.txt"]);
}

#[test]
fn skips_invalid_utf8_markdown_and_continues_indexing_valid_files() {
    let temp_dir = TempDir::new().expect("create temp dir");
    write_file(temp_dir.path(), "valid.md", "# Valid\n");
    write_file(
        temp_dir.path(),
        "invalid.md",
        [0xff, 0xfe, b'#', b' ', b'B'],
    );

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    assert_eq!(documents[0].relative_path, "valid.md");
}

#[test]
fn caps_large_markdown_body_and_snippet_while_parsing_full_file_link_metadata() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let repeated = "alpha \u{1F984}\n".repeat(15_000);
    let markdown = format!(
        "---\ntags: [large]\n---\n# Large Note\n\nSee [[Early Target]].\n{repeated}\nSee [[Tail Target]].\n"
    );
    write_file(temp_dir.path(), "large.md", markdown.as_bytes());

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    let document = document_by_relative_path(&documents, "large.md");
    assert_eq!(document.tags, vec!["large"]);
    assert_eq!(document.headings.len(), 1);
    assert_eq!(document.headings[0].text, "Large Note");
    assert_eq!(document.wikilinks.len(), 2);
    assert_eq!(document.wikilinks[0].target, "Early Target");
    assert_eq!(document.wikilinks[1].target, "Tail Target");
    assert!(document.body.len() < markdown.len());
    assert!(document.body.len() <= 16_384);
    assert!(!document.body.contains("Tail Target"));
    assert!(document.snippet.len() < markdown.len());
    assert!(document.snippet.len() <= 4096);
    assert!(!document.snippet.contains("Tail Target"));
    assert!(std::str::from_utf8(document.snippet.as_bytes()).is_ok());
}

#[test]
fn indexes_large_text_file_from_valid_bounded_prefix_despite_late_invalid_utf8() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let mut contents = "safe text\n".repeat(20_000).into_bytes();
    contents.extend_from_slice(&[0xff, 0xfe, 0xfd]);
    write_file(temp_dir.path(), "large.txt", contents);

    let documents = index_vault_roots([temp_dir.path()]).expect("index vault root");

    assert_eq!(documents.len(), 1);
    let document = document_by_relative_path(&documents, "large.txt");
    assert_eq!(document.title, "large");
    assert!(document.body.len() <= 16_384);
    assert!(document.snippet.len() <= 4096);
    assert!(document.body.contains("safe text"));
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
