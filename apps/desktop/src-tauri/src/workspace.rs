use std::collections::BTreeMap;
use std::env;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};
use thiserror::Error;

pub const AUTHORING_DATABASE_FILENAME: &str = "research-canvas-authoring.sqlite";
pub const DATABASE_PATH_ENV: &str = "RESEARCH_CANVAS_DATABASE_PATH";
pub const DATA_DIR_ENV: &str = "RESEARCH_CANVAS_DATA_DIR";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationOutcome {
    LegacyMissing,
    Migrated,
}

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("could not determine a persistent local data directory; set {DATA_DIR_ENV}")]
    MissingLocalDataDirectory,
    #[error("workspace database destination already exists: {0}")]
    DestinationExists(PathBuf),
    #[error("workspace database source is missing: {0}")]
    SourceMissing(PathBuf),
    #[error("workspace database source and destination are the same path: {0}")]
    SameSourceAndDestination(PathBuf),
    #[error("workspace database path has no parent directory: {0}")]
    MissingParent(PathBuf),
    #[error("workspace database I/O failed for {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("workspace SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("migrated workspace failed SQLite integrity check: {0}")]
    Integrity(String),
}

#[derive(Debug, serde::Serialize)]
pub struct DatabaseSummary {
    pub integrity: String,
    pub counts: BTreeMap<String, i64>,
}

pub fn persistent_workspace_data_dir() -> Result<PathBuf, WorkspaceError> {
    match env::var_os(DATA_DIR_ENV) {
        Some(path) => Ok(PathBuf::from(path)),
        None => dirs::data_local_dir()
            .map(|root| root.join("research-canvas").join("workspace"))
            .ok_or(WorkspaceError::MissingLocalDataDirectory),
    }
}

pub fn resolve_database_path(
    database_override: Option<&Path>,
    persistent_data_dir: Option<&Path>,
    temp_dir: &Path,
    session_id: Option<&str>,
) -> Result<PathBuf, WorkspaceError> {
    if let Some(path) = database_override {
        return Ok(path.to_path_buf());
    }

    if let Some(session_id) = session_id {
        return Ok(temp_dir
            .join("research-canvas-tests")
            .join(format!("{}.sqlite", sanitize_session_id(session_id))));
    }

    let data_dir = persistent_data_dir
        .map(Path::to_path_buf)
        .map(Ok)
        .unwrap_or_else(persistent_workspace_data_dir)?;
    Ok(data_dir.join(AUTHORING_DATABASE_FILENAME))
}

pub fn configured_database_path(session_id: Option<&str>) -> Result<PathBuf, WorkspaceError> {
    let database_override = env::var_os(DATABASE_PATH_ENV).map(PathBuf::from);
    let persistent_data_dir = if database_override.is_none() {
        Some(persistent_workspace_data_dir()?)
    } else {
        None
    };
    resolve_database_path(
        database_override.as_deref(),
        persistent_data_dir.as_deref(),
        &env::temp_dir(),
        session_id,
    )
}

pub fn legacy_database_path() -> PathBuf {
    env::temp_dir().join(AUTHORING_DATABASE_FILENAME)
}

pub fn prepare_database_path(session_id: Option<&str>) -> Result<PathBuf, WorkspaceError> {
    let destination = configured_database_path(session_id)?;
    if session_id.is_some() || env::var_os(DATABASE_PATH_ENV).is_some() || destination.exists() {
        ensure_database_parent(&destination)?;
        return Ok(destination);
    }

    match migrate_legacy_database(&legacy_database_path(), &destination) {
        Ok(MigrationOutcome::LegacyMissing | MigrationOutcome::Migrated)
        | Err(WorkspaceError::DestinationExists(_)) => {
            ensure_database_parent(&destination)?;
            Ok(destination)
        }
        Err(error) => Err(error),
    }
}

pub fn ensure_database_parent(database: &Path) -> Result<(), WorkspaceError> {
    let parent = database
        .parent()
        .ok_or_else(|| WorkspaceError::MissingParent(database.to_path_buf()))?;
    if parent.as_os_str().is_empty() {
        return Ok(());
    }
    fs::create_dir_all(parent).map_err(|source| WorkspaceError::Io {
        path: parent.to_path_buf(),
        source,
    })
}

pub fn migrate_legacy_database(
    legacy: &Path,
    destination: &Path,
) -> Result<MigrationOutcome, WorkspaceError> {
    if destination.exists() {
        return Err(WorkspaceError::DestinationExists(destination.to_path_buf()));
    }
    if !legacy.is_file() {
        return Ok(MigrationOutcome::LegacyMissing);
    }

    let parent = destination
        .parent()
        .ok_or_else(|| WorkspaceError::MissingParent(destination.to_path_buf()))?;
    fs::create_dir_all(parent).map_err(|source| WorkspaceError::Io {
        path: parent.to_path_buf(),
        source,
    })?;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|source| {
            if source.kind() == std::io::ErrorKind::AlreadyExists {
                WorkspaceError::DestinationExists(destination.to_path_buf())
            } else {
                WorkspaceError::Io {
                    path: destination.to_path_buf(),
                    source,
                }
            }
        })?;

    let migration = (|| -> Result<(), WorkspaceError> {
        let source = Connection::open_with_flags(legacy, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut target = Connection::open(destination)?;
        let backup = Backup::new(&source, &mut target)?;
        backup.run_to_completion(128, Duration::from_millis(10), None)?;
        drop(backup);
        let integrity: String = target.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if integrity != "ok" {
            return Err(WorkspaceError::Integrity(integrity));
        }
        target.close().map_err(|(_, error)| error)?;
        Ok(())
    })();

    if let Err(error) = migration {
        let _ = fs::remove_file(destination);
        return Err(error);
    }

    Ok(MigrationOutcome::Migrated)
}

pub fn backup_database(source: &Path, destination: &Path) -> Result<(), WorkspaceError> {
    if destination.exists() {
        return Err(WorkspaceError::DestinationExists(destination.to_path_buf()));
    }
    create_database_copy(source, destination)
}

pub fn restore_database(
    source: &Path,
    destination: &Path,
    replace: bool,
    repository_roots: Option<(&Path, &Path)>,
) -> Result<(), WorkspaceError> {
    if destination.exists() && !replace {
        return Err(WorkspaceError::DestinationExists(destination.to_path_buf()));
    }
    if !replace {
        create_database_copy(source, destination)?;
        if let Some((old_root, new_root)) = repository_roots {
            rebase_repository_paths(destination, old_root, new_root)?;
        }
        return Ok(());
    }

    let parent = database_parent(destination)?;
    fs::create_dir_all(parent).map_err(|source| WorkspaceError::Io {
        path: parent.to_path_buf(),
        source,
    })?;
    let token = uuid::Uuid::new_v4();
    let pending = parent.join(format!(".research-canvas-restore-{token}.sqlite"));
    let previous = parent.join(format!(".research-canvas-previous-{token}.sqlite"));
    create_database_copy(source, &pending)?;
    if let Some((old_root, new_root)) = repository_roots {
        if let Err(error) = rebase_repository_paths(&pending, old_root, new_root) {
            let _ = fs::remove_file(&pending);
            return Err(error);
        }
    }

    if destination.exists() {
        fs::rename(destination, &previous).map_err(|source| WorkspaceError::Io {
            path: destination.to_path_buf(),
            source,
        })?;
    }
    if let Err(source) = fs::rename(&pending, destination) {
        if previous.exists() {
            let _ = fs::rename(&previous, destination);
        }
        let _ = fs::remove_file(&pending);
        return Err(WorkspaceError::Io {
            path: destination.to_path_buf(),
            source,
        });
    }
    if previous.exists() {
        fs::remove_file(&previous).map_err(|source| WorkspaceError::Io {
            path: previous,
            source,
        })?;
    }
    Ok(())
}

pub fn database_summary(path: &Path) -> Result<DatabaseSummary, WorkspaceError> {
    if !path.is_file() {
        return Err(WorkspaceError::SourceMissing(path.to_path_buf()));
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let mut table_statement = connection.prepare(
        "SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
           AND name <> 'schema_migrations'
           AND (
             name = 'search_documents'
             OR name NOT LIKE 'search_documents_%'
           )
         ORDER BY name",
    )?;
    let tables = table_statement
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut counts = BTreeMap::new();
    for table in tables {
        let quoted = table.replace('"', "\"\"");
        let count =
            connection.query_row(&format!("SELECT COUNT(*) FROM \"{quoted}\""), [], |row| {
                row.get::<_, i64>(0)
            })?;
        counts.insert(table, count);
    }
    Ok(DatabaseSummary { integrity, counts })
}

pub fn database_roots(path: &Path) -> Result<Vec<String>, WorkspaceError> {
    if !path.is_file() {
        return Err(WorkspaceError::SourceMissing(path.to_path_buf()));
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut roots = Vec::new();
    for (table, column) in [
        ("projects", "root_path"),
        ("project_resource_roots", "root_path"),
    ] {
        if !column_exists(&connection, table, column)? {
            continue;
        }
        let mut statement = connection.prepare(&format!(
            "SELECT DISTINCT \"{column}\" FROM \"{table}\"
             WHERE \"{column}\" IS NOT NULL AND \"{column}\" <> ''
             ORDER BY \"{column}\""
        ))?;
        roots.extend(
            statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?,
        );
    }
    roots.sort();
    roots.dedup();
    Ok(roots)
}

pub fn rebase_repository_paths(
    database: &Path,
    old_root: &Path,
    new_root: &Path,
) -> Result<(), WorkspaceError> {
    let old_root = old_root.to_string_lossy();
    let new_root = new_root.to_string_lossy();
    if old_root == new_root {
        return Ok(());
    }
    let mut connection = Connection::open(database)?;
    let transaction = connection.transaction()?;
    for (table, column) in [
        ("projects", "root_path"),
        ("projects", "cover_asset"),
        ("project_resource_roots", "root_path"),
        ("canvas_nodes", "absolute_path"),
        ("canvas_nodes", "thumbnail"),
        ("node_attachment", "managed_path"),
        ("node_attachment", "provenance_source_path"),
    ] {
        if !column_exists(&transaction, table, column)? {
            continue;
        }
        let statement = format!(
            "UPDATE \"{table}\"
             SET \"{column}\" = ?2 || substr(\"{column}\", length(?1) + 1)
             WHERE \"{column}\" = ?1 OR \"{column}\" LIKE ?1 || '/%'"
        );
        transaction.execute(&statement, rusqlite::params![old_root, new_root])?;
    }
    transaction.commit()?;
    Ok(())
}

fn create_database_copy(source: &Path, destination: &Path) -> Result<(), WorkspaceError> {
    if !source.is_file() {
        return Err(WorkspaceError::SourceMissing(source.to_path_buf()));
    }
    if source == destination {
        return Err(WorkspaceError::SameSourceAndDestination(
            source.to_path_buf(),
        ));
    }
    let parent = database_parent(destination)?;
    fs::create_dir_all(parent).map_err(|source| WorkspaceError::Io {
        path: parent.to_path_buf(),
        source,
    })?;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|source| {
            if source.kind() == std::io::ErrorKind::AlreadyExists {
                WorkspaceError::DestinationExists(destination.to_path_buf())
            } else {
                WorkspaceError::Io {
                    path: destination.to_path_buf(),
                    source,
                }
            }
        })?;
    let result = (|| -> Result<(), WorkspaceError> {
        let source = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut target = Connection::open(destination)?;
        let backup = Backup::new(&source, &mut target)?;
        backup.run_to_completion(128, Duration::from_millis(10), None)?;
        drop(backup);
        let integrity: String = target.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if integrity != "ok" {
            return Err(WorkspaceError::Integrity(integrity));
        }
        target.close().map_err(|(_, error)| error)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    Ok(())
}

fn database_parent(path: &Path) -> Result<&Path, WorkspaceError> {
    path.parent()
        .ok_or_else(|| WorkspaceError::MissingParent(path.to_path_buf()))
}

fn column_exists(
    connection: &Connection,
    table: &str,
    column: &str,
) -> Result<bool, rusqlite::Error> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(columns.iter().any(|candidate| candidate == column))
}

fn sanitize_session_id(session_id: &str) -> String {
    let mut sanitized = String::with_capacity(session_id.len());
    let mut previous_was_separator = false;
    for character in session_id.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
            sanitized.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator && !sanitized.is_empty() {
            sanitized.push('-');
            previous_was_separator = true;
        }
    }
    while sanitized.ends_with('-') {
        sanitized.pop();
    }
    if sanitized.is_empty() {
        "session".to_string()
    } else {
        sanitized
    }
}
