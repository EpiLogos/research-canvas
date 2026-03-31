use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Canvas {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub kind: String,
    pub summary: Option<String>,
    pub is_primary: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub struct CanvasRepository<'conn> {
    connection: &'conn Connection,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CanvasNodeRecord {
    pub id: String,
    pub canvas_id: String,
    pub node_type: String,
    pub title: String,
    pub summary: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub resource_kind: Option<String>,
    pub absolute_path: Option<String>,
    pub relative_path: Option<String>,
    pub mime_type: Option<String>,
    pub file_fingerprint: Option<String>,
    pub url: Option<String>,
    pub color: Option<String>,
    pub child_node_ids: Vec<String>,
    pub target_canvas_id: Option<String>,
    pub dot_colour: Option<String>,
    pub bg_colour: Option<String>,
    pub text_colour: Option<String>,
    pub thumbnail: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CanvasEdgeRecord {
    pub id: String,
    pub canvas_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relation_kind: String,
    pub directionality: String,
    pub label: String,
    pub note: String,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CanvasSnapshotRecord {
    pub nodes: Vec<CanvasNodeRecord>,
    pub edges: Vec<CanvasEdgeRecord>,
}

pub struct CanvasGraphRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> CanvasRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create_for_project(
        &self,
        project_id: &str,
        name: &str,
        kind: &str,
        summary: Option<String>,
        is_primary: bool,
    ) -> Result<Canvas> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO canvases (
                id,
                project_id,
                name,
                kind,
                summary,
                is_primary,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                project_id,
                name,
                kind,
                summary.as_deref(),
                is_primary as i64,
                now,
                now,
            ],
        )?;
        self.get_by_id(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn get_by_id(&self, canvas_id: &str) -> Result<Option<Canvas>> {
        self.connection
            .query_row(
                "SELECT id, project_id, name, kind, summary, is_primary, created_at, updated_at
                 FROM canvases
                 WHERE id = ?1",
                [canvas_id],
                canvas_from_row,
            )
            .optional()
    }

    pub fn list_for_project(&self, project_id: &str) -> Result<Vec<Canvas>> {
        let mut statement = self.connection.prepare(
            "SELECT id, project_id, name, kind, summary, is_primary, created_at, updated_at
             FROM canvases
             WHERE project_id = ?1
             ORDER BY is_primary DESC, created_at ASC, name COLLATE NOCASE ASC",
        )?;
        let rows = statement.query_map([project_id], canvas_from_row)?;
        rows.collect()
    }

    pub fn update_summary(&self, canvas_id: &str, summary: Option<String>) -> Result<Canvas> {
        let now = current_timestamp();
        self.connection.execute(
            "UPDATE canvases
             SET summary = ?1,
                 updated_at = ?2
             WHERE id = ?3",
            params![summary.as_deref(), now, canvas_id],
        )?;
        self.get_by_id(canvas_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete_by_id(&self, canvas_id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM canvases WHERE id = ?1", [canvas_id])?;
        Ok(())
    }
}

impl<'conn> CanvasGraphRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create_note_node(
        &self,
        canvas_id: &str,
        title: &str,
        content: &str,
        position_x: f64,
        position_y: f64,
    ) -> Result<CanvasNodeRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO canvas_nodes (
                id,
                canvas_id,
                type,
                title,
                summary,
                position_x,
                position_y,
                width,
                height,
                content,
                tags,
                created_at,
                updated_at
            ) VALUES (?1, ?2, 'note', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![
                id,
                canvas_id,
                title,
                content,
                position_x,
                position_y,
                240.0_f64,
                160.0_f64,
                content,
                json_array_string(&["note"]),
                now,
            ],
        )?;
        self.get_node_by_id(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_resource_node(
        &self,
        canvas_id: &str,
        title: &str,
        absolute_path: &str,
        relative_path: &str,
        resource_kind: &str,
        mime_type: &str,
        file_fingerprint: &str,
        position_x: f64,
        position_y: f64,
    ) -> Result<CanvasNodeRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO canvas_nodes (
                id,
                canvas_id,
                type,
                title,
                summary,
                position_x,
                position_y,
                width,
                height,
                tags,
                resource_kind,
                absolute_path,
                relative_path,
                mime_type,
                file_fingerprint,
                created_at,
                updated_at
            ) VALUES (?1, ?2, 'resource', ?3, ?4, ?5, ?6, ?7, ?8, '[]', ?9, ?10, ?11, ?12, ?13, ?14, ?14)",
            params![
                id,
                canvas_id,
                title,
                relative_path,
                position_x,
                position_y,
                260.0_f64,
                180.0_f64,
                resource_kind,
                absolute_path,
                relative_path,
                mime_type,
                file_fingerprint,
                now,
            ],
        )?;
        self.get_node_by_id(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn connect_nodes(
        &self,
        canvas_id: &str,
        source_node_id: &str,
        target_node_id: &str,
        relation_kind: &str,
    ) -> Result<CanvasEdgeRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO canvas_edges (
                id,
                canvas_id,
                source_node_id,
                target_node_id,
                relation_kind,
                directionality,
                label,
                note,
                style_json,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'forward', ?6, '', ?7, ?8, ?8)",
            params![
                id,
                canvas_id,
                source_node_id,
                target_node_id,
                relation_kind,
                relation_kind,
                default_edge_style_json(),
                now,
            ],
        )?;
        self.get_edge_by_id(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn update_edge_note(&self, edge_id: &str, note: &str) -> Result<CanvasEdgeRecord> {
        self.connection.execute(
            "UPDATE canvas_edges
             SET note = ?1,
                 updated_at = ?2
             WHERE id = ?3",
            params![note, current_timestamp(), edge_id],
        )?;
        self.get_edge_by_id(edge_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn load_canvas_snapshot(&self, canvas_id: &str) -> Result<CanvasSnapshotRecord> {
        let mut node_statement = self.connection.prepare(
            "SELECT
                id,
                canvas_id,
                type,
                title,
                summary,
                position_x,
                position_y,
                width,
                height,
                content,
                tags,
                resource_kind,
                absolute_path,
                relative_path,
                mime_type,
                file_fingerprint,
                url,
                color,
                child_node_ids,
                target_canvas_id,
                dot_colour,
                bg_colour,
                text_colour,
                thumbnail,
                created_at,
                updated_at
             FROM canvas_nodes
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, title COLLATE NOCASE ASC",
        )?;
        let node_rows = node_statement.query_map([canvas_id], canvas_node_from_row)?;
        let nodes = node_rows.collect::<Result<Vec<_>>>()?;

        let mut edge_statement = self.connection.prepare(
            "SELECT
                id,
                canvas_id,
                source_node_id,
                target_node_id,
                relation_kind,
                directionality,
                label,
                note,
                style_json,
                created_at,
                updated_at
             FROM canvas_edges
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, relation_kind COLLATE NOCASE ASC",
        )?;
        let edge_rows = edge_statement.query_map([canvas_id], canvas_edge_from_row)?;
        let edges = edge_rows.collect::<Result<Vec<_>>>()?;

        Ok(CanvasSnapshotRecord { nodes, edges })
    }

    pub fn get_node_by_id(&self, node_id: &str) -> Result<Option<CanvasNodeRecord>> {
        self.connection
            .query_row(
                "SELECT
                    id,
                    canvas_id,
                    type,
                    title,
                    summary,
                    position_x,
                    position_y,
                    width,
                    height,
                    content,
                    tags,
                    resource_kind,
                    absolute_path,
                    relative_path,
                    mime_type,
                    file_fingerprint,
                    url,
                    color,
                    child_node_ids,
                    target_canvas_id,
                    dot_colour,
                    bg_colour,
                    text_colour,
                    thumbnail,
                    created_at,
                    updated_at
                 FROM canvas_nodes
                 WHERE id = ?1",
                [node_id],
                canvas_node_from_row,
            )
            .optional()
    }

    pub fn update_node_style(
        &self,
        node_id: &str,
        dot_colour: Option<&str>,
        bg_colour: Option<&str>,
        text_colour: Option<&str>,
        thumbnail: Option<&str>,
    ) -> Result<()> {
        let now = current_timestamp();
        self.connection.execute(
            "UPDATE canvas_nodes
             SET dot_colour  = COALESCE(?1, dot_colour),
                 bg_colour   = COALESCE(?2, bg_colour),
                 text_colour = COALESCE(?3, text_colour),
                 thumbnail   = COALESCE(?4, thumbnail),
                 updated_at  = ?5
             WHERE id = ?6",
            params![dot_colour, bg_colour, text_colour, thumbnail, now, node_id],
        )?;
        if self.connection.changes() == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    fn get_edge_by_id(&self, edge_id: &str) -> Result<Option<CanvasEdgeRecord>> {
        self.connection
            .query_row(
                "SELECT
                    id,
                    canvas_id,
                    source_node_id,
                    target_node_id,
                    relation_kind,
                    directionality,
                    label,
                    note,
                    style_json,
                    created_at,
                    updated_at
                 FROM canvas_edges
                 WHERE id = ?1",
                [edge_id],
                canvas_edge_from_row,
            )
            .optional()
    }
}

fn canvas_from_row(row: &rusqlite::Row<'_>) -> Result<Canvas> {
    Ok(Canvas {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        summary: row.get(4)?,
        is_primary: row.get::<_, i64>(5)? != 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn canvas_node_from_row(row: &rusqlite::Row<'_>) -> Result<CanvasNodeRecord> {
    Ok(CanvasNodeRecord {
        id: row.get(0)?,
        canvas_id: row.get(1)?,
        node_type: row.get(2)?,
        title: row.get(3)?,
        summary: row.get(4)?,
        position_x: row.get(5)?,
        position_y: row.get(6)?,
        width: row.get(7)?,
        height: row.get(8)?,
        content: row.get(9)?,
        tags: parse_string_array(row.get::<_, String>(10)?),
        resource_kind: row.get(11)?,
        absolute_path: row.get(12)?,
        relative_path: row.get(13)?,
        mime_type: row.get(14)?,
        file_fingerprint: row.get(15)?,
        url: row.get(16)?,
        color: row.get(17)?,
        child_node_ids: parse_string_array(row.get::<_, String>(18)?),
        target_canvas_id: row.get(19)?,
        dot_colour: row.get(20)?,
        bg_colour: row.get(21)?,
        text_colour: row.get(22)?,
        thumbnail: row.get(23)?,
        created_at: row.get(24)?,
        updated_at: row.get(25)?,
    })
}

fn canvas_edge_from_row(row: &rusqlite::Row<'_>) -> Result<CanvasEdgeRecord> {
    Ok(CanvasEdgeRecord {
        id: row.get(0)?,
        canvas_id: row.get(1)?,
        source_node_id: row.get(2)?,
        target_node_id: row.get(3)?,
        relation_kind: row.get(4)?,
        directionality: row.get(5)?,
        label: row.get(6)?,
        note: row.get(7)?,
        style_json: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn parse_string_array(value: String) -> Vec<String> {
    match serde_json::from_str::<Value>(&value) {
        Ok(Value::Array(items)) => items
            .into_iter()
            .filter_map(|item| item.as_str().map(ToOwned::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

fn json_array_string(values: &[&str]) -> String {
    Value::Array(
        values
            .iter()
            .map(|value| Value::String((*value).to_string()))
            .collect(),
    )
    .to_string()
}

fn default_edge_style_json() -> String {
    serde_json::json!({
        "stroke": "#f0b45a",
        "width": 2,
        "dashed": false
    })
    .to_string()
}
