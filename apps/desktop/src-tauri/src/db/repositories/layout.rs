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
