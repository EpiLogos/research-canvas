use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::error::{RepositoryError, RepositoryResult};

const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq)]
pub struct TimelineLayoutRecord {
    pub graph_node_id: String,
    pub lane: String,
    pub offset_y: f64,
    pub width: f64,
    pub height: f64,
    pub style_json: Value,
    pub layout_revision: i64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimelineLayoutMutation {
    Created,
    Updated,
    Preserved,
    Conflict {
        current_revision: i64,
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

    pub fn get(&self, graph_node_id: &str) -> RepositoryResult<Option<TimelineLayoutRecord>> {
        self.connection
            .query_row(
                "SELECT graph_node_id, lane, offset_y, width, height, style_json,
                        layout_revision, created_at, updated_at
                 FROM timeline_layout WHERE graph_node_id=?1",
                [graph_node_id],
                timeline_layout_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list(&self) -> RepositoryResult<Vec<TimelineLayoutRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT graph_node_id, lane, offset_y, width, height, style_json,
                    layout_revision, created_at, updated_at
             FROM timeline_layout ORDER BY lane, graph_node_id",
        )?;
        let rows = statement.query_map([], timeline_layout_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn save(
        &self,
        incoming: &TimelineLayoutRecord,
        expected_revision: Option<i64>,
    ) -> RepositoryResult<TimelineLayoutMutation> {
        validate_layout(incoming)?;
        if let Some(revision) = expected_revision {
            validate_revision(revision)?;
        }
        let style = serde_json::to_string(&incoming.style_json)
            .map_err(|error| RepositoryError::Validation(error.to_string()))?;
        let Some(current) = self.get(&incoming.graph_node_id)? else {
            if let Some(expected_revision) = expected_revision {
                return Ok(TimelineLayoutMutation::Conflict {
                    current_revision: 0,
                    reason: format!(
                        "timeline layout does not exist at expected revision {expected_revision}"
                    ),
                });
            }
            let affected = self.connection.execute(
                "INSERT INTO timeline_layout(graph_node_id,lane,offset_y,width,height,style_json)
                 VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(graph_node_id) DO NOTHING",
                params![
                    incoming.graph_node_id,
                    incoming.lane,
                    incoming.offset_y,
                    incoming.width,
                    incoming.height,
                    style
                ],
            )?;
            if affected == 1 {
                return Ok(TimelineLayoutMutation::Created);
            }
            let current_revision = self
                .get(&incoming.graph_node_id)?
                .map(|record| record.layout_revision)
                .unwrap_or(0);
            return Ok(TimelineLayoutMutation::Conflict {
                current_revision,
                reason: "timeline layout was concurrently created".into(),
            });
        };
        let same_presentation = current.lane == incoming.lane
            && current.offset_y == incoming.offset_y
            && current.width == incoming.width
            && current.height == incoming.height
            && current.style_json == incoming.style_json;
        if same_presentation {
            return Ok(TimelineLayoutMutation::Preserved);
        }
        if expected_revision != Some(current.layout_revision) {
            return Ok(TimelineLayoutMutation::Conflict {
                current_revision: current.layout_revision,
                reason: "expected layout revision does not match persisted layout".into(),
            });
        }
        let affected = self.connection.execute(
            "UPDATE timeline_layout SET lane=?2,offset_y=?3,width=?4,height=?5,style_json=?6,
             layout_revision=layout_revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE graph_node_id=?1 AND layout_revision=?7 AND layout_revision < 9007199254740991",
            params![
                incoming.graph_node_id,
                incoming.lane,
                incoming.offset_y,
                incoming.width,
                incoming.height,
                style,
                current.layout_revision
            ],
        )?;
        if affected == 1 {
            return Ok(TimelineLayoutMutation::Updated);
        }
        let latest_revision = self
            .get(&incoming.graph_node_id)?
            .map(|record| record.layout_revision)
            .unwrap_or(current.layout_revision);
        Ok(TimelineLayoutMutation::Conflict {
            current_revision: latest_revision,
            reason: "layout changed during optimistic update".into(),
        })
    }
}

fn timeline_layout_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TimelineLayoutRecord> {
    let style: String = row.get(5)?;
    let style_json: Value = serde_json::from_str(&style).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(error))
    })?;
    if !style_json.is_object() {
        return Err(rusqlite::Error::FromSqlConversionFailure(
            5,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "timeline style JSON must be an object",
            )),
        ));
    }
    Ok(TimelineLayoutRecord {
        graph_node_id: row.get(0)?,
        lane: row.get(1)?,
        offset_y: row.get(2)?,
        width: row.get(3)?,
        height: row.get(4)?,
        style_json,
        layout_revision: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn validate_layout(layout: &TimelineLayoutRecord) -> RepositoryResult<()> {
    if layout.lane.trim().is_empty()
        || !layout.offset_y.is_finite()
        || !layout.width.is_finite()
        || !layout.height.is_finite()
        || layout.width <= 0.0
        || layout.height <= 0.0
        || !layout.style_json.is_object()
    {
        return Err(RepositoryError::Validation(
            "timeline layout requires a lane and finite, positive dimensions".into(),
        ));
    }
    validate_revision(layout.layout_revision)
}

fn validate_revision(revision: i64) -> RepositoryResult<()> {
    if !(0..=MAX_SAFE_INTEGER).contains(&revision) {
        return Err(RepositoryError::Validation(
            "layout revision must be a JavaScript-safe non-negative integer".into(),
        ));
    }
    Ok(())
}
