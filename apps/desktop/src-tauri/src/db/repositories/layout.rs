use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeLayoutRecord {
    pub graph_node_id: String,
    pub canvas_id: String,
    pub position_x: f64,
    pub position_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeLayoutRecord {
    pub id: String,
    pub canvas_id: String,
    pub source_graph_node_id: String,
    pub target_graph_node_id: String,
    pub relation_kind: String,
    pub source_handle_id: Option<String>,
    pub target_handle_id: Option<String>,
    pub style_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasAppStateRecord {
    pub canvas_id: String,
    pub viewport_json: String,
    pub app_state_json: String,
    pub updated_at: String,
}

pub struct LayoutRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> LayoutRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn list_node_layout(&self, canvas_id: &str) -> Result<Vec<NodeLayoutRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT graph_node_id, canvas_id, position_x, position_y, width, height,
                    style_json, created_at, updated_at
             FROM node_layout
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, graph_node_id ASC",
        )?;
        let rows = statement.query_map([canvas_id], node_layout_from_row)?;
        rows.collect()
    }

    pub fn upsert_node_layout(&self, record: &NodeLayoutRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO node_layout (
                graph_node_id, canvas_id, position_x, position_y, width, height,
                style_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(canvas_id, graph_node_id) DO UPDATE SET
                position_x = excluded.position_x,
                position_y = excluded.position_y,
                width      = excluded.width,
                height     = excluded.height,
                style_json = excluded.style_json,
                updated_at = excluded.updated_at",
            params![
                record.graph_node_id,
                record.canvas_id,
                record.position_x,
                record.position_y,
                record.width,
                record.height,
                record.style_json,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_node_layout(&self, canvas_id: &str, graph_node_id: &str) -> Result<()> {
        self.connection.execute(
            "DELETE FROM node_layout WHERE canvas_id = ?1 AND graph_node_id = ?2",
            params![canvas_id, graph_node_id],
        )?;
        Ok(())
    }

    pub fn list_edge_layout(&self, canvas_id: &str) -> Result<Vec<EdgeLayoutRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
                    source_handle_id, target_handle_id, style_json, created_at, updated_at
             FROM edge_layout
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map([canvas_id], edge_layout_from_row)?;
        rows.collect()
    }

    pub fn upsert_edge_layout(&self, record: &EdgeLayoutRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO edge_layout (
                id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
                source_handle_id, target_handle_id, style_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                canvas_id            = excluded.canvas_id,
                source_graph_node_id = excluded.source_graph_node_id,
                target_graph_node_id = excluded.target_graph_node_id,
                relation_kind        = excluded.relation_kind,
                source_handle_id     = excluded.source_handle_id,
                target_handle_id     = excluded.target_handle_id,
                style_json           = excluded.style_json,
                updated_at           = excluded.updated_at",
            params![
                record.id,
                record.canvas_id,
                record.source_graph_node_id,
                record.target_graph_node_id,
                record.relation_kind,
                record.source_handle_id,
                record.target_handle_id,
                record.style_json,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_edge_layout(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM edge_layout WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_app_state(&self, canvas_id: &str) -> Result<Option<CanvasAppStateRecord>> {
        use rusqlite::OptionalExtension;
        self.connection
            .query_row(
                "SELECT canvas_id, viewport_json, app_state_json, updated_at
                 FROM canvas_app_state
                 WHERE canvas_id = ?1",
                [canvas_id],
                app_state_from_row,
            )
            .optional()
    }

    pub fn upsert_app_state(&self, record: &CanvasAppStateRecord) -> Result<()> {
        self.connection.execute(
            "INSERT INTO canvas_app_state (canvas_id, viewport_json, app_state_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(canvas_id) DO UPDATE SET
                viewport_json  = excluded.viewport_json,
                app_state_json = excluded.app_state_json,
                updated_at     = excluded.updated_at",
            params![
                record.canvas_id,
                record.viewport_json,
                record.app_state_json,
                record.updated_at,
            ],
        )?;
        Ok(())
    }
}

fn node_layout_from_row(row: &rusqlite::Row<'_>) -> Result<NodeLayoutRecord> {
    Ok(NodeLayoutRecord {
        graph_node_id: row.get(0)?,
        canvas_id: row.get(1)?,
        position_x: row.get(2)?,
        position_y: row.get(3)?,
        width: row.get(4)?,
        height: row.get(5)?,
        style_json: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn edge_layout_from_row(row: &rusqlite::Row<'_>) -> Result<EdgeLayoutRecord> {
    Ok(EdgeLayoutRecord {
        id: row.get(0)?,
        canvas_id: row.get(1)?,
        source_graph_node_id: row.get(2)?,
        target_graph_node_id: row.get(3)?,
        relation_kind: row.get(4)?,
        source_handle_id: row.get(5)?,
        target_handle_id: row.get(6)?,
        style_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn app_state_from_row(row: &rusqlite::Row<'_>) -> Result<CanvasAppStateRecord> {
    Ok(CanvasAppStateRecord {
        canvas_id: row.get(0)?,
        viewport_json: row.get(1)?,
        app_state_json: row.get(2)?,
        updated_at: row.get(3)?,
    })
}
