use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;
use uuid::Uuid;

use super::canvas::CanvasRepository;
use crate::db::transaction::TransactionGuard;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Constellation {
    pub id: String,
    pub display_name: String,
    pub slug: String,
    pub parent_constellation_id: Option<String>,
    pub root_path: String,
    pub root_type: String,
    pub profile_scope: String,
    pub primary_canvas_id: Option<String>,
    pub summary: Option<String>,
    pub cover_asset: Option<String>,
    pub publish_settings: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ConstellationRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> ConstellationRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create(
        &self,
        display_name: String,
        slug: String,
        parent_constellation_id: Option<String>,
        root_path: String,
        summary: Option<String>,
        cover_asset: Option<String>,
        publish_settings: Value,
    ) -> Result<Constellation> {
        self.create_project(
            display_name,
            slug,
            parent_constellation_id,
            root_path,
            "directory".to_string(),
            "migration".to_string(),
            summary,
            cover_asset,
            publish_settings,
        )
    }

    pub fn create_project(
        &self,
        display_name: String,
        slug: String,
        parent_constellation_id: Option<String>,
        root_path: String,
        root_type: String,
        profile_scope: String,
        summary: Option<String>,
        cover_asset: Option<String>,
        publish_settings: Value,
    ) -> Result<Constellation> {
        let transaction = TransactionGuard::begin(self.connection)?;
        let constellation = self.create_in_existing_transaction(
            display_name,
            slug,
            parent_constellation_id,
            root_path,
            root_type,
            profile_scope,
            summary,
            cover_asset,
            publish_settings,
        )?;
        transaction.commit()?;
        Ok(constellation)
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn create_in_existing_transaction(
        &self,
        display_name: String,
        slug: String,
        parent_constellation_id: Option<String>,
        root_path: String,
        root_type: String,
        profile_scope: String,
        summary: Option<String>,
        cover_asset: Option<String>,
        publish_settings: Value,
    ) -> Result<Constellation> {
        let constellation_id = Uuid::new_v4().to_string();
        let constellation_timestamp = current_timestamp();

        self.connection.execute(
            "INSERT INTO projects (
                id,
                display_name,
                slug,
                parent_project_id,
                root_path,
                root_type,
                profile_scope,
                primary_canvas_id,
                summary,
                cover_asset,
                publish_settings,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9, ?10, ?11, ?11)",
            params![
                constellation_id,
                display_name,
                slug,
                parent_constellation_id.as_deref(),
                root_path,
                root_type,
                profile_scope,
                summary.as_deref(),
                cover_asset.as_deref(),
                publish_settings.to_string(),
                constellation_timestamp,
            ],
        )?;

        let canvas_repository = CanvasRepository::new(self.connection);
        let primary_canvas = canvas_repository.create_for_constellation(
            &constellation_id,
            "Primary canvas",
            "primary",
            None,
            true,
        )?;

        self.connection.execute(
            "UPDATE projects
             SET primary_canvas_id = ?1,
                 updated_at = ?2
             WHERE id = ?3",
            params![primary_canvas.id, current_timestamp(), constellation_id],
        )?;

        self.get_by_id(&constellation_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn get_by_id(&self, constellation_id: &str) -> Result<Option<Constellation>> {
        self.connection
            .query_row(
                "SELECT
                    id,
                    display_name,
                    slug,
                    parent_project_id,
                    root_path,
                    root_type,
                    profile_scope,
                    primary_canvas_id,
                    summary,
                    cover_asset,
                    publish_settings,
                    created_at,
                    updated_at
                 FROM projects
                 WHERE id = ?1",
                [constellation_id],
                constellation_from_row,
            )
            .optional()
    }

    pub fn list_children(&self, parent_constellation_id: &str) -> Result<Vec<Constellation>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                display_name,
                slug,
                parent_project_id,
                root_path,
                root_type,
                profile_scope,
                primary_canvas_id,
                summary,
                cover_asset,
                publish_settings,
                created_at,
                updated_at
             FROM projects
             WHERE parent_project_id = ?1
             ORDER BY display_name COLLATE NOCASE ASC, created_at ASC",
        )?;
        let rows = statement.query_map([parent_constellation_id], constellation_from_row)?;
        rows.collect()
    }

    pub fn list_descendants(&self, constellation_id: &str) -> Result<Vec<Constellation>> {
        let mut statement = self.connection.prepare(
            "WITH RECURSIVE descendants AS (
                SELECT
                    id,
                    display_name,
                    slug,
                    parent_project_id,
                    root_path,
                    root_type,
                    profile_scope,
                    primary_canvas_id,
                    summary,
                    cover_asset,
                    publish_settings,
                    created_at,
                    updated_at
                FROM projects
                WHERE parent_project_id = ?1
                UNION ALL
                SELECT
                    projects.id,
                    projects.display_name,
                    projects.slug,
                    projects.parent_project_id,
                    projects.root_path,
                    projects.root_type,
                    projects.profile_scope,
                    projects.primary_canvas_id,
                    projects.summary,
                    projects.cover_asset,
                    projects.publish_settings,
                    projects.created_at,
                    projects.updated_at
                FROM projects
                INNER JOIN descendants ON projects.parent_project_id = descendants.id
            )
            SELECT
                id,
                display_name,
                slug,
                parent_project_id,
                root_path,
                root_type,
                profile_scope,
                primary_canvas_id,
                summary,
                cover_asset,
                publish_settings,
                created_at,
                updated_at
            FROM descendants
            ORDER BY display_name COLLATE NOCASE ASC, created_at ASC",
        )?;
        let rows = statement.query_map([constellation_id], constellation_from_row)?;
        rows.collect()
    }

    pub fn update_summary(
        &self,
        constellation_id: &str,
        summary: Option<String>,
    ) -> Result<Constellation> {
        self.connection.execute(
            "UPDATE projects
             SET summary = ?1,
                 updated_at = ?2
             WHERE id = ?3",
            params![summary.as_deref(), current_timestamp(), constellation_id],
        )?;
        self.get_by_id(constellation_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_by_id(&self, constellation_id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM projects WHERE id = ?1", [constellation_id])?;
        Ok(())
    }
}

fn constellation_from_row(row: &rusqlite::Row<'_>) -> Result<Constellation> {
    Ok(Constellation {
        id: row.get(0)?,
        display_name: row.get(1)?,
        slug: row.get(2)?,
        parent_constellation_id: row.get(3)?,
        root_path: row.get(4)?,
        root_type: row.get(5)?,
        profile_scope: row.get(6)?,
        primary_canvas_id: row.get(7)?,
        summary: row.get(8)?,
        cover_asset: row.get(9)?,
        publish_settings: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
