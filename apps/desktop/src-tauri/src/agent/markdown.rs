use crate::agent::types::WikiLink;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedMarkdown {
    pub source_path: String,
    pub body: String,
    pub frontmatter: Map<String, Value>,
    pub tags: Vec<String>,
    pub headings: Vec<MarkdownHeading>,
    pub links: Vec<WikiLink>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownHeading {
    pub level: usize,
    pub text: String,
}

pub fn parse_markdown_file(path: impl AsRef<Path>) -> io::Result<ParsedMarkdown> {
    let path = path.as_ref();
    let contents = fs::read_to_string(path)?;
    Ok(parse_markdown_source(
        &contents,
        path.to_string_lossy().as_ref(),
    ))
}

pub fn parse_markdown_source(contents: &str, source_path: &str) -> ParsedMarkdown {
    let (frontmatter, tags, body_start, body) =
        split_frontmatter(contents).unwrap_or_else(|| (Map::new(), Vec::new(), 0, contents));
    let body = body.to_owned();

    ParsedMarkdown {
        source_path: source_path.to_owned(),
        headings: extract_headings(&body),
        links: extract_wikilinks(&body, body_start, source_path),
        body,
        frontmatter,
        tags,
    }
}

fn split_frontmatter(contents: &str) -> Option<(Map<String, Value>, Vec<String>, usize, &str)> {
    let (first_line, after_first_line) = read_line_at(contents, 0)?;
    if first_line.trim_end_matches('\r') != "---" {
        return Some((Map::new(), Vec::new(), 0, contents));
    }

    let mut line_start = after_first_line;
    while line_start < contents.len() {
        let (line, next_line_start) = read_line_at(contents, line_start)?;
        if line.trim_end_matches('\r') == "---" {
            let frontmatter_source = &contents[after_first_line..line_start];
            let (frontmatter, tags) = parse_frontmatter(frontmatter_source)?;
            return Some((
                frontmatter,
                tags,
                next_line_start,
                &contents[next_line_start..],
            ));
        }
        line_start = next_line_start;
    }

    None
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

fn parse_frontmatter(source: &str) -> Option<(Map<String, Value>, Vec<String>)> {
    let lines: Vec<&str> = source.lines().collect();
    let mut frontmatter = Map::new();
    let mut tags = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let raw_line = lines[index];
        let line = raw_line.trim();
        if line.is_empty() {
            index += 1;
            continue;
        }
        if raw_line.starts_with(char::is_whitespace) {
            return None;
        }

        let colon = line.find(':')?;
        let key = line[..colon].trim();
        if key.is_empty() {
            return None;
        }

        let value = line[colon + 1..].trim();
        if value.is_empty() {
            let (items, next_index) = parse_indented_list(&lines, index + 1);
            if items.is_empty() {
                index = next_index;
                continue;
            }

            if key == "tags" {
                tags = items.clone();
            }
            frontmatter.insert(
                key.to_owned(),
                Value::Array(items.into_iter().map(Value::String).collect()),
            );
            index = next_index;
            continue;
        }

        if key == "tags" {
            tags = parse_tag_value(value);
            frontmatter.insert(
                key.to_owned(),
                Value::Array(tags.iter().cloned().map(Value::String).collect()),
            );
        } else {
            frontmatter.insert(key.to_owned(), Value::String(clean_scalar(value)));
        }
        index += 1;
    }

    Some((frontmatter, tags))
}

fn parse_indented_list(lines: &[&str], start: usize) -> (Vec<String>, usize) {
    let mut items = Vec::new();
    let mut index = start;

    while index < lines.len() {
        let raw_line = lines[index];
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            index += 1;
            continue;
        }
        if !raw_line.starts_with(char::is_whitespace) {
            break;
        }

        let Some(item) = trimmed.strip_prefix("- ") else {
            return (Vec::new(), skip_indented_block(lines, index));
        };
        items.push(clean_scalar(item));
        index += 1;
    }

    (items, index)
}

fn skip_indented_block(lines: &[&str], start: usize) -> usize {
    let mut index = start;
    while index < lines.len() {
        let raw_line = lines[index];
        if !raw_line.trim().is_empty() && !raw_line.starts_with(char::is_whitespace) {
            break;
        }
        index += 1;
    }
    index
}

fn parse_tag_value(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    let inner = trimmed
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(trimmed);

    inner
        .split(',')
        .map(clean_scalar)
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn clean_scalar(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        if let Some(unquoted) = trimmed
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
        {
            return unquoted.trim().to_owned();
        }
        if let Some(unquoted) = trimmed
            .strip_prefix('\'')
            .and_then(|value| value.strip_suffix('\''))
        {
            return unquoted.trim().to_owned();
        }
    }
    trimmed.to_owned()
}

fn extract_headings(body: &str) -> Vec<MarkdownHeading> {
    let mut headings = Vec::new();
    let mut line_start = 0;
    let mut active_fence = None;

    while line_start < body.len() {
        let Some((line, next_line_start)) = read_line_at(body, line_start) else {
            break;
        };

        if let Some(fence_line) = parse_fence_line(line) {
            if active_fence
                .map(|fence| fence_line.closes(fence))
                .unwrap_or(false)
            {
                active_fence = None;
            } else if active_fence.is_none() {
                active_fence = Some(fence_line.fence);
            }
            line_start = next_line_start;
            continue;
        }

        if active_fence.is_some() {
            line_start = next_line_start;
            continue;
        }

        if let Some(heading) = parse_heading_line(line) {
            headings.push(heading);
        }

        line_start = next_line_start;
    }

    headings
}

fn parse_heading_line(line: &str) -> Option<MarkdownHeading> {
    let level = line
        .as_bytes()
        .iter()
        .take_while(|byte| **byte == b'#')
        .count();
    if level == 0 || level > 6 {
        return None;
    }

    let after_marker = &line[level..];
    if !after_marker.starts_with(char::is_whitespace) {
        return None;
    }

    let text = after_marker
        .trim()
        .trim_end_matches('#')
        .trim_end()
        .to_owned();
    if text.is_empty() {
        None
    } else {
        Some(MarkdownHeading { level, text })
    }
}

fn extract_wikilinks(body: &str, body_start: usize, source_path: &str) -> Vec<WikiLink> {
    let mut links = Vec::new();
    let mut search_start = 0;
    let fenced_ranges = fenced_code_ranges(body);

    while let Some(open_offset) = body[search_start..].find("[[") {
        let byte_start = search_start + open_offset;
        if let Some((_, range_end)) = containing_range(&fenced_ranges, byte_start) {
            search_start = range_end;
            continue;
        }

        let inner_start = byte_start + 2;
        let Some(close_offset) = body[inner_start..].find("]]") else {
            break;
        };
        let inner_end = inner_start + close_offset;
        let byte_end = inner_end + 2;
        let inner = &body[inner_start..inner_end];

        if let Some((target, label)) = parse_wikilink_inner(inner) {
            links.push(WikiLink {
                target,
                label,
                source_path: source_path.to_owned(),
                byte_start: body_start + byte_start,
                byte_end: body_start + byte_end,
            });
        }

        search_start = byte_end;
    }

    links
}

fn fenced_code_ranges(body: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut active_fence = None;
    let mut active_start = 0;
    let mut line_start = 0;

    while line_start < body.len() {
        let Some((line, next_line_start)) = read_line_at(body, line_start) else {
            break;
        };

        if let Some(fence_line) = parse_fence_line(line) {
            if active_fence
                .map(|fence| fence_line.closes(fence))
                .unwrap_or(false)
            {
                ranges.push((active_start, next_line_start));
                active_fence = None;
            } else if active_fence.is_none() {
                active_fence = Some(fence_line.fence);
                active_start = line_start;
            }
        }

        line_start = next_line_start;
    }

    if active_fence.is_some() {
        ranges.push((active_start, body.len()));
    }

    ranges
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Fence {
    marker: char,
    length: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FenceLine {
    fence: Fence,
    only_whitespace_after_marker: bool,
}

impl FenceLine {
    fn closes(self, opening: Fence) -> bool {
        self.fence.marker == opening.marker
            && self.fence.length >= opening.length
            && self.only_whitespace_after_marker
    }
}

fn parse_fence_line(line: &str) -> Option<FenceLine> {
    let line = line.trim_end_matches('\r');
    let leading_spaces = line.bytes().take_while(|byte| *byte == b' ').count();
    if leading_spaces > 3 {
        return None;
    }

    let trimmed = &line[leading_spaces..];
    let marker = if trimmed.starts_with("```") {
        '`'
    } else if trimmed.starts_with("~~~") {
        '~'
    } else {
        return None;
    };
    let marker_byte = marker as u8;
    let length = trimmed
        .bytes()
        .take_while(|byte| *byte == marker_byte)
        .count();
    let after_marker = &trimmed[length..];

    Some(FenceLine {
        fence: Fence { marker, length },
        only_whitespace_after_marker: after_marker.trim().is_empty(),
    })
}

fn containing_range(ranges: &[(usize, usize)], offset: usize) -> Option<(usize, usize)> {
    ranges
        .iter()
        .copied()
        .find(|(start, end)| *start <= offset && offset < *end)
}

fn parse_wikilink_inner(inner: &str) -> Option<(String, Option<String>)> {
    let mut parts = inner.splitn(2, '|');
    let target = parts.next()?.trim();
    if target.is_empty() {
        return None;
    }

    let label = parts
        .next()
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map(str::to_owned);

    Some((target.to_owned(), label))
}
