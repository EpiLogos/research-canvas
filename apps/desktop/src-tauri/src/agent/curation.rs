use crate::db::repositories::graph::GraphRepository;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use thiserror::Error;

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationReport {
    pub changed: bool,
    pub path: String,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_node_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relationship_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_source: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_relationship: Option<bool>,
}

#[derive(Debug, Error)]
pub enum MutationError {
    #[error("tag must not be empty")]
    EmptyTag,
    #[error("tag contains unsupported frontmatter characters")]
    InvalidTag,
    #[error("failed to read {path}: {source}")]
    Read {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to write {path}: {source}")]
    Write {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("failed to canonicalize source path {path}: {source}")]
    Canonicalize {
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("malformed frontmatter in {path}: {detail}")]
    MalformedFrontmatter { path: String, detail: String },
    #[error("graph node not found: {node_id}")]
    NodeNotFound { node_id: String },
    #[error("graph mutation failed: {0}")]
    Graph(String),
}

pub fn add_file_tag(
    path: impl AsRef<Path>,
    tag: impl AsRef<str>,
) -> Result<MutationReport, MutationError> {
    let path = path.as_ref();
    let display_path = path.to_string_lossy().into_owned();
    let tag = validate_tag(tag.as_ref())?;
    let contents = fs::read_to_string(path).map_err(|source| MutationError::Read {
        path: display_path.clone(),
        source,
    })?;

    let mutation = mutate_file_contents(&contents, tag, &display_path)?;
    if mutation.changed {
        atomic_replace_file(path, mutation.contents.as_bytes()).map_err(|source| {
            MutationError::Write {
                path: display_path.clone(),
                source,
            }
        })?;
    }

    Ok(MutationReport {
        changed: mutation.changed,
        path: display_path,
        detail: mutation.detail,
        source_node_id: None,
        relationship_id: None,
        created_source: None,
        created_relationship: None,
    })
}

pub async fn add_node_tag(
    graph: &GraphRepository,
    node_id: impl AsRef<str>,
    tag: impl AsRef<str>,
) -> Result<MutationReport, MutationError> {
    let node_id = node_id.as_ref();
    let tag = validate_tag(tag.as_ref())?.to_owned();
    let (_, changed) = graph
        .add_evidence_tag(node_id, &tag)
        .await
        .map_err(MutationError::Graph)?
        .ok_or_else(|| MutationError::NodeNotFound {
            node_id: node_id.to_owned(),
        })?;

    Ok(MutationReport {
        changed,
        path: node_id.to_owned(),
        detail: if changed {
            format!("added tag '{tag}'")
        } else {
            format!("tag '{tag}' already present")
        },
        source_node_id: None,
        relationship_id: None,
        created_source: None,
        created_relationship: None,
    })
}

pub async fn attach_evidence(
    graph: &GraphRepository,
    node_id: impl AsRef<str>,
    source_path: impl AsRef<Path>,
    quote: impl AsRef<str>,
    note: impl AsRef<str>,
) -> Result<MutationReport, MutationError> {
    let node_id = node_id.as_ref();
    graph
        .get_node(node_id)
        .await
        .map_err(MutationError::Graph)?
        .ok_or_else(|| MutationError::NodeNotFound {
            node_id: node_id.to_owned(),
        })?;

    let source_path = source_path.as_ref();
    let display_path = source_path.to_string_lossy().into_owned();
    let canonical_path =
        fs::canonicalize(source_path).map_err(|source| MutationError::Canonicalize {
            path: display_path,
            source,
        })?;
    let title = canonical_path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .unwrap_or("Source");
    let canonical_path = canonical_path.to_string_lossy().into_owned();
    let quote = quote.as_ref();
    let note = note.as_ref();

    let (source_node, created_source) = graph
        .ensure_vault_source_node(&canonical_path, title)
        .await
        .map_err(MutationError::Graph)?;
    let (relationship, created_relationship) = graph
        .ensure_sourced_from_relationship(
            node_id,
            &source_node.graph_node_id,
            &canonical_path,
            quote,
            note,
        )
        .await
        .map_err(MutationError::Graph)?;

    Ok(MutationReport {
        changed: created_source || created_relationship,
        path: canonical_path,
        detail: if created_relationship {
            "attached evidence".to_owned()
        } else {
            "evidence already attached".to_owned()
        },
        source_node_id: Some(source_node.graph_node_id),
        relationship_id: Some(relationship.id),
        created_source: Some(created_source),
        created_relationship: Some(created_relationship),
    })
}

fn validate_tag(tag: &str) -> Result<&str, MutationError> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err(MutationError::EmptyTag);
    }
    if tag.chars().any(|character| {
        matches!(
            character,
            '\r' | '\n'
                | '['
                | ']'
                | '{'
                | '}'
                | ','
                | ':'
                | '#'
                | '"'
                | '\''
                | '*'
                | '&'
                | '!'
                | '|'
                | '>'
                | '@'
                | '`'
                | '%'
                | '?'
        )
    }) || is_yaml_schema_scalar(tag)
    {
        return Err(MutationError::InvalidTag);
    }
    Ok(tag)
}

fn is_yaml_schema_scalar(tag: &str) -> bool {
    let lower = tag.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "true" | "false" | "null" | "~" | "yes" | "no" | "on" | "off"
    ) || parses_as_number(tag)
}

fn parses_as_number(tag: &str) -> bool {
    tag.parse::<i64>().is_ok() || tag.parse::<f64>().is_ok()
}

struct FileMutation {
    changed: bool,
    contents: String,
    detail: String,
}

fn mutate_file_contents(
    contents: &str,
    tag: &str,
    path: &str,
) -> Result<FileMutation, MutationError> {
    match split_frontmatter(contents, path)? {
        Some(frontmatter) => {
            let updated = mutate_frontmatter(frontmatter.source, tag, frontmatter.newline, path)?;
            if !updated.changed {
                return Ok(FileMutation {
                    changed: false,
                    contents: contents.to_owned(),
                    detail: format!("tag '{tag}' already present"),
                });
            }

            Ok(FileMutation {
                changed: true,
                contents: format!(
                    "{opening}{frontmatter}{closing}{body}",
                    opening = frontmatter.opening,
                    frontmatter = updated.source,
                    closing = frontmatter.closing,
                    body = frontmatter.body,
                ),
                detail: format!("added tag '{tag}'"),
            })
        }
        None => Ok(FileMutation {
            changed: true,
            contents: format!("---\ntags: [{tag}]\n---\n{contents}"),
            detail: format!("added tag '{tag}'"),
        }),
    }
}

struct FrontmatterBlock<'a> {
    opening: &'a str,
    source: &'a str,
    closing: &'a str,
    body: &'a str,
    newline: &'static str,
}

fn split_frontmatter<'a>(
    contents: &'a str,
    path: &str,
) -> Result<Option<FrontmatterBlock<'a>>, MutationError> {
    let Some((first_line, after_first_line)) = read_line_at(contents, 0) else {
        return Ok(None);
    };
    if !is_frontmatter_delimiter(first_line, true) {
        return Ok(None);
    }

    let newline = if first_line.ends_with('\r') {
        "\r\n"
    } else {
        "\n"
    };
    let mut line_start = after_first_line;
    while line_start < contents.len() {
        let Some((line, next_line_start)) = read_line_at(contents, line_start) else {
            break;
        };
        if is_frontmatter_delimiter(line, false) {
            return Ok(Some(FrontmatterBlock {
                opening: &contents[..after_first_line],
                source: &contents[after_first_line..line_start],
                closing: &contents[line_start..next_line_start],
                body: &contents[next_line_start..],
                newline,
            }));
        }
        line_start = next_line_start;
    }

    Err(MutationError::MalformedFrontmatter {
        path: path.to_owned(),
        detail: "unterminated frontmatter block".to_owned(),
    })
}

fn is_frontmatter_delimiter(line: &str, allow_bom: bool) -> bool {
    let line = line.trim_end_matches('\r');
    let line = if allow_bom {
        line.strip_prefix('\u{feff}').unwrap_or(line)
    } else {
        line
    };
    line.trim_end_matches([' ', '\t']) == "---"
}

fn read_line_at(contents: &str, start: usize) -> Option<(&str, usize)> {
    if start >= contents.len() {
        return None;
    }

    let rest = &contents[start..];
    match rest.find('\n') {
        Some(offset) => Some((&contents[start..start + offset], start + offset + 1)),
        None => Some((&contents[start..], contents.len())),
    }
}

struct FrontmatterMutation {
    changed: bool,
    source: String,
}

fn mutate_frontmatter(
    source: &str,
    tag: &str,
    newline: &str,
    path: &str,
) -> Result<FrontmatterMutation, MutationError> {
    let lines = frontmatter_lines(source);
    let mut tags_line = None;

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.body.trim();
        if trimmed.is_empty()
            || trimmed.starts_with('#')
            || line.body.starts_with(char::is_whitespace)
        {
            continue;
        }

        let Some(colon) = line.body.find(':') else {
            return malformed(
                path,
                format!("line '{}' is not a key-value entry", line.body),
            );
        };
        let key = line.body[..colon].trim();
        if key == "tags" {
            if tags_line.is_some() {
                return malformed(path, "duplicate tags entries are ambiguous");
            }
            tags_line = Some((index, colon));
        }
    }

    let Some((index, colon)) = tags_line else {
        let mut updated = source.to_owned();
        if !updated.is_empty() && !updated.ends_with('\n') {
            updated.push_str(newline);
        }
        updated.push_str(&format!("tags: [{tag}]{newline}"));
        return Ok(FrontmatterMutation {
            changed: true,
            source: updated,
        });
    };

    let line = &lines[index];
    let value = line.body[colon + 1..].trim();
    if value.is_empty() {
        mutate_list_tags(source, &lines, index, tag, newline, path)
    } else {
        mutate_inline_or_scalar_tags(source, line, colon, tag, path)
    }
}

struct FrontmatterLine<'a> {
    start: usize,
    body_end: usize,
    line_end: usize,
    body: &'a str,
}

fn frontmatter_lines(source: &str) -> Vec<FrontmatterLine<'_>> {
    let mut lines = Vec::new();
    let mut start = 0;
    while start < source.len() {
        let (line, next) = read_line_at(source, start).expect("start is inside source");
        let mut body_end = start + line.len();
        if line.ends_with('\r') {
            body_end -= 1;
        }
        lines.push(FrontmatterLine {
            start,
            body_end,
            line_end: next,
            body: &source[start..body_end],
        });
        start = next;
    }
    lines
}

fn mutate_inline_or_scalar_tags(
    source: &str,
    line: &FrontmatterLine<'_>,
    colon: usize,
    tag: &str,
    path: &str,
) -> Result<FrontmatterMutation, MutationError> {
    let line_body = line.body;
    let value_start =
        colon + 1 + line_body[colon + 1..].len() - line_body[colon + 1..].trim_start().len();
    let raw_value = &line_body[value_start..];
    let value = raw_value.trim();
    let (mut tags, style) = parse_inline_or_scalar_value(value, path)?;
    if tags.iter().any(|existing| existing == tag) {
        return Ok(FrontmatterMutation {
            changed: false,
            source: source.to_owned(),
        });
    }

    tags.push(tag.to_owned());
    let rendered_value = append_tag_to_raw_value(raw_value, style, tag);
    let replacement = format!("{}{}", &line_body[..value_start], rendered_value);
    Ok(FrontmatterMutation {
        changed: true,
        source: replace_range(source, line.start, line.body_end, &replacement),
    })
}

enum TagStyle {
    InlineArray,
    Scalar,
}

fn parse_inline_or_scalar_value(
    value: &str,
    path: &str,
) -> Result<(Vec<String>, TagStyle), MutationError> {
    if value.starts_with('[') {
        let Some(closing_bracket) = inline_array_closing_bracket(value) else {
            return malformed(path, "tags inline array is not balanced");
        };
        let suffix = value[closing_bracket + 1..].trim_start();
        if !suffix.is_empty() && !suffix.starts_with('#') {
            return malformed(path, "tags inline array has unsupported trailing content");
        }
        return Ok((
            parse_comma_tags(&value[1..closing_bracket], path)?,
            TagStyle::InlineArray,
        ));
    }
    if value.ends_with(']') {
        return malformed(path, "tags inline array is not balanced");
    }
    let (value_without_comment, _) = split_plain_scalar_comment(value);
    Ok((
        parse_comma_tags(value_without_comment, path)?,
        TagStyle::Scalar,
    ))
}

fn append_tag_to_raw_value(raw_value: &str, style: TagStyle, tag: &str) -> String {
    match style {
        TagStyle::InlineArray => {
            let closing_bracket = inline_array_closing_bracket(raw_value)
                .expect("inline array style is parsed only from balanced brackets");
            let before_closing = &raw_value[..closing_bracket];
            let insert_at = before_closing.trim_end_matches([' ', '\t']).len();
            let before_insert = &raw_value[..insert_at];
            let inner = before_insert.strip_prefix('[').unwrap_or(before_insert);
            let separator = if inner.trim().is_empty() { "" } else { ", " };
            format!(
                "{before_insert}{separator}{tag}{inner_trailing}{suffix}",
                inner_trailing = &raw_value[insert_at..closing_bracket],
                suffix = &raw_value[closing_bracket..]
            )
        }
        TagStyle::Scalar => {
            let (value_part, comment_part) = split_plain_scalar_comment(raw_value);
            let insert_at = value_part.trim_end_matches([' ', '\t']).len();
            let before_insert = &value_part[..insert_at];
            let separator = if before_insert.trim().is_empty() {
                ""
            } else {
                ", "
            };
            format!(
                "{before_insert}{separator}{tag}{trailing}{comment_part}",
                trailing = &value_part[insert_at..]
            )
        }
    }
}

fn inline_array_closing_bracket(value: &str) -> Option<usize> {
    let mut quote: Option<char> = None;
    for (index, character) in value.char_indices().skip(1) {
        match quote {
            Some(active_quote) if character == active_quote => quote = None,
            Some(_) => {}
            None if character == '"' || character == '\'' => quote = Some(character),
            None if character == ']' => return Some(index),
            None if character == '#' => return None,
            None => {}
        }
    }
    None
}

fn split_plain_scalar_comment(raw_value: &str) -> (&str, &str) {
    let mut previous_was_whitespace = false;
    for (index, character) in raw_value.char_indices() {
        if character == '#' && previous_was_whitespace {
            return (&raw_value[..index - 1], &raw_value[index - 1..]);
        }
        previous_was_whitespace = matches!(character, ' ' | '\t');
    }
    (raw_value, "")
}

fn mutate_list_tags(
    source: &str,
    lines: &[FrontmatterLine<'_>],
    tags_index: usize,
    tag: &str,
    newline: &str,
    path: &str,
) -> Result<FrontmatterMutation, MutationError> {
    let mut tags = Vec::new();
    let mut insert_at = lines[tags_index].line_end;

    for line in &lines[tags_index + 1..] {
        if line.body.trim().is_empty() {
            continue;
        }
        if !line.body.starts_with(char::is_whitespace) {
            break;
        }

        let trimmed = line.body.trim();
        if trimmed.starts_with('#') {
            insert_at = line.line_end;
            continue;
        }
        let Some(item) = trimmed.strip_prefix("- ") else {
            return malformed(path, "tags list contains a non-list item");
        };
        let (item_without_comment, _) = split_plain_scalar_comment(item);
        tags.push(clean_scalar(item_without_comment, path)?);
        insert_at = line.line_end;
    }

    if tags.iter().any(|existing| existing == tag) {
        return Ok(FrontmatterMutation {
            changed: false,
            source: source.to_owned(),
        });
    }

    Ok(FrontmatterMutation {
        changed: true,
        source: insert_at_offset(source, insert_at, &format!("  - {tag}{newline}")),
    })
}

fn parse_comma_tags(value: &str, path: &str) -> Result<Vec<String>, MutationError> {
    value
        .split(',')
        .map(|tag| clean_scalar(tag, path))
        .filter(|tag| !matches!(tag, Ok(value) if value.is_empty()))
        .collect()
}

fn clean_scalar(value: &str, path: &str) -> Result<String, MutationError> {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        if let Some(unquoted) = trimmed
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
        {
            return Ok(unquoted.trim().to_owned());
        }
        if let Some(unquoted) = trimmed
            .strip_prefix('\'')
            .and_then(|value| value.strip_suffix('\''))
        {
            return Ok(unquoted.trim().to_owned());
        }
    }
    if trimmed.starts_with(['"', '\'']) || trimmed.ends_with(['"', '\'']) {
        return malformed(path, "tags contain an unbalanced quoted scalar");
    }
    Ok(trimmed.to_owned())
}

fn replace_range(source: &str, start: usize, end: usize, replacement: &str) -> String {
    let mut updated = String::with_capacity(source.len() - (end - start) + replacement.len());
    updated.push_str(&source[..start]);
    updated.push_str(replacement);
    updated.push_str(&source[end..]);
    updated
}

fn insert_at_offset(source: &str, offset: usize, insertion: &str) -> String {
    let mut updated = String::with_capacity(source.len() + insertion.len());
    updated.push_str(&source[..offset]);
    updated.push_str(insertion);
    updated.push_str(&source[offset..]);
    updated
}

fn malformed<T>(path: &str, detail: impl Into<String>) -> Result<T, MutationError> {
    Err(MutationError::MalformedFrontmatter {
        path: path.to_owned(),
        detail: detail.into(),
    })
}

fn atomic_replace_file(path: &Path, contents: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let permissions = fs::metadata(path)
        .map(|metadata| metadata.permissions())
        .ok();
    let (temp_path, temp_file) = create_same_directory_temp_file(path, parent)?;
    let write_result = write_temp_file(temp_file, contents, permissions);

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    if let Err(error) = replace_existing_file(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    sync_parent_directory(parent)?;
    Ok(())
}

#[cfg(not(windows))]
fn replace_existing_file(temp_path: &Path, path: &Path) -> io::Result<()> {
    fs::rename(temp_path, path)
}

#[cfg(windows)]
fn replace_existing_file(temp_path: &Path, path: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn to_wide(path: &Path) -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let old_path = to_wide(temp_path);
    let new_path = to_wide(path);
    let flags = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH;
    let moved = unsafe { MoveFileExW(old_path.as_ptr(), new_path.as_ptr(), flags) };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn create_same_directory_temp_file(
    path: &Path,
    parent: &Path,
) -> io::Result<(std::path::PathBuf, File)> {
    let permissions = fs::metadata(path)
        .map(|metadata| metadata.permissions())
        .ok();
    let file_name = path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .unwrap_or("file");
    let process_id = std::process::id();

    for _ in 0..100 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let temp_path = parent.join(format!(".{file_name}.curation-{process_id}-{counter}.tmp"));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
        {
            Ok(file) => {
                if let Some(permissions) = permissions.clone() {
                    file.set_permissions(permissions)?;
                }
                return Ok((temp_path, file));
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not create a unique temporary file",
    ))
}

fn write_temp_file(
    mut file: File,
    contents: &[u8],
    permissions: Option<fs::Permissions>,
) -> io::Result<()> {
    file.write_all(contents)?;
    if let Some(permissions) = permissions {
        file.set_permissions(permissions)?;
    }
    file.sync_all()
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn temp_file_uses_source_permissions_before_content_is_written() {
        use std::os::unix::fs::PermissionsExt;

        let temp_dir = tempfile::TempDir::new().expect("create temp dir");
        let path = temp_dir.path().join("secret.md");
        fs::write(&path, "secret").expect("write source");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).expect("set source mode");

        let parent = path.parent().expect("source has parent");
        let (temp_path, _file) =
            create_same_directory_temp_file(&path, parent).expect("create temp file");

        let mode = fs::metadata(&temp_path)
            .expect("stat temp")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }
}
