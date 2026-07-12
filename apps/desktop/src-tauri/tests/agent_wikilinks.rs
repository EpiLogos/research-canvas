use research_canvas_desktop_lib::agent::types::WikiLink;
use research_canvas_desktop_lib::agent::vault::{
    backlinks, candidate_links, links_for_file, Backlink, CandidateLink,
};
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn write_markdown(root: &Path, relative_path: &str, contents: &str) -> PathBuf {
    let path = root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create fixture parent directory");
    }
    fs::write(&path, contents).expect("write markdown fixture");
    path
}

fn write_bytes(root: &Path, relative_path: &str, contents: &[u8]) -> PathBuf {
    let path = root.join(relative_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create fixture parent directory");
    }
    fs::write(&path, contents).expect("write byte fixture");
    path
}

fn canonical_string(path: &Path) -> String {
    path.canonicalize()
        .expect("canonicalize path")
        .to_string_lossy()
        .into_owned()
}

fn fixture_vault() -> TempDir {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path();

    write_markdown(
        root,
        "concepts/Antichrist.md",
        "---\ntitle: The Antichrist\n---\n# Antichrist\nA target note.\n",
    );
    write_markdown(root, "archive/Antichrist.md", "# Archive Antichrist\n");
    write_markdown(root, "concepts/Mask.md", "# Mask\n");
    write_markdown(root, "archive/Mask.md", "# Mask\n");
    write_markdown(root, "concepts/Eternal Return.md", "# Eternal Return\n");
    write_markdown(root, "concepts/Frontmatter Only.md", "# Frontmatter Only\n");
    write_markdown(root, "concepts/Heading Only.md", "# Heading Only\n");
    write_markdown(root, "concepts/Code Only.md", "# Code Only\n");
    write_markdown(root, "figures/Dionysus.md", "# Dionysus\n");
    write_markdown(root, "myths/Dionysus.md", "# Dionysus\n");
    write_markdown(
        root,
        "sources/outbound.md",
        concat!(
            "# Outbound\n",
            "See [[People/Nietzsche|Nietzsche]] and [[The Antichrist]].\n",
            "Then [[concepts/Antichrist.md|relative form]].\n",
        ),
    );
    write_markdown(
        root,
        "sources/by-basename.md",
        "Opening line.\nSecond line links [[Antichrist|basename alias]].\n",
    );
    write_markdown(
        root,
        "sources/by-relative-path.md",
        "One.\nTwo.\nThird line links [[concepts/Antichrist|path alias]].\n",
    );
    write_markdown(
        root,
        "sources/by-normalized-title.md",
        "Title link appears as [[the antichrist|lowercase title]].\n",
    );
    write_markdown(
        root,
        "sources/by-backslash.md",
        "Backslash form [[concepts\\Antichrist|slash alias]].\n",
    );
    write_markdown(
        root,
        "sources/candidates.md",
        concat!(
            "---\n",
            "summary: Frontmatter Only\n",
            "---\n",
            "# Candidate Source\n",
            "## Heading Only\n",
            "The Mask appears beside Eternal Return in ordinary prose.\n",
            "Already linked targets stay quiet: [[The Antichrist|Antichrist]] and [[Dionysus]].\n",
            "```markdown\n",
            "Code Only\n",
            "```\n",
            "Mask appears twice, but deterministic suggestions should remain unique.\n",
        ),
    );

    temp_dir
}

fn relative_paths(candidates: &[CandidateLink]) -> Vec<&str> {
    candidates
        .iter()
        .map(|candidate| candidate.relative_path.as_str())
        .collect()
}

fn backlink_targets(backlinks: &[Backlink]) -> Vec<(&str, Option<&str>, Option<usize>)> {
    backlinks
        .iter()
        .map(|backlink| {
            (
                backlink.target.as_str(),
                backlink.label.as_deref(),
                backlink.line_number,
            )
        })
        .collect()
}

#[test]
fn links_for_file_returns_outbound_links_with_source_path_and_byte_ranges() {
    let temp_dir = fixture_vault();
    let root = temp_dir.path();
    let contents = fs::read_to_string(root.join("sources/outbound.md")).expect("read fixture");

    let links = links_for_file(root, "sources/outbound.md").expect("read outbound links");

    assert_eq!(links.len(), 3);
    assert_link_range(
        &links[0],
        &contents,
        &canonical_string(&root.join("sources/outbound.md")),
        "[[People/Nietzsche|Nietzsche]]",
        "People/Nietzsche",
        Some("Nietzsche"),
    );
    assert_link_range(
        &links[1],
        &contents,
        &canonical_string(&root.join("sources/outbound.md")),
        "[[The Antichrist]]",
        "The Antichrist",
        None,
    );
    assert_link_range(
        &links[2],
        &contents,
        &canonical_string(&root.join("sources/outbound.md")),
        "[[concepts/Antichrist.md|relative form]]",
        "concepts/Antichrist.md",
        Some("relative form"),
    );
}

#[test]
fn backlinks_match_target_basename_relative_path_and_normalized_title_preserving_link_text() {
    let temp_dir = fixture_vault();

    let links = backlinks(temp_dir.path(), "concepts/Antichrist.md").expect("find backlinks");

    assert_eq!(
        backlink_targets(&links),
        vec![
            ("concepts\\Antichrist", Some("slash alias"), Some(1)),
            ("Antichrist", Some("basename alias"), Some(2)),
            ("the antichrist", Some("lowercase title"), Some(1)),
            ("concepts/Antichrist", Some("path alias"), Some(3)),
            ("The Antichrist", Some("Antichrist"), Some(7)),
            ("The Antichrist", None, Some(2)),
            ("concepts/Antichrist.md", Some("relative form"), Some(3)),
        ]
    );
    assert!(links.iter().all(|link| link
        .source_path
        .starts_with(&canonical_string(temp_dir.path()))));

    let title_links = backlinks(temp_dir.path(), "The Antichrist").expect("find title backlinks");
    assert_eq!(backlink_targets(&title_links), backlink_targets(&links));

    let basename_links = backlinks(temp_dir.path(), "Antichrist").expect("find basename backlinks");
    assert!(
        basename_links
            .iter()
            .any(|link| link.target == "Antichrist"
                && link.label.as_deref() == Some("basename alias")),
        "basename query should include basename backlinks"
    );
}

#[test]
fn candidate_links_suggest_unlinked_existing_titles_and_avoid_already_linked_targets() {
    let temp_dir = fixture_vault();

    let candidates =
        candidate_links(temp_dir.path(), "sources/candidates.md").expect("find candidate links");

    assert_eq!(
        relative_paths(&candidates),
        vec![
            "concepts/Eternal Return.md",
            "archive/Mask.md",
            "concepts/Mask.md",
        ]
    );
    assert_eq!(
        candidates
            .iter()
            .map(|candidate| candidate.matched_text.as_str())
            .collect::<Vec<_>>(),
        vec!["Eternal Return", "Mask", "Mask"]
    );
    assert!(candidates
        .iter()
        .all(|candidate| candidate.title != "The Antichrist"));
    assert!(candidates
        .iter()
        .all(|candidate| candidate.title != "Dionysus"));
    assert!(candidates
        .iter()
        .all(|candidate| candidate.title != "Frontmatter Only"));
    assert!(candidates
        .iter()
        .all(|candidate| candidate.title != "Heading Only"));
    assert!(candidates
        .iter()
        .all(|candidate| candidate.title != "Code Only"));
    assert_eq!(
        candidates
            .iter()
            .filter(|candidate| candidate.title == "Mask")
            .map(|candidate| candidate.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["archive/Mask.md", "concepts/Mask.md"],
        "ambiguous candidate names should sort deterministically by relative path"
    );
}

#[test]
fn link_tools_parse_full_markdown_metadata_and_reject_late_invalid_utf8() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path();
    write_markdown(root, "target.md", "# Target\n");
    write_markdown(root, "candidate.md", "# Candidate\n");

    let mut huge_source = format!(
        "See [[Target]].\nCandidate is visible.\n{}",
        "safe\n".repeat(14_000)
    )
    .into_bytes();
    huge_source.extend_from_slice(&[0xff, 0xfe, 0xfd]);
    write_bytes(root, "source.md", &huge_source);

    let links_error = links_for_file(root, "source.md").expect_err("full markdown must be utf8");
    assert_eq!(links_error.kind(), std::io::ErrorKind::InvalidData);

    let backlinks = backlinks(root, "Target").expect("scan backlinks while skipping invalid file");
    assert!(backlinks.is_empty());

    let candidates_error =
        candidate_links(root, "source.md").expect_err("candidate source must be utf8");
    assert_eq!(candidates_error.kind(), std::io::ErrorKind::InvalidData);
}

#[test]
fn links_for_file_accepts_all_indexer_markdown_extensions() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path();

    for extension in ["md", "markdown", "mdown", "mkd"] {
        let relative_path = format!("source.{extension}");
        write_markdown(root, &relative_path, "See [[Target]].\n");

        let links = links_for_file(root, &relative_path).expect("extension should be accepted");

        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Target");
    }
}

#[test]
fn backlinks_normalize_all_indexer_markdown_extensions() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path();
    write_markdown(root, "notes/Foo.markdown", "# Foo\n");
    write_markdown(root, "sources/source.md", "See [[notes/Foo]].\n");

    let links = backlinks(root, "notes/Foo.markdown").expect("scan markdown extension backlink");

    assert_eq!(backlink_targets(&links), vec![("notes/Foo", None, Some(1))]);
}

#[test]
fn basename_query_returns_backlinks_for_all_ambiguous_matching_notes() {
    let temp_dir = TempDir::new().expect("create temp dir");
    let root = temp_dir.path();
    write_markdown(root, "alpha/Mask.md", "# Alpha Mask\n");
    write_markdown(root, "beta/Mask.md", "# Beta Mask\n");
    write_markdown(root, "sources/one.md", "Links to [[alpha/Mask|alpha]].\n");
    write_markdown(root, "sources/two.md", "Links to [[beta/Mask|beta]].\n");

    let links = backlinks(root, "Mask").expect("scan ambiguous basename backlinks");

    assert_eq!(
        backlink_targets(&links),
        vec![
            ("alpha/Mask", Some("alpha"), Some(1)),
            ("beta/Mask", Some("beta"), Some(1)),
        ]
    );
}

fn assert_link_range(
    link: &WikiLink,
    contents: &str,
    source_path: &str,
    raw_link: &str,
    target: &str,
    label: Option<&str>,
) {
    let expected_start = contents.find(raw_link).expect("raw link exists");
    assert_eq!(link.source_path, source_path);
    assert_eq!(link.target, target);
    assert_eq!(link.label.as_deref(), label);
    assert_eq!(link.byte_start, expected_start);
    assert_eq!(link.byte_end, expected_start + raw_link.len());
    assert_eq!(&contents[link.byte_start..link.byte_end], raw_link);
}
