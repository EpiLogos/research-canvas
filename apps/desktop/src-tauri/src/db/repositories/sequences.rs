use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, Result};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SequenceRecord {
    pub id: String,
    pub project_id: String,
    pub canvas_id: String,
    pub name: String,
    pub kind: String,
    pub description: String,
    pub published: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SequenceStepRecord {
    pub id: String,
    pub sequence_id: String,
    pub position: i64,
    pub target_type: String,
    pub target_id: String,
    pub caption: String,
    pub viewport_json: String,
    pub transition_hint: String,
    pub created_at: String,
}

pub struct SequenceRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> SequenceRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create_sequence(
        &self,
        project_id: &str,
        canvas_id: &str,
        name: &str,
        kind: &str,
        description: Option<String>,
        published: bool,
    ) -> Result<SequenceRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        let description = description.unwrap_or_default();

        self.connection.execute(
            "INSERT INTO sequences (
                id,
                project_id,
                canvas_id,
                name,
                kind,
                description,
                published,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![
                id,
                project_id,
                canvas_id,
                name,
                kind,
                description,
                published as i64,
                now
            ],
        )?;

        Ok(SequenceRecord {
            id,
            project_id: project_id.to_string(),
            canvas_id: canvas_id.to_string(),
            name: name.to_string(),
            kind: kind.to_string(),
            description,
            published,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn add_step(
        &self,
        sequence_id: &str,
        target_type: &str,
        target_id: &str,
        caption: &str,
        viewport: Value,
        transition_hint: Option<String>,
    ) -> Result<SequenceStepRecord> {
        let id = Uuid::new_v4().to_string();
        let position = self.next_position(sequence_id)?;
        let created_at = current_timestamp();
        let transition_hint = transition_hint.unwrap_or_else(|| "ease".to_string());
        let viewport_json = viewport.to_string();

        self.connection.execute(
            "INSERT INTO sequence_steps (
                id,
                sequence_id,
                position,
                target_type,
                target_id,
                caption,
                viewport_json,
                transition_hint,
                created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                sequence_id,
                position,
                target_type,
                target_id,
                caption,
                viewport_json,
                transition_hint,
                created_at,
            ],
        )?;

        Ok(SequenceStepRecord {
            id,
            sequence_id: sequence_id.to_string(),
            position,
            target_type: target_type.to_string(),
            target_id: target_id.to_string(),
            caption: caption.to_string(),
            viewport_json,
            transition_hint,
            created_at,
        })
    }

    pub fn list_for_canvas(&self, canvas_id: &str) -> Result<Vec<SequenceRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                project_id,
                canvas_id,
                name,
                kind,
                description,
                published,
                created_at,
                updated_at
             FROM sequences
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, name COLLATE NOCASE ASC",
        )?;
        let rows = statement.query_map([canvas_id], sequence_from_row)?;
        rows.collect()
    }

    pub fn list_steps(&self, sequence_id: &str) -> Result<Vec<SequenceStepRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                sequence_id,
                position,
                target_type,
                target_id,
                caption,
                viewport_json,
                transition_hint,
                created_at
             FROM sequence_steps
             WHERE sequence_id = ?1
             ORDER BY position ASC, created_at ASC",
        )?;
        let rows = statement.query_map([sequence_id], sequence_step_from_row)?;
        rows.collect()
    }

    fn next_position(&self, sequence_id: &str) -> Result<i64> {
        self.connection.query_row(
            "SELECT COALESCE(MAX(position) + 1, 0)
             FROM sequence_steps
             WHERE sequence_id = ?1",
            [sequence_id],
            |row| row.get(0),
        )
    }
}

fn sequence_from_row(row: &rusqlite::Row<'_>) -> Result<SequenceRecord> {
    Ok(SequenceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        canvas_id: row.get(2)?,
        name: row.get(3)?,
        kind: row.get(4)?,
        description: row.get(5)?,
        published: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn sequence_step_from_row(row: &rusqlite::Row<'_>) -> Result<SequenceStepRecord> {
    Ok(SequenceStepRecord {
        id: row.get(0)?,
        sequence_id: row.get(1)?,
        position: row.get(2)?,
        target_type: row.get(3)?,
        target_id: row.get(4)?,
        caption: row.get(5)?,
        viewport_json: row.get(6)?,
        transition_hint: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
