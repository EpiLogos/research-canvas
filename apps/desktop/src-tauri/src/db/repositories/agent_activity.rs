use rusqlite::{params, Connection, Result};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentActivityRecord {
    pub id: String,
    pub canvas_id: Option<String>,
    pub kind: String,
    pub graph_node_id: Option<String>,
    pub relationship_id: Option<String>,
    pub title: String,
    pub entity_type: Option<String>,
    pub detail_json: String,
    pub reviewed: bool,
    pub placed: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAgentActivity {
    pub kind: String,
    pub canvas_id: Option<String>,
    pub graph_node_id: Option<String>,
    pub relationship_id: Option<String>,
    pub title: String,
    pub entity_type: Option<String>,
    pub detail_json: String,
}

pub struct AgentActivityRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> AgentActivityRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn record(&self, input: &NewAgentActivity) -> Result<AgentActivityRecord> {
        let id = uuid::Uuid::new_v4().to_string();
        self.connection.execute(
            "INSERT INTO agent_activity \
             (id, canvas_id, kind, graph_node_id, relationship_id, title, entity_type, detail_json) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                input.canvas_id,
                input.kind,
                input.graph_node_id,
                input.relationship_id,
                input.title,
                input.entity_type,
                input.detail_json,
            ],
        )?;
        self.get(&id).map(|opt| opt.expect("row just inserted"))
    }

    fn get(&self, id: &str) -> Result<Option<AgentActivityRecord>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, canvas_id, kind, graph_node_id, relationship_id, title, \
             entity_type, detail_json, reviewed, placed, created_at \
             FROM agent_activity WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![id], Self::map_row)?;
        match rows.next() {
            Some(r) => Ok(Some(r?)),
            None => Ok(None),
        }
    }

    pub fn list_recent(&self, limit: i64) -> Result<Vec<AgentActivityRecord>> {
        let mut stmt = self.connection.prepare(
            "SELECT id, canvas_id, kind, graph_node_id, relationship_id, title, \
             entity_type, detail_json, reviewed, placed, created_at \
             FROM agent_activity ORDER BY created_at DESC, rowid DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], Self::map_row)?;
        rows.collect()
    }

    pub fn mark_reviewed(&self, id: &str) -> Result<()> {
        self.connection.execute(
            "UPDATE agent_activity SET reviewed = 1 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn mark_placed(&self, graph_node_id: &str) -> Result<()> {
        self.connection.execute(
            "UPDATE agent_activity SET placed = 1 WHERE graph_node_id = ?1",
            params![graph_node_id],
        )?;
        Ok(())
    }

    fn map_row(row: &rusqlite::Row<'_>) -> Result<AgentActivityRecord> {
        Ok(AgentActivityRecord {
            id: row.get(0)?,
            canvas_id: row.get(1)?,
            kind: row.get(2)?,
            graph_node_id: row.get(3)?,
            relationship_id: row.get(4)?,
            title: row.get(5)?,
            entity_type: row.get(6)?,
            detail_json: row.get(7)?,
            reviewed: row.get::<_, i64>(8)? != 0,
            placed: row.get::<_, i64>(9)? != 0,
            created_at: row.get(10)?,
        })
    }
}
