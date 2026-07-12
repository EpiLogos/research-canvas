use crate::agent::markdown::{parse_markdown_source, MarkdownHeading};
use crate::agent::types::{VaultDocument, WikiLink};
use crate::fs::indexer::{index_directory, is_text_like_extension, IndexedEntry, IndexedEntryKind};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::io::{self, Read};
use std::path::Path;

const SNIPPET_MAX_BYTES: usize = 4096;
const BODY_MAX_BYTES: usize = 16_384;
const READ_MAX_BYTES: usize = 64 * 1024;
const UTF8_BOUNDARY_PROBE_BYTES: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub source_path: String,
    pub source_relative_path: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_number: Option<usize>,
    pub byte_start: usize,
    pub byte_end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateLink {
    pub path: String,
    pub relative_path: String,
    pub title: String,
    pub matched_text: String,
}

pub fn index_vault_roots<I, P>(roots: I) -> io::Result<Vec<VaultDocument>>
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    let mut documents = Vec::new();
    let mut seen_paths = HashSet::new();

    for root in roots {
        let root = root.as_ref();
        let root_path = root.canonicalize()?;
        let root_path_string = path_to_string(&root_path);

        for entry in index_directory(root)? {
            if !is_indexable_file(&entry) {
                continue;
            }

            let canonical_path = entry.absolute_path.canonicalize()?;
            if !seen_paths.insert(canonical_path.clone()) {
                continue;
            }

            if let Some(document) = build_document(
                &entry,
                &canonical_path,
                &root_path_string,
                &entry.relative_path,
            )? {
                documents.push(document);
            }
        }
    }

    documents.sort_by(|left, right| {
        left.root_path
            .cmp(&right.root_path)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });
    Ok(documents)
}

pub fn links_for_file(root: impl AsRef<Path>, file: impl AsRef<Path>) -> io::Result<Vec<WikiLink>> {
    let path = resolve_markdown_file(root.as_ref(), file.as_ref())?;
    let contents = read_utf8_file(&path)?;
    let absolute_path = path_to_string(&path);
    let mut links = parse_markdown_source(&contents, &absolute_path).links;
    rewrite_link_source_paths(&mut links, &absolute_path);
    Ok(links)
}

pub fn backlinks(root: impl AsRef<Path>, target: &str) -> io::Result<Vec<Backlink>> {
    let files = markdown_files_for_root(root.as_ref())?;
    let target_key = normalize_wiki_target(target);
    let mut accepted_targets = HashSet::from([target_key.clone()]);

    for file in &files {
        if file.keys.contains(&target_key) {
            accepted_targets.extend(file.keys.iter().cloned());
        }
    }

    let mut backlinks = Vec::new();
    for file in &files {
        for link in &file.links {
            if accepted_targets.contains(&normalize_wiki_target(&link.target)) {
                backlinks.push(Backlink {
                    source_path: file.absolute_path.clone(),
                    source_relative_path: file.relative_path.clone(),
                    target: link.target.clone(),
                    label: link.label.clone(),
                    line_number: line_number_at(&file.contents, link.byte_start),
                    byte_start: link.byte_start,
                    byte_end: link.byte_end,
                });
            }
        }
    }

    backlinks.sort_by(|left, right| {
        left.source_relative_path
            .cmp(&right.source_relative_path)
            .then_with(|| left.line_number.cmp(&right.line_number))
            .then_with(|| left.byte_start.cmp(&right.byte_start))
            .then_with(|| left.target.cmp(&right.target))
    });
    Ok(backlinks)
}

pub fn candidate_links(
    root: impl AsRef<Path>,
    file: impl AsRef<Path>,
) -> io::Result<Vec<CandidateLink>> {
    let root = root.as_ref();
    let source_path = resolve_markdown_file(root, file.as_ref())?;
    let source_path_string = path_to_string(&source_path);
    let source_contents = read_utf8_file(&source_path)?;
    let parsed = parse_markdown_source(&source_contents, &source_path_string);
    let visible_source = visible_candidate_text(&source_contents, &parsed.links);
    let linked_targets: HashSet<String> = parsed
        .links
        .iter()
        .map(|link| normalize_wiki_target(&link.target))
        .collect();

    let mut candidates = Vec::new();
    for vault_file in markdown_files_for_root(root)? {
        if vault_file.absolute_path == source_path_string {
            continue;
        }
        if vault_file
            .keys
            .iter()
            .any(|key| linked_targets.contains(key))
        {
            continue;
        }

        let Some(matched_text) = first_unlinked_candidate_match(&visible_source, &vault_file)
        else {
            continue;
        };

        candidates.push(CandidateLink {
            path: vault_file.absolute_path,
            relative_path: vault_file.relative_path,
            title: vault_file.title,
            matched_text,
        });
    }

    candidates.sort_by(|left, right| {
        normalize_wiki_target(&left.matched_text)
            .cmp(&normalize_wiki_target(&right.matched_text))
            .then_with(|| left.relative_path.cmp(&right.relative_path))
            .then_with(|| left.title.cmp(&right.title))
    });
    Ok(candidates)
}

fn is_indexable_file(entry: &IndexedEntry) -> bool {
    if entry.is_directory {
        return false;
    }

    match entry.kind {
        IndexedEntryKind::Markdown => true,
        IndexedEntryKind::Image => false,
        IndexedEntryKind::Directory => false,
        IndexedEntryKind::OtherFile => entry
            .absolute_path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(is_text_like_extension)
            .unwrap_or(false),
    }
}

fn build_document(
    entry: &IndexedEntry,
    canonical_path: &Path,
    root_path: &str,
    relative_path: &str,
) -> io::Result<Option<VaultDocument>> {
    let absolute_path = path_to_string(canonical_path);

    match entry.kind {
        IndexedEntryKind::Markdown => {
            let contents = match read_utf8_file(&entry.absolute_path) {
                Ok(contents) => contents,
                Err(error) if error.kind() == io::ErrorKind::InvalidData => return Ok(None),
                Err(error) => return Err(error),
            };
            let parsed = parse_markdown_source(&contents, absolute_path.as_str());
            let title = markdown_title(&parsed.frontmatter, &parsed.headings, &entry.absolute_path);
            let mut wikilinks = parsed.links;
            rewrite_link_source_paths(&mut wikilinks, &absolute_path);
            let body = bounded_text(&parsed.body, BODY_MAX_BYTES);
            let snippet = bounded_text(&parsed.body, SNIPPET_MAX_BYTES);

            Ok(Some(VaultDocument {
                path: absolute_path.clone(),
                absolute_path,
                root_path: root_path.to_owned(),
                relative_path: relative_path.to_owned(),
                title,
                body,
                tags: parsed.tags,
                headings: parsed.headings,
                wikilinks,
                frontmatter: parsed.frontmatter,
                size_bytes: entry.size_bytes,
                snippet,
            }))
        }
        IndexedEntryKind::OtherFile => match read_utf8_prefix(&entry.absolute_path, READ_MAX_BYTES)
        {
            Ok(contents) => {
                let body = bounded_text(&contents, BODY_MAX_BYTES);
                let snippet = bounded_text(&contents, SNIPPET_MAX_BYTES);
                Ok(Some(VaultDocument {
                    path: absolute_path.clone(),
                    absolute_path,
                    root_path: root_path.to_owned(),
                    relative_path: relative_path.to_owned(),
                    title: fallback_title(&entry.absolute_path),
                    body,
                    tags: Vec::new(),
                    headings: Vec::new(),
                    wikilinks: Vec::new(),
                    frontmatter: Map::new(),
                    size_bytes: entry.size_bytes,
                    snippet,
                }))
            }
            Err(error) if error.kind() == io::ErrorKind::InvalidData => Ok(None),
            Err(error) => Err(error),
        },
        IndexedEntryKind::Directory | IndexedEntryKind::Image => Ok(None),
    }
}

fn markdown_title(
    frontmatter: &Map<String, Value>,
    headings: &[MarkdownHeading],
    path: &Path,
) -> String {
    frontmatter
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            headings
                .iter()
                .find(|heading| heading.level == 1)
                .or_else(|| headings.first())
                .map(|heading| heading.text.clone())
        })
        .unwrap_or_else(|| fallback_title(path))
}

fn fallback_title(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("Untitled")
        .to_owned()
}

fn rewrite_link_source_paths(links: &mut [WikiLink], absolute_path: &str) {
    for link in links {
        link.source_path = absolute_path.to_owned();
    }
}

fn bounded_text(contents: &str, max_bytes: usize) -> String {
    if contents.len() <= max_bytes {
        return contents.to_owned();
    }

    let mut end = max_bytes;
    while !contents.is_char_boundary(end) {
        end -= 1;
    }
    contents[..end].to_owned()
}

fn read_utf8_prefix(path: &Path, max_bytes: usize) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let read_limit = max_bytes.saturating_add(UTF8_BOUNDARY_PROBE_BYTES);
    let mut bytes = Vec::with_capacity(read_limit);
    file.by_ref()
        .take(read_limit as u64)
        .read_to_end(&mut bytes)?;

    if bytes.len() <= max_bytes {
        return String::from_utf8(bytes).map_err(invalid_utf8_error);
    }

    let mut end = max_bytes;
    loop {
        match std::str::from_utf8(&bytes[..end]) {
            Ok(prefix) => return Ok(prefix.to_owned()),
            Err(error) if error.error_len().is_none() => {
                end = error.valid_up_to();
            }
            Err(_) => return Err(invalid_utf8_error(())),
        }
    }
}

fn read_utf8_file(path: &Path) -> io::Result<String> {
    fs::read_to_string(path).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            invalid_utf8_error(error)
        } else {
            error
        }
    })
}

fn invalid_utf8_error<E>(_error: E) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        "stream did not contain valid UTF-8",
    )
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[derive(Debug, Clone)]
struct MarkdownVaultFile {
    absolute_path: String,
    relative_path: String,
    title: String,
    contents: String,
    links: Vec<WikiLink>,
    keys: HashSet<String>,
}

fn markdown_files_for_root(root: &Path) -> io::Result<Vec<MarkdownVaultFile>> {
    let root_path = root.canonicalize()?;
    let mut files = Vec::new();

    for entry in index_directory(root)? {
        if entry.is_directory || entry.kind != IndexedEntryKind::Markdown {
            continue;
        }

        let canonical_path = entry.absolute_path.canonicalize()?;
        if !canonical_path.starts_with(&root_path) {
            continue;
        }

        let contents = match read_utf8_file(&canonical_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == io::ErrorKind::InvalidData => continue,
            Err(error) => return Err(error),
        };

        let absolute_path = path_to_string(&canonical_path);
        let parsed = parse_markdown_source(&contents, &absolute_path);
        let title = markdown_title(&parsed.frontmatter, &parsed.headings, &entry.absolute_path);
        let mut links = parsed.links;
        rewrite_link_source_paths(&mut links, &absolute_path);
        let relative_path = entry.relative_path;
        let keys = document_target_keys(&relative_path, &title);

        files.push(MarkdownVaultFile {
            absolute_path,
            relative_path,
            title,
            contents,
            links,
            keys,
        });
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

fn resolve_markdown_file(root: &Path, file: &Path) -> io::Result<std::path::PathBuf> {
    let root = root.canonicalize()?;
    let candidate = if file.is_absolute() {
        file.to_path_buf()
    } else {
        root.join(file)
    };
    let path = candidate.canonicalize()?;

    if !path.starts_with(&root) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "markdown file must be inside the vault root",
        ));
    }

    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(is_markdown_extension)
        .unwrap_or(false);
    if !is_markdown {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "vault link tools only read markdown files",
        ));
    }

    Ok(path)
}

fn is_markdown_extension(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "md" | "markdown" | "mdown" | "mkd"
    )
}

fn document_target_keys(relative_path: &str, title: &str) -> HashSet<String> {
    let mut keys = HashSet::new();
    keys.insert(normalize_wiki_target(relative_path));
    if let Some(stem) = Path::new(relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
    {
        keys.insert(normalize_wiki_target(stem));
    }
    keys.insert(normalize_wiki_target(title));
    keys
}

fn normalize_wiki_target(target: &str) -> String {
    let mut normalized = target
        .trim()
        .replace('\\', "/")
        .split('#')
        .next()
        .unwrap_or_default()
        .trim()
        .trim_matches('/')
        .to_lowercase();

    while let Some(stripped) = normalized.strip_prefix("./") {
        normalized = stripped.to_owned();
    }

    for extension in [".markdown", ".mdown", ".mkd", ".md"] {
        if let Some(stripped) = normalized.strip_suffix(extension) {
            normalized = stripped.to_owned();
            break;
        }
    }

    normalized
}

fn line_number_at(contents: &str, byte_start: usize) -> Option<usize> {
    if byte_start > contents.len() || !contents.is_char_boundary(byte_start) {
        return None;
    }

    Some(
        contents[..byte_start]
            .bytes()
            .filter(|byte| *byte == b'\n')
            .count()
            + 1,
    )
}

fn visible_candidate_text(contents: &str, links: &[WikiLink]) -> String {
    let mut masked = contents.to_owned();
    for (start, end) in invisible_markdown_ranges(contents) {
        mask_range(&mut masked, start, end);
    }
    for link in links.iter().rev() {
        mask_range(&mut masked, link.byte_start, link.byte_end);
    }
    masked
}

fn invisible_markdown_ranges(contents: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut line_start = frontmatter_range(contents)
        .map(|range| {
            ranges.push(range);
            range.1
        })
        .unwrap_or(0);
    let mut active_fence_start = None;

    while line_start < contents.len() {
        let Some((line, next_line_start)) = read_line_at(contents, line_start) else {
            break;
        };

        if is_fence_line(line) {
            if let Some(fence_start) = active_fence_start.take() {
                ranges.push((fence_start, next_line_start));
            } else {
                active_fence_start = Some(line_start);
            }
            line_start = next_line_start;
            continue;
        }

        if active_fence_start.is_none() && is_heading_line(line) {
            ranges.push((line_start, next_line_start));
        }

        line_start = next_line_start;
    }

    if let Some(fence_start) = active_fence_start {
        ranges.push((fence_start, contents.len()));
    }

    ranges
}

fn frontmatter_range(contents: &str) -> Option<(usize, usize)> {
    let (first_line, mut line_start) = read_line_at(contents, 0)?;
    if first_line.trim_end_matches('\r') != "---" {
        return None;
    }

    while line_start < contents.len() {
        let (line, next_line_start) = read_line_at(contents, line_start)?;
        if line.trim_end_matches('\r') == "---" {
            return Some((0, next_line_start));
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

fn is_heading_line(line: &str) -> bool {
    let level = line
        .as_bytes()
        .iter()
        .take_while(|byte| **byte == b'#')
        .count();
    (1..=6).contains(&level) && line[level..].starts_with(char::is_whitespace)
}

fn is_fence_line(line: &str) -> bool {
    let line = line.trim_end_matches('\r');
    let leading_spaces = line.bytes().take_while(|byte| *byte == b' ').count();
    if leading_spaces > 3 {
        return false;
    }

    let trimmed = &line[leading_spaces..];
    trimmed.starts_with("```") || trimmed.starts_with("~~~")
}

fn mask_range(contents: &mut String, start: usize, end: usize) {
    if start <= end
        && end <= contents.len()
        && contents.is_char_boundary(start)
        && contents.is_char_boundary(end)
    {
        let spaces = " ".repeat(end - start);
        contents.replace_range(start..end, &spaces);
    }
}

fn first_unlinked_candidate_match(source: &str, file: &MarkdownVaultFile) -> Option<String> {
    candidate_phrases(file)
        .into_iter()
        .find(|phrase| contains_phrase(source, phrase))
}

fn candidate_phrases(file: &MarkdownVaultFile) -> Vec<String> {
    let mut phrases = Vec::new();
    push_candidate_phrase(&mut phrases, &file.title);
    if let Some(stem) = Path::new(&file.relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
    {
        push_candidate_phrase(&mut phrases, stem);
    }
    phrases
}

fn push_candidate_phrase(phrases: &mut Vec<String>, phrase: &str) {
    let phrase = phrase.trim();
    if phrase.is_empty() {
        return;
    }
    if !phrases
        .iter()
        .any(|existing| normalize_wiki_target(existing) == normalize_wiki_target(phrase))
    {
        phrases.push(phrase.to_owned());
    }
}

fn contains_phrase(source: &str, phrase: &str) -> bool {
    let source = source.to_lowercase();
    let phrase = phrase.trim().to_lowercase();
    if phrase.is_empty() {
        return false;
    }

    let mut search_start = 0;
    while let Some(offset) = source[search_start..].find(&phrase) {
        let start = search_start + offset;
        let end = start + phrase.len();
        if has_phrase_boundary(&source, start, end) {
            return true;
        }
        search_start = end;
    }

    false
}

fn has_phrase_boundary(source: &str, start: usize, end: usize) -> bool {
    let before = source[..start].chars().next_back();
    let after = source[end..].chars().next();
    before.map(is_phrase_boundary).unwrap_or(true) && after.map(is_phrase_boundary).unwrap_or(true)
}

fn is_phrase_boundary(character: char) -> bool {
    !character.is_alphanumeric() && character != '_'
}
