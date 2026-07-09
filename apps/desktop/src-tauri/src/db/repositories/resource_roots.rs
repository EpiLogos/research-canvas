use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::{fs, path::Path};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceRootRecord {
    pub id: String,
    pub constellation_id: String,
    pub root_path: String,
    pub display_name: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ResourceRootRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> ResourceRootRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn attach(
        &self,
        constellation_id: &str,
        root_path: impl AsRef<Path>,
        display_name: Option<String>,
    ) -> Result<ResourceRootRecord> {
        let root_path = canonical_root_path(root_path.as_ref())?;
        let display_name = display_name.unwrap_or_else(|| display_name_for_root(&root_path));
        let now = current_timestamp();
        let id = Uuid::new_v4().to_string();

        self.connection.execute(
            "INSERT INTO project_resource_roots (
                id,
                project_id,
                root_path,
                display_name,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
             ON CONFLICT(project_id, root_path) DO UPDATE SET
                display_name = excluded.display_name,
                updated_at = excluded.updated_at",
            params![
                id,
                constellation_id,
                root_path.to_string_lossy().to_string(),
                display_name,
                now,
            ],
        )?;

        self.get_by_constellation_and_root_path(constellation_id, &root_path)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn detach(&self, constellation_id: &str, root_path: impl AsRef<Path>) -> Result<()> {
        let root_path = canonical_root_path(root_path.as_ref())?;
        self.connection.execute(
            "DELETE FROM project_resource_roots
             WHERE project_id = ?1 AND root_path = ?2",
            params![constellation_id, root_path.to_string_lossy().to_string()],
        )?;
        Ok(())
    }

    pub fn list_for_constellation(
        &self,
        constellation_id: &str,
    ) -> Result<Vec<ResourceRootRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                project_id,
                root_path,
                display_name,
                created_at,
                updated_at
             FROM project_resource_roots
             WHERE project_id = ?1
             ORDER BY created_at ASC, display_name COLLATE NOCASE ASC",
        )?;
        let rows = statement.query_map([constellation_id], resource_root_from_row)?;
        rows.collect()
    }

    pub fn get_by_constellation_and_root_path(
        &self,
        constellation_id: &str,
        root_path: impl AsRef<Path>,
    ) -> Result<Option<ResourceRootRecord>> {
        let root_path = canonical_root_path(root_path.as_ref())?;
        self.connection
            .query_row(
                "SELECT
                    id,
                    project_id,
                    root_path,
                    display_name,
                    created_at,
                    updated_at
                 FROM project_resource_roots
                 WHERE project_id = ?1 AND root_path = ?2",
                params![constellation_id, root_path.to_string_lossy().to_string()],
                resource_root_from_row,
            )
            .optional()
    }
}

fn canonical_root_path(path: &Path) -> Result<std::path::PathBuf> {
    fs::canonicalize(path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            rusqlite::Error::InvalidPath(path.to_path_buf())
        } else {
            rusqlite::Error::ToSqlConversionFailure(Box::new(error))
        }
    })
}

fn display_name_for_root(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn resource_root_from_row(row: &rusqlite::Row<'_>) -> Result<ResourceRootRecord> {
    let constellation_id: String = row.get(1)?;
    Ok(ResourceRootRecord {
        id: row.get(0)?,
        constellation_id: constellation_id.clone(),
        root_path: row.get(2)?,
        display_name: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
