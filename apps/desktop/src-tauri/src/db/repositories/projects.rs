use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;
use uuid::Uuid;

use super::canvas::CanvasRepository;
use crate::db::transaction::TransactionGuard;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub display_name: String,
    pub slug: String,
    pub parent_project_id: Option<String>,
    pub root_path: String,
    pub primary_canvas_id: Option<String>,
    pub summary: Option<String>,
    pub cover_asset: Option<String>,
    pub publish_settings: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ProjectRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> ProjectRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create(
        &self,
        display_name: String,
        slug: String,
        parent_project_id: Option<String>,
        root_path: String,
        summary: Option<String>,
        cover_asset: Option<String>,
        publish_settings: Value,
    ) -> Result<Project> {
        let project_id = Uuid::new_v4().to_string();
        let project_timestamp = current_timestamp();
        let transaction = TransactionGuard::begin(self.connection)?;

        self.connection.execute(
            "INSERT INTO projects (
                id,
                display_name,
                slug,
                parent_project_id,
                root_path,
                primary_canvas_id,
                summary,
                cover_asset,
                publish_settings,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, ?8, ?9, ?9)",
            params![
                project_id,
                display_name,
                slug,
                parent_project_id.as_deref(),
                root_path,
                summary.as_deref(),
                cover_asset.as_deref(),
                publish_settings.to_string(),
                project_timestamp,
            ],
        )?;

        let canvas_repository = CanvasRepository::new(self.connection);
        let primary_canvas = canvas_repository.create_for_project(
            &project_id,
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
            params![primary_canvas.id, current_timestamp(), project_id],
        )?;

        transaction.commit()?;

        self.get_by_id(&project_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn get_by_id(&self, project_id: &str) -> Result<Option<Project>> {
        self.connection
            .query_row(
                "SELECT
                    id,
                    display_name,
                    slug,
                    parent_project_id,
                    root_path,
                    primary_canvas_id,
                    summary,
                    cover_asset,
                    publish_settings,
                    created_at,
                    updated_at
                 FROM projects
                 WHERE id = ?1",
                [project_id],
                project_from_row,
            )
            .optional()
    }

    pub fn list_children(&self, parent_project_id: &str) -> Result<Vec<Project>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                display_name,
                slug,
                parent_project_id,
                root_path,
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
        let rows = statement.query_map([parent_project_id], project_from_row)?;
        rows.collect()
    }

    pub fn list_descendants(&self, project_id: &str) -> Result<Vec<Project>> {
        let mut statement = self.connection.prepare(
            "WITH RECURSIVE descendants AS (
                SELECT
                    id,
                    display_name,
                    slug,
                    parent_project_id,
                    root_path,
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
                primary_canvas_id,
                summary,
                cover_asset,
                publish_settings,
                created_at,
                updated_at
            FROM descendants
            ORDER BY display_name COLLATE NOCASE ASC, created_at ASC",
        )?;
        let rows = statement.query_map([project_id], project_from_row)?;
        rows.collect()
    }

    pub fn update_summary(&self, project_id: &str, summary: Option<String>) -> Result<Project> {
        self.connection.execute(
            "UPDATE projects
             SET summary = ?1,
                 updated_at = ?2
             WHERE id = ?3",
            params![summary.as_deref(), current_timestamp(), project_id],
        )?;
        self.get_by_id(project_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_by_id(&self, project_id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
        Ok(())
    }
}

fn project_from_row(row: &rusqlite::Row<'_>) -> Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        display_name: row.get(1)?,
        slug: row.get(2)?,
        parent_project_id: row.get(3)?,
        root_path: row.get(4)?,
        primary_canvas_id: row.get(5)?,
        summary: row.get(6)?,
        cover_asset: row.get(7)?,
        publish_settings: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
