//! Data-layer boundary audit (refinement-2, ticket #26): the two-store split is
//! enforced at the Rust repository layer. These tests scan the source tree to
//! lock the invariants that
//!   1. every refinement-2 store table is created by exactly one migration;
//!   2. every refinement-2 store table is owned by exactly one repository file;
//!   3. no command / bridge / api file issues raw SQL against those tables.
//!
//! They are deliberately filesystem tests, not database tests: the boundary is
//! a source-structure contract, and a regression here shows up as a table name
//! appearing in the wrong layer.

use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// (table name, repository file that owns it) for the refinement-2 stores.
const NEW_STORES: &[(&str, &str)] = &[
    ("geography_edges", "geography_edge_repository.rs"),
    ("palace_curations", "palace.rs"),
    ("fetch_records", "fetch_record.rs"),
    ("street_view_images", "street_view.rs"),
    ("scenes", "scene_repository.rs"),
    ("scene_sequences", "scene_repository.rs"),
];

fn sql_files_under(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(dir).expect("read dir") {
        let path = entry.expect("dir entry").path();
        if path.extension().map(|e| e == "sql").unwrap_or(false) {
            files.push(path);
        }
    }
    files
}

fn rs_files_under(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(dir).expect("read dir") {
        let path = entry.expect("dir entry").path();
        if path.extension().map(|e| e == "rs").unwrap_or(false) {
            files.push(path);
        }
    }
    files
}

/// Count standalone mentions of `table` in Rust source, ignoring line and
/// block comments and dotted field accesses (`x.scenes`). Mentions inside
/// string literals — i.e. the SQL text the repository issues — count, which is
/// exactly the signal we want for "this file owns/uses this table".
fn standalone_table_mentions(src: &str, table: &str) -> usize {
    let bytes = src.as_bytes();
    let n = bytes.len();
    let table_bytes = table.as_bytes();
    let mut count = 0usize;
    let mut i = 0usize;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    while i < n {
        if in_line_comment {
            if bytes[i] == b'\n' {
                in_line_comment = false;
            }
            i += 1;
            continue;
        }
        if in_block_comment {
            if i + 1 < n && bytes[i] == b'*' && bytes[i + 1] == b'/' {
                in_block_comment = false;
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }
        if i + 1 < n && bytes[i] == b'/' && bytes[i + 1] == b'/' {
            in_line_comment = true;
            i += 2;
            continue;
        }
        if i + 1 < n && bytes[i] == b'/' && bytes[i + 1] == b'*' {
            in_block_comment = true;
            i += 2;
            continue;
        }
        if bytes[i..].starts_with(table_bytes) {
            let before = if i == 0 {
                None
            } else {
                Some(bytes[i - 1] as char)
            };
            let after_idx = i + table_bytes.len();
            let after = if after_idx >= n {
                None
            } else {
                Some(bytes[after_idx] as char)
            };
            let word_boundary = before.map_or(true, |c| !c.is_alphanumeric() && c != '_')
                && after.map_or(true, |c| !c.is_alphanumeric() && c != '_');
            if word_boundary && before != Some('.') && before != Some('/') {
                count += 1;
            }
            i += table_bytes.len();
        } else {
            i += 1;
        }
    }
    count
}

/// True if a non-comment line contains the table name directly preceded by a
/// SQL keyword (`INSERT INTO`, `UPDATE`, `DELETE FROM`, `FROM`, `JOIN`),
/// i.e. the file issues raw SQL against the table.
fn has_raw_sql_against(src: &str, table: &str) -> bool {
    let lower = src.to_lowercase();
    let table_lower = table.to_lowercase();
    let keywords = [
        "insert into ",
        "update ",
        "delete from ",
        "from ",
        "join ",
    ];
    for line in lower.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") || trimmed.starts_with('*') {
            continue;
        }
        let mut search_from = 0usize;
        while let Some(relative) = line[search_from..].find(&table_lower) {
            let pos = search_from + relative;
            let prefix = &line[..pos];
            if keywords.iter().any(|kw| prefix.ends_with(kw)) {
                return true;
            }
            search_from = pos + table_lower.len();
        }
    }
    false
}

#[test]
fn every_refinement2_table_is_created_by_exactly_one_migration() {
    let migrations = sql_files_under(&repo_root().join("migrations"));
    assert!(
        migrations.len() >= 33,
        "expected the full migration chain, found {}",
        migrations.len()
    );
    for (table, _) in NEW_STORES {
        let owners: Vec<String> = migrations
            .iter()
            .filter(|path| {
                let src = std::fs::read_to_string(path).expect("read migration");
                src.contains(&format!("CREATE TABLE {table}"))
                    || src.contains(&format!("CREATE TABLE IF NOT EXISTS {table}"))
            })
            .map(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(
            owners.len(),
            1,
            "table {table} must be created by exactly one migration, found {owners:?}"
        );
    }
}

#[test]
fn every_refinement2_store_has_exactly_one_repository_owner() {
    let repositories = rs_files_under(&repo_root().join("src/db/repositories"));
    for (table, owner_file) in NEW_STORES {
        let mut owners: Vec<String> = Vec::new();
        for path in &repositories {
            let name = path.file_name().unwrap().to_string_lossy();
            let src = std::fs::read_to_string(path).expect("read repository");
            if standalone_table_mentions(&src, table) > 0 {
                owners.push(name.into_owned());
            }
        }
        assert_eq!(
            owners,
            vec![owner_file.to_string()],
            "table {table} must be owned by exactly one repository"
        );
    }
}

#[test]
fn no_command_bridge_or_api_layer_issues_raw_sql_against_refinement2_tables() {
    let mut layers = Vec::new();
    for dir in ["src/commands", "src/bin", "src/api"] {
        layers.extend(rs_files_under(&repo_root().join(dir)));
    }
    assert!(!layers.is_empty(), "expected command/bridge/api source files");
    for (table, _) in NEW_STORES {
        for path in &layers {
            let src = std::fs::read_to_string(path).expect("read layer file");
            assert!(
                !has_raw_sql_against(&src, table),
                "{} issues raw SQL against {table}",
                path.display()
            );
        }
    }
}
