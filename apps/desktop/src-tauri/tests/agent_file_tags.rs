use research_canvas_desktop_lib::agent::curation::add_file_tag;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::{symlink, PermissionsExt};
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn write_markdown(temp_dir: &TempDir, relative_path: &str, contents: &str) -> PathBuf {
    let path = temp_dir.path().join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create markdown parent directory");
    }
    fs::write(&path, contents).expect("write markdown fixture");
    path
}

fn read_file(path: &Path) -> String {
    fs::read_to_string(path).expect("read markdown file")
}

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[test]
fn no_frontmatter_creates_frontmatter_at_top_and_preserves_body_exactly() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let body = "# Opening\n\nBody text.\n";
    let path = write_markdown(&temp_dir, "notes/no-frontmatter.md", body);

    let report = add_file_tag(&path, "curated").expect("add file tag");
    let updated = read_file(&path);

    assert!(report.changed);
    assert_eq!(report.path, display_path(&path));
    assert_eq!(report.detail, "added tag 'curated'");
    assert!(updated.starts_with("---\ntags: [curated]\n---\n"));
    assert_eq!(
        updated
            .strip_prefix("---\ntags: [curated]\n---\n")
            .expect("frontmatter prefix exists"),
        body
    );
}

#[test]
fn inline_tags_adds_tag_without_losing_existing_tags() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/inline.md",
        "---\ntitle: Inline Tags\ntags: [a, b]\n---\nBody\n",
    );

    let report = add_file_tag(&path, "c").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntitle: Inline Tags\ntags: [a, b, c]\n---\nBody\n"
    );
}

#[test]
fn quoted_inline_tags_are_preserved_when_appending_safe_tag() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/quoted-inline.md",
        "---\ntags: [\"*alias\", '!typed', safe]\n---\nBody\n",
    );

    let report = add_file_tag(&path, "curated").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntags: [\"*alias\", '!typed', safe, curated]\n---\nBody\n"
    );
}

#[test]
fn scalar_tags_adds_tag_safely() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/scalar.md",
        "---\ntags: a, b\nsummary: Keep this\n---\nBody\n",
    );

    let report = add_file_tag(&path, "c").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntags: a, b, c\nsummary: Keep this\n---\nBody\n"
    );
}

#[test]
fn list_tags_adds_tag_in_list_form() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/list.md",
        "---\ntitle: List Tags\ntags:\n  - a\n  - b\n---\nBody\n",
    );

    let report = add_file_tag(&path, "c").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntitle: List Tags\ntags:\n  - a\n  - b\n  - c\n---\nBody\n"
    );
}

#[test]
fn duplicate_list_tag_with_inline_comment_is_noop() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---\ntags:\n  - alpha # keep this note\n  - beta\n---\nBody\n";
    let path = write_markdown(&temp_dir, "notes/list-comment-duplicate.md", original);

    let report = add_file_tag(&path, "alpha").expect("add duplicate file tag");

    assert!(!report.changed);
    assert_eq!(read_file(&path), original);
}

#[test]
fn duplicate_tag_is_noop_with_changed_false_and_file_unchanged() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---\ntags: [a, b]\n---\nBody\n";
    let path = write_markdown(&temp_dir, "notes/duplicate.md", original);

    let report = add_file_tag(&path, "b").expect("add duplicate file tag");

    assert!(!report.changed);
    assert_eq!(report.path, display_path(&path));
    assert_eq!(report.detail, "tag 'b' already present");
    assert_eq!(read_file(&path), original);
}

#[test]
fn malformed_unterminated_frontmatter_errors_and_leaves_file_unchanged() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---\ntags: [a, b]\n# Missing closing delimiter\nBody\n";
    let path = write_markdown(&temp_dir, "notes/malformed.md", original);

    let error = add_file_tag(&path, "c").expect_err("unterminated frontmatter should error");

    assert!(error.to_string().contains("unterminated frontmatter"));
    assert_eq!(read_file(&path), original);
}

#[test]
fn malformed_quoted_inline_tag_errors_and_leaves_file_unchanged() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---\ntags: [\"unterminated]\n---\nBody\n";
    let path = write_markdown(&temp_dir, "notes/malformed-quoted-inline.md", original);

    let error = add_file_tag(&path, "safe").expect_err("malformed quote should error");

    assert!(error.to_string().contains("malformed frontmatter"));
    assert_eq!(read_file(&path), original);
}

#[test]
fn empty_or_whitespace_tag_errors_and_leaves_file_unchanged() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---\ntags: [a]\n---\nBody\n";
    let path = write_markdown(&temp_dir, "notes/blank-tag.md", original);

    let error = add_file_tag(&path, "  \t  ").expect_err("blank tag should error");

    assert!(error.to_string().contains("tag must not be empty"));
    assert_eq!(read_file(&path), original);
}

#[cfg(unix)]
#[test]
fn symlink_target_is_not_mutated_when_replacing_target_path() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let outside_original = "---\ntags: [outside]\n---\nOutside\n";
    let outside_path = write_markdown(&temp_dir, "outside.md", outside_original);
    let link_path = temp_dir.path().join("linked.md");
    symlink(&outside_path, &link_path).expect("create markdown symlink");

    let report = add_file_tag(&link_path, "curated").expect("add tag through symlink path");

    assert!(report.changed);
    assert_eq!(read_file(&outside_path), outside_original);
    assert!(
        !fs::symlink_metadata(&link_path)
            .expect("stat link path")
            .file_type()
            .is_symlink(),
        "mutation should replace the target path, not follow and edit the symlink target"
    );
    assert_eq!(
        read_file(&link_path),
        "---\ntags: [outside, curated]\n---\nOutside\n"
    );
}

#[cfg(unix)]
#[test]
fn file_permissions_are_preserved_after_mutation() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(&temp_dir, "notes/perms.md", "---\ntags: [a]\n---\nBody\n");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).expect("set permissions");

    add_file_tag(&path, "b").expect("add file tag");

    let mode = fs::metadata(&path)
        .expect("stat mutated file")
        .permissions()
        .mode()
        & 0o777;
    assert_eq!(mode, 0o640);
}

#[test]
fn yaml_significant_tags_error_and_leave_file_unchanged() {
    let temp_dir = TempDir::new().expect("create temp dir");

    for tag in [
        "foo: bar",
        "{x}",
        "#tag",
        "\"quoted\"",
        "'quoted'",
        "*alias",
        "&anchor",
        "!typed",
        "@reserved",
        "`reserved`",
        "%reserved",
        "?reserved",
        "|",
        ">",
    ] {
        let original = "---\ntags: [safe]\n---\nBody\n";
        let path = write_markdown(&temp_dir, &format!("notes/{tag:?}.md"), original);

        let error = add_file_tag(&path, tag).expect_err("yaml-significant tag should error");

        assert!(
            error
                .to_string()
                .contains("unsupported frontmatter characters"),
            "unexpected error for {tag:?}: {error}"
        );
        assert_eq!(read_file(&path), original, "file changed for tag {tag:?}");
    }
}

#[test]
fn yaml_schema_scalar_tags_error_and_leave_file_unchanged() {
    let temp_dir = TempDir::new().expect("create temp dir");

    for tag in ["true", "FALSE", "null", "NULL", "~", "123", "-42", "3.14"] {
        let original = "---\ntags: [safe]\n---\nBody\n";
        let path = write_markdown(&temp_dir, &format!("notes/scalar-{tag:?}.md"), original);

        let error = add_file_tag(&path, tag).expect_err("yaml scalar tag should error");

        assert!(
            error
                .to_string()
                .contains("unsupported frontmatter characters"),
            "unexpected error for {tag:?}: {error}"
        );
        assert_eq!(read_file(&path), original, "file changed for tag {tag:?}");
    }
}

#[test]
fn scalar_tags_with_inline_comment_add_tag_before_comment() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/scalar-comment.md",
        "---\ntags: alpha # keep this note\n---\nBody\n",
    );

    let report = add_file_tag(&path, "beta").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntags: alpha, beta # keep this note\n---\nBody\n"
    );
}

#[test]
fn duplicate_scalar_tag_before_inline_comment_is_noop() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---\ntags: alpha # keep this note\n---\nBody\n";
    let path = write_markdown(&temp_dir, "notes/scalar-comment-duplicate.md", original);

    let report = add_file_tag(&path, "alpha").expect("add duplicate file tag");

    assert!(!report.changed);
    assert_eq!(read_file(&path), original);
}

#[test]
fn inline_array_tags_with_comment_add_tag_inside_array() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/inline-comment.md",
        "---\ntags: [alpha] # keep this note\n---\nBody\n",
    );

    let report = add_file_tag(&path, "beta").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntags: [alpha, beta] # keep this note\n---\nBody\n"
    );
}

#[test]
fn inline_array_comment_with_brackets_still_adds_tag_inside_array() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/inline-comment-brackets.md",
        "---\ntags: [alpha] # keep [note]\n---\nBody\n",
    );

    let report = add_file_tag(&path, "beta").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntags: [alpha, beta] # keep [note]\n---\nBody\n"
    );
}

#[test]
fn list_tags_allow_standalone_comment_lines() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/list-standalone-comment.md",
        "---\ntags:\n  - alpha\n  # keep this note\n  - beta\n---\nBody\n",
    );

    let report = add_file_tag(&path, "gamma").expect("add file tag");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---\ntags:\n  - alpha\n  # keep this note\n  - beta\n  - gamma\n---\nBody\n"
    );
}

#[test]
fn utf8_bom_frontmatter_adds_to_existing_block_without_duplicate_frontmatter() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "\u{feff}---\ntags: [a]\n---\nBody\n";
    let path = write_markdown(&temp_dir, "notes/bom.md", original);

    let report = add_file_tag(&path, "b").expect("add tag with bom frontmatter");

    assert!(report.changed);
    assert_eq!(read_file(&path), "\u{feff}---\ntags: [a, b]\n---\nBody\n");
}

#[test]
fn frontmatter_delimiters_allow_trailing_spaces_and_crlf_without_duplicate_frontmatter() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let original = "---  \r\ntags: [a]\r\n--- \t\r\nBody\r\n";
    let path = write_markdown(&temp_dir, "notes/spaced-crlf.md", original);

    let report = add_file_tag(&path, "b").expect("add tag with spaced crlf delimiters");

    assert!(report.changed);
    assert_eq!(
        read_file(&path),
        "---  \r\ntags: [a, b]\r\n--- \t\r\nBody\r\n"
    );
}
