use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndexedEntryKind {
    Directory,
    Markdown,
    Image,
    OtherFile,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedEntry {
    pub name: String,
    pub relative_path: String,
    pub absolute_path: PathBuf,
    pub kind: IndexedEntryKind,
    pub is_directory: bool,
    pub depth: usize,
    pub size_bytes: u64,
}

pub fn index_directory(root: impl AsRef<Path>) -> io::Result<Vec<IndexedEntry>> {
    let root = root.as_ref();
    let mut entries = Vec::new();
    walk(root, root, 0, &mut entries)?;
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(entries)
}

fn walk(
    root: &Path,
    current: &Path,
    depth: usize,
    entries: &mut Vec<IndexedEntry>,
) -> io::Result<()> {
    let mut children = fs::read_dir(current)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by(|left, right| {
        left.file_name()
            .to_string_lossy()
            .cmp(&right.file_name().to_string_lossy())
    });

    for child in children {
        let path = child.path();
        let file_name = child.file_name().to_string_lossy().to_string();

        if is_hidden(&file_name) {
            continue;
        }

        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let is_directory = metadata.is_dir();
        if is_directory && should_skip_directory(&file_name) {
            continue;
        }
        let relative_path = relative_path(root, &path);
        let kind = if is_directory {
            IndexedEntryKind::Directory
        } else {
            classify_file(&path)
        };

        entries.push(IndexedEntry {
            name: file_name,
            relative_path,
            absolute_path: path.clone(),
            kind,
            is_directory,
            depth,
            size_bytes: if is_directory { 0 } else { metadata.len() },
        });

        if is_directory {
            walk(root, &path, depth + 1, entries)?;
        }
    }

    Ok(())
}

fn classify_file(path: &Path) -> IndexedEntryKind {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("md") | Some("markdown") | Some("mdown") | Some("mkd") => IndexedEntryKind::Markdown,
        Some("png") | Some("jpg") | Some("jpeg") | Some("gif") | Some("webp") | Some("svg") => {
            IndexedEntryKind::Image
        }
        _ => IndexedEntryKind::OtherFile,
    }
}

fn is_hidden(file_name: &str) -> bool {
    file_name.starts_with('.')
}

fn should_skip_directory(file_name: &str) -> bool {
    matches!(
        file_name,
        "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".pnpm-store"
            | "__pycache__"
            | "DerivedData"
    )
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}
