use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNodeDocument {
    pub graph_node_id: String,
    pub body: String,
    pub summary: String,
    pub neo4j_synced: bool,
}

pub struct NodeDocumentRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> NodeDocumentRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn get_node_document(&self, graph_node_id: &str) -> Result<Option<LocalNodeDocument>> {
        self.connection
            .query_row(
                "SELECT graph_node_id, body, summary, neo4j_synced
                 FROM node_document
                 WHERE graph_node_id = ?1",
                params![graph_node_id],
                node_document_from_row,
            )
            .optional()
    }

    pub fn upsert_node_document(
        &self,
        graph_node_id: &str,
        body: &str,
        summary: &str,
        neo4j_synced: bool,
    ) -> Result<()> {
        self.connection.execute(
            "INSERT INTO node_document (graph_node_id, body, summary, updated_at, neo4j_synced)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, ?4)
             ON CONFLICT(graph_node_id) DO UPDATE SET
                body         = excluded.body,
                summary      = excluded.summary,
                updated_at   = excluded.updated_at,
                neo4j_synced = excluded.neo4j_synced",
            params![graph_node_id, body, summary, neo4j_synced as i64],
        )?;
        Ok(())
    }
}

fn node_document_from_row(row: &rusqlite::Row<'_>) -> Result<LocalNodeDocument> {
    Ok(LocalNodeDocument {
        graph_node_id: row.get(0)?,
        body: row.get(1)?,
        summary: row.get(2)?,
        neo4j_synced: row.get::<_, i64>(3)? != 0,
    })
}
