use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub struct SavedSequenceRecord {
    pub id: String,
    pub project_id: String,
    pub canvas_id: String,
    pub name: String,
    pub root_node_id: Option<String>,
    pub edge_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct SavedSequenceRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> SavedSequenceRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create(
        &self,
        project_id: &str,
        canvas_id: &str,
        name: &str,
    ) -> Result<SavedSequenceRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        self.connection.execute(
            "INSERT INTO saved_sequences (id, project_id, canvas_id, name, edge_ids_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, '[]', ?5, ?5)",
            params![id, project_id, canvas_id, name, now],
        )?;
        self.get_by_id(&id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn list_for_canvas(&self, canvas_id: &str) -> Result<Vec<SavedSequenceRecord>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, project_id, canvas_id, name, root_node_id, edge_ids_json, created_at, updated_at
             FROM saved_sequences
             WHERE canvas_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([canvas_id], record_from_row)?;
        rows.collect()
    }

    pub fn get_by_id(&self, id: &str) -> Result<Option<SavedSequenceRecord>> {
        self.connection
            .query_row(
                "SELECT id, project_id, canvas_id, name, root_node_id, edge_ids_json, created_at, updated_at
                 FROM saved_sequences
                 WHERE id = ?1",
                [id],
                record_from_row,
            )
            .optional()
    }

    pub fn update(
        &self,
        id: &str,
        name: &str,
        root_node_id: Option<&str>,
        edge_ids: &[String],
    ) -> Result<SavedSequenceRecord> {
        let now = current_timestamp();
        let edge_ids_json = serde_json::to_string(edge_ids).unwrap_or_else(|_| "[]".to_string());
        self.connection.execute(
            "UPDATE saved_sequences
             SET name = ?1, root_node_id = ?2, edge_ids_json = ?3, updated_at = ?4
             WHERE id = ?5",
            params![name, root_node_id, edge_ids_json, now, id],
        )?;
        self.get_by_id(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        self.connection
            .execute("DELETE FROM saved_sequences WHERE id = ?1", [id])?;
        Ok(())
    }
}

fn record_from_row(row: &rusqlite::Row<'_>) -> Result<SavedSequenceRecord> {
    let edge_ids_json: String = row.get(5)?;
    let edge_ids = match serde_json::from_str::<Value>(&edge_ids_json) {
        Ok(Value::Array(items)) => items
            .into_iter()
            .filter_map(|v| v.as_str().map(ToOwned::to_owned))
            .collect(),
        _ => Vec::new(),
    };

    Ok(SavedSequenceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        canvas_id: row.get(2)?,
        name: row.get(3)?,
        root_node_id: row.get(4)?,
        edge_ids,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
