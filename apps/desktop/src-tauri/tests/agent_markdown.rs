use research_canvas_desktop_lib::agent::markdown::parse_markdown_file;
use serde_json::json;
use std::fs;
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

fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[test]
fn parses_inline_array_tags_and_preserves_body_without_frontmatter() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents =
        "---\ntitle: The Antichrist\ntags: [myth, source]\n---\n# Opening\n\nBody text.\n";
    let path = write_markdown(&temp_dir, "notes/antichrist.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.tags, vec!["myth", "source"]);
    assert_eq!(parsed.frontmatter["title"], json!("The Antichrist"));
    assert_eq!(parsed.frontmatter["tags"], json!(["myth", "source"]));
    assert_eq!(parsed.body, "# Opening\n\nBody text.\n");
}

#[test]
fn parses_comma_separated_tags() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/source.md",
        "---\ntags: myth, source, critique\n---\nBody\n",
    );

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.tags, vec!["myth", "source", "critique"]);
    assert_eq!(
        parsed.frontmatter["tags"],
        json!(["myth", "source", "critique"])
    );
}

#[test]
fn parses_list_form_tags() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/list-tags.md",
        "---\ntags:\n  - myth\n  - source\n---\nBody\n",
    );

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.tags, vec!["myth", "source"]);
    assert_eq!(parsed.frontmatter["tags"], json!(["myth", "source"]));
}

#[test]
fn extracts_markdown_headings_with_level_and_text_from_body() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = write_markdown(
        &temp_dir,
        "notes/headings.md",
        "---\ntags: source\n---\n# First Heading\nBody\n### Third Level\n####Fourth is plain text\n",
    );

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.headings.len(), 2);
    assert_eq!(parsed.headings[0].level, 1);
    assert_eq!(parsed.headings[0].text, "First Heading");
    assert_eq!(parsed.headings[1].level, 3);
    assert_eq!(parsed.headings[1].text, "Third Level");
}

#[test]
fn ignores_headings_and_wikilinks_inside_fenced_code_blocks() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = concat!(
        "# Real Heading\n",
        "```markdown\n",
        "# Hidden Heading\n",
        "[[Hidden Link]]\n",
        "```\n",
        "Body with [[Visible Link|Visible]].\n",
        "~~~\n",
        "## Also Hidden\n",
        "[[Also Hidden]]\n",
        "~~~\n",
        "## Real Subheading\n",
    );
    let path = write_markdown(&temp_dir, "notes/fences.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.headings.len(), 2);
    assert_eq!(parsed.headings[0].text, "Real Heading");
    assert_eq!(parsed.headings[1].text, "Real Subheading");
    assert_eq!(parsed.links.len(), 1);
    assert_eq!(parsed.links[0].target, "Visible Link");
    assert_eq!(parsed.links[0].label.as_deref(), Some("Visible"));
}

#[test]
fn longer_backtick_fence_does_not_close_on_shorter_internal_fence() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = concat!(
        "# Before\n",
        "````rust\n",
        "# Hidden Before Internal Fence\n",
        "```\n",
        "# Still Hidden\n",
        "[[Still Hidden]]\n",
        "   ````   \n",
        "## Visible After Fence\n",
        "[[Visible After Fence]]\n",
    );
    let path = write_markdown(&temp_dir, "notes/longer-fence.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.headings.len(), 2);
    assert_eq!(parsed.headings[0].text, "Before");
    assert_eq!(parsed.headings[1].text, "Visible After Fence");
    assert_eq!(parsed.links.len(), 1);
    assert_eq!(parsed.links[0].target, "Visible After Fence");
}

#[test]
fn extracts_wikilinks_with_targets_labels_source_path_and_byte_ranges() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = "See [[Target]] and [[Target|Alias]] plus [[folder/page#Heading|Alias]].";
    let path = write_markdown(&temp_dir, "notes/links.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.links.len(), 3);

    let first_start = contents.find("[[Target]]").expect("first wikilink exists");
    assert_eq!(parsed.links[0].target, "Target");
    assert_eq!(parsed.links[0].label, None);
    assert_eq!(parsed.links[0].source_path, display_path(&path));
    assert_eq!(parsed.links[0].byte_start, first_start);
    assert_eq!(parsed.links[0].byte_end, first_start + "[[Target]]".len());
    assert_eq!(
        &contents[parsed.links[0].byte_start..parsed.links[0].byte_end],
        "[[Target]]"
    );

    let second_start = contents
        .find("[[Target|Alias]]")
        .expect("second wikilink exists");
    assert_eq!(parsed.links[1].target, "Target");
    assert_eq!(parsed.links[1].label.as_deref(), Some("Alias"));
    assert_eq!(parsed.links[1].byte_start, second_start);
    assert_eq!(
        parsed.links[1].byte_end,
        second_start + "[[Target|Alias]]".len()
    );

    let third_start = contents
        .find("[[folder/page#Heading|Alias]]")
        .expect("third wikilink exists");
    assert_eq!(parsed.links[2].target, "folder/page#Heading");
    assert_eq!(parsed.links[2].label.as_deref(), Some("Alias"));
    assert_eq!(parsed.links[2].byte_start, third_start);
    assert_eq!(
        parsed.links[2].byte_end,
        third_start + "[[folder/page#Heading|Alias]]".len()
    );
}

#[test]
fn tolerates_unsupported_nested_frontmatter_while_preserving_tags() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = concat!(
        "---\n",
        "title: The Antichrist\n",
        "tags: [myth]\n",
        "metadata:\n",
        "  author: Bob\n",
        "---\n",
        "# Body\n",
    );
    let path = write_markdown(&temp_dir, "notes/nested-frontmatter.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert_eq!(parsed.tags, vec!["myth"]);
    assert_eq!(parsed.frontmatter["title"], json!("The Antichrist"));
    assert_eq!(parsed.frontmatter["tags"], json!(["myth"]));
    assert_eq!(parsed.body, "# Body\n");
}

#[test]
fn wikilink_byte_ranges_are_source_file_offsets_after_frontmatter() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = "---\ntags: source\n---\nBody with [[Target|Alias]].\n";
    let path = write_markdown(&temp_dir, "notes/ranges.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    let start = contents.find("[[Target|Alias]]").expect("wikilink exists");
    assert_eq!(parsed.links.len(), 1);
    assert_eq!(parsed.links[0].byte_start, start);
    assert_eq!(parsed.links[0].byte_end, start + "[[Target|Alias]]".len());
    assert_eq!(
        &contents[parsed.links[0].byte_start..parsed.links[0].byte_end],
        "[[Target|Alias]]"
    );
}

#[test]
fn wikilink_byte_ranges_slice_original_file_after_utf8_text() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = "Prelude λόγος before [[Target|Alias]] after.\n";
    let path = write_markdown(&temp_dir, "notes/utf8-ranges.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    let start = contents.find("[[Target|Alias]]").expect("wikilink exists");
    assert_eq!(parsed.links.len(), 1);
    assert_eq!(parsed.links[0].byte_start, start);
    assert_eq!(parsed.links[0].byte_end, start + "[[Target|Alias]]".len());
    assert_eq!(
        &contents[parsed.links[0].byte_start..parsed.links[0].byte_end],
        "[[Target|Alias]]"
    );
}

#[test]
fn wikilink_byte_ranges_slice_original_file_after_crlf_frontmatter() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = "---\r\ntags: [source]\r\n---\r\n# Heading\r\nSee [[Target]].\r\n";
    let path = write_markdown(&temp_dir, "notes/crlf-ranges.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    let start = contents.find("[[Target]]").expect("wikilink exists");
    assert_eq!(parsed.body, "# Heading\r\nSee [[Target]].\r\n");
    assert_eq!(parsed.links.len(), 1);
    assert_eq!(parsed.links[0].byte_start, start);
    assert_eq!(parsed.links[0].byte_end, start + "[[Target]]".len());
    assert_eq!(
        &contents[parsed.links[0].byte_start..parsed.links[0].byte_end],
        "[[Target]]"
    );
}

#[test]
fn preserves_full_text_as_body_when_frontmatter_is_unterminated() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = "---\ntags: [myth, source]\n# Body Becomes Plain Text\n";
    let path = write_markdown(&temp_dir, "notes/unterminated.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert!(parsed.frontmatter.is_empty());
    assert!(parsed.tags.is_empty());
    assert_eq!(parsed.body, contents);
    assert_eq!(parsed.headings[0].text, "Body Becomes Plain Text");
}

#[test]
fn preserves_full_text_as_body_when_frontmatter_is_invalid() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let contents = "---\ntitle The Antichrist\n---\n# Body\n";
    let path = write_markdown(&temp_dir, "notes/invalid.md", contents);

    let parsed = parse_markdown_file(&path).expect("parse markdown file");

    assert!(parsed.frontmatter.is_empty());
    assert!(parsed.tags.is_empty());
    assert_eq!(parsed.body, contents);
    assert_eq!(parsed.headings[0].text, "Body");
}
