use rusqlite::{params, Connection, OptionalExtension, Result};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct TimelineLayoutRecord {
    pub graph_node_id: String,
    pub lane: String,
    pub offset_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: Value,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimelineLayoutMutation {
    Created,
    Updated,
    Preserved,
    Conflict {
        current_token: String,
        reason: String,
    },
}

pub struct TimelineLayoutRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> TimelineLayoutRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, graph_node_id: &str) -> Result<Option<TimelineLayoutRecord>> {
        self.connection.query_row(
            "SELECT graph_node_id, lane, offset_y, width, height, style_json, created_at, updated_at
             FROM timeline_layout WHERE graph_node_id=?1", [graph_node_id], |row| {
                let style: String = row.get(5)?;
                Ok(TimelineLayoutRecord { graph_node_id: row.get(0)?, lane: row.get(1)?, offset_y: row.get(2)?,
                    width: row.get(3)?, height: row.get(4)?, style_json: serde_json::from_str(&style).map_err(|e|
                        rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(e)))?,
                    created_at: row.get(6)?, updated_at: row.get(7)? })
             }).optional()
    }

    pub fn save(
        &self,
        incoming: &TimelineLayoutRecord,
        expected_token: Option<&str>,
    ) -> Result<TimelineLayoutMutation> {
        validate_layout(incoming)?;
        let style = serde_json::to_string(&incoming.style_json)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let Some(current) = self.get(&incoming.graph_node_id)? else {
            self.connection.execute(
                "INSERT INTO timeline_layout(graph_node_id,lane,offset_y,width,height,style_json) VALUES (?1,?2,?3,?4,?5,?6)",
                params![incoming.graph_node_id, incoming.lane, incoming.offset_y, incoming.width, incoming.height, style])?;
            return Ok(TimelineLayoutMutation::Created);
        };
        let same_presentation = current.lane == incoming.lane
            && current.offset_y == incoming.offset_y
            && current.width == incoming.width
            && current.height == incoming.height
            && current.style_json == incoming.style_json;
        if same_presentation {
            return Ok(TimelineLayoutMutation::Preserved);
        }
        let current_token = current.updated_at.unwrap_or_default();
        if expected_token != Some(current_token.as_str()) {
            return Ok(TimelineLayoutMutation::Conflict {
                current_token,
                reason: "expected layout token does not match persisted layout".into(),
            });
        }
        let next_token = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true);
        let affected = self.connection.execute(
            "UPDATE timeline_layout SET lane=?2,offset_y=?3,width=?4,height=?5,style_json=?6,
             updated_at=?8 WHERE graph_node_id=?1 AND updated_at=?7",
            params![
                incoming.graph_node_id,
                incoming.lane,
                incoming.offset_y,
                incoming.width,
                incoming.height,
                style,
                current_token,
                next_token
            ],
        )?;
        if affected != 1 {
            return Ok(TimelineLayoutMutation::Conflict {
                current_token,
                reason: "layout changed during optimistic update".into(),
            });
        }
        Ok(TimelineLayoutMutation::Updated)
    }
}

fn validate_layout(layout: &TimelineLayoutRecord) -> Result<()> {
    if layout.lane.trim().is_empty()
        || !layout.offset_y.is_finite()
        || !layout.width.is_finite()
        || !layout.height.is_finite()
        || layout.width <= 0.0
        || layout.height <= 0.0
    {
        return Err(rusqlite::Error::InvalidParameterName(
            "timeline layout requires a lane and finite, positive dimensions".into(),
        ));
    }
    Ok(())
}
