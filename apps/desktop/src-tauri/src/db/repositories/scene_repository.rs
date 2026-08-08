use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::error::{RepositoryError, RepositoryResult};

/// Who assembled the scene: agents propose candidate scenes from graph
/// structure and passages; humans curate them (vision §3.15).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SceneAssembler {
    Agent,
    Human,
}

impl SceneAssembler {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Agent => "agent",
            Self::Human => "human",
        }
    }
}

impl TryFrom<String> for SceneAssembler {
    type Error = RepositoryError;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        match value.as_str() {
            "agent" => Ok(Self::Agent),
            "human" => Ok(Self::Human),
            other => Err(RepositoryError::Validation(format!(
                "unknown scene assembler: {other}"
            ))),
        }
    }
}

/// `Scene.placeFrame = { placeId, validAt }` (locked by ticket #9): the
/// validAt union is `{ instant }` or `{ start, end }`, inside the scene's
/// time window. The storage boundary re-validates the shape so a malformed
/// payload can never persist.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePlaceFrame {
    pub place_id: String,
    pub valid_at: Value,
}

impl ScenePlaceFrame {
    pub fn new(place_id: impl Into<String>, valid_at: Value) -> RepositoryResult<Self> {
        let frame = Self {
            place_id: place_id.into(),
            valid_at,
        };
        frame.validate()?;
        Ok(frame)
    }

    fn validate(&self) -> RepositoryResult<()> {
        if self.place_id.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "place frame placeId must not be blank".into(),
            ));
        }
        let valid_at = self
            .valid_at
            .as_object()
            .ok_or_else(|| RepositoryError::Validation("place frame validAt must be an object".into()))?;
        let has_instant = valid_at.contains_key("instant");
        let has_interval =
            valid_at.contains_key("start") && valid_at.contains_key("end");
        if !(has_instant ^ has_interval) {
            return Err(RepositoryError::Validation(
                "place frame validAt must be exactly { instant } or { start, end }".into(),
            ));
        }
        for key in ["instant", "start", "end"] {
            if let Some(value) = valid_at.get(key) {
                if !value.is_string() {
                    return Err(RepositoryError::Validation(format!(
                        "place frame validAt.{key} must be an ISO temporal bound"
                    )));
                }
            }
        }
        Ok(())
    }
}

/// A scene's time window; instants are allowed (start === end).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneTimeWindow {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneRecord {
    pub id: String,
    pub profile_scope: String,
    pub place_frame: ScenePlaceFrame,
    pub time_window: SceneTimeWindow,
    pub people: Vec<Value>,
    pub passages: Vec<Value>,
    pub language_variants: Vec<Value>,
    pub title: Option<String>,
    pub narration: Option<String>,
    pub assembled_by: SceneAssembler,
    pub curation_events: Vec<Value>,
    pub nested_sequence_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneSequenceRecord {
    pub id: String,
    pub profile_scope: String,
    pub name: Option<String>,
    pub scene_ids: Vec<String>,
    pub sub_timeline_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct SceneRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> SceneRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    fn validate_scene(scene: &SceneRecord) -> RepositoryResult<()> {
        if scene.profile_scope.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "scene profileScope must not be blank".into(),
            ));
        }
        scene.place_frame.validate()?;
        if scene.time_window.start.is_empty() || scene.time_window.end.is_empty() {
            return Err(RepositoryError::Validation(
                "scene time window bounds must not be blank".into(),
            ));
        }
        for (name, values) in [
            ("people", &scene.people),
            ("passages", &scene.passages),
            ("languageVariants", &scene.language_variants),
            ("curationEvents", &scene.curation_events),
        ] {
            if values.iter().any(|value| !value.is_object()) {
                return Err(RepositoryError::Validation(format!(
                    "scene {name} entries must be JSON objects"
                )));
            }
        }
        for sequence_id in &scene.nested_sequence_ids {
            if sequence_id.trim().is_empty() {
                return Err(RepositoryError::Validation(
                    "scene nestedSequenceIds entries must not be blank".into(),
                ));
            }
        }
        Ok(())
    }

    pub fn create(&self, mut scene: SceneRecord) -> RepositoryResult<SceneRecord> {
        Self::validate_scene(&scene)?;
        if scene.id.trim().is_empty() {
            scene.id = Uuid::new_v4().to_string();
        }
        let now = current_timestamp();
        scene.created_at.clone_from(&now);
        scene.updated_at.clone_from(&now);
        self.connection.execute(
            "INSERT INTO scenes (
             id, profile_scope, place_frame_json, time_window_json, people_json,
             passages_json, language_variants_json, title, narration, assembled_by,
             curation_events_json, nested_sequence_ids_json, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![
                scene.id,
                scene.profile_scope,
                serde_json::to_string(&scene.place_frame)
                    .map_err(validation_error)?,
                serde_json::to_string(&scene.time_window)
                    .map_err(validation_error)?,
                serde_json::to_string(&scene.people).map_err(validation_error)?,
                serde_json::to_string(&scene.passages).map_err(validation_error)?,
                serde_json::to_string(&scene.language_variants)
                    .map_err(validation_error)?,
                scene.title,
                scene.narration,
                scene.assembled_by.as_str(),
                serde_json::to_string(&scene.curation_events)
                    .map_err(validation_error)?,
                serde_json::to_string(&scene.nested_sequence_ids)
                    .map_err(validation_error)?,
                scene.created_at,
                scene.updated_at,
            ],
        )?;
        self.get_by_id(&scene.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_by_id(&self, id: &str) -> RepositoryResult<Option<SceneRecord>> {
        self.connection
            .query_row(
                "SELECT id, profile_scope, place_frame_json, time_window_json, people_json,
                 passages_json, language_variants_json, title, narration, assembled_by,
                 curation_events_json, nested_sequence_ids_json, created_at, updated_at
                 FROM scenes WHERE id = ?1",
                [id],
                scene_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_for_profile(&self, profile_scope: &str) -> RepositoryResult<Vec<SceneRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, profile_scope, place_frame_json, time_window_json, people_json,
             passages_json, language_variants_json, title, narration, assembled_by,
             curation_events_json, nested_sequence_ids_json, created_at, updated_at
             FROM scenes WHERE profile_scope = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([profile_scope], scene_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update(&self, scene: &SceneRecord) -> RepositoryResult<SceneRecord> {
        Self::validate_scene(scene)?;
        let now = current_timestamp();
        let affected = self.connection.execute(
            "UPDATE scenes SET profile_scope=?2, place_frame_json=?3, time_window_json=?4,
             people_json=?5, passages_json=?6, language_variants_json=?7, title=?8,
             narration=?9, assembled_by=?10, curation_events_json=?11,
             nested_sequence_ids_json=?12, updated_at=?13 WHERE id=?1",
            params![
                scene.id,
                scene.profile_scope,
                serde_json::to_string(&scene.place_frame)
                    .map_err(validation_error)?,
                serde_json::to_string(&scene.time_window)
                    .map_err(validation_error)?,
                serde_json::to_string(&scene.people).map_err(validation_error)?,
                serde_json::to_string(&scene.passages).map_err(validation_error)?,
                serde_json::to_string(&scene.language_variants)
                    .map_err(validation_error)?,
                scene.title,
                scene.narration,
                scene.assembled_by.as_str(),
                serde_json::to_string(&scene.curation_events)
                    .map_err(validation_error)?,
                serde_json::to_string(&scene.nested_sequence_ids)
                    .map_err(validation_error)?,
                now,
            ],
        )?;
        if affected == 0 {
            return Err(RepositoryError::Conflict(format!(
                "scene {} does not exist",
                scene.id
            )));
        }
        self.get_by_id(&scene.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn delete(&self, id: &str) -> RepositoryResult<bool> {
        let affected = self
            .connection
            .execute("DELETE FROM scenes WHERE id = ?1", [id])?;
        Ok(affected == 1)
    }

    pub fn create_sequence(
        &self,
        mut sequence: SceneSequenceRecord,
    ) -> RepositoryResult<SceneSequenceRecord> {
        Self::validate_sequence(&sequence)?;
        if sequence.id.trim().is_empty() {
            sequence.id = Uuid::new_v4().to_string();
        }
        let now = current_timestamp();
        sequence.created_at.clone_from(&now);
        sequence.updated_at.clone_from(&now);
        self.connection.execute(
            "INSERT INTO scene_sequences (
             id, profile_scope, name, scene_ids_json, sub_timeline_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                sequence.id,
                sequence.profile_scope,
                sequence.name,
                serde_json::to_string(&sequence.scene_ids)
                    .map_err(validation_error)?,
                sequence.sub_timeline_id,
                sequence.created_at,
                sequence.updated_at,
            ],
        )?;
        self.get_sequence_by_id(&sequence.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn get_sequence_by_id(
        &self,
        id: &str,
    ) -> RepositoryResult<Option<SceneSequenceRecord>> {
        self.connection
            .query_row(
                "SELECT id, profile_scope, name, scene_ids_json, sub_timeline_id, created_at, updated_at
                 FROM scene_sequences WHERE id = ?1",
                [id],
                sequence_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_sequences_for_profile(
        &self,
        profile_scope: &str,
    ) -> RepositoryResult<Vec<SceneSequenceRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, profile_scope, name, scene_ids_json, sub_timeline_id, created_at, updated_at
             FROM scene_sequences WHERE profile_scope = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([profile_scope], sequence_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_sequence(
        &self,
        sequence: &SceneSequenceRecord,
    ) -> RepositoryResult<SceneSequenceRecord> {
        Self::validate_sequence(sequence)?;
        let affected = self.connection.execute(
            "UPDATE scene_sequences SET profile_scope=?2, name=?3, scene_ids_json=?4,
             sub_timeline_id=?5, updated_at=?6 WHERE id=?1",
            params![
                sequence.id,
                sequence.profile_scope,
                sequence.name,
                serde_json::to_string(&sequence.scene_ids)
                    .map_err(validation_error)?,
                sequence.sub_timeline_id,
                current_timestamp(),
            ],
        )?;
        if affected == 0 {
            return Err(RepositoryError::Conflict(format!(
                "scene sequence {} does not exist",
                sequence.id
            )));
        }
        self.get_sequence_by_id(&sequence.id)?
            .ok_or_else(|| RepositoryError::Storage(rusqlite::Error::QueryReturnedNoRows))
    }

    pub fn delete_sequence(&self, id: &str) -> RepositoryResult<bool> {
        let affected = self
            .connection
            .execute("DELETE FROM scene_sequences WHERE id = ?1", [id])?;
        Ok(affected == 1)
    }

    fn validate_sequence(sequence: &SceneSequenceRecord) -> RepositoryResult<()> {
        if sequence.profile_scope.trim().is_empty() {
            return Err(RepositoryError::Validation(
                "scene sequence profileScope must not be blank".into(),
            ));
        }
        let mut seen = std::collections::HashSet::new();
        for scene_id in &sequence.scene_ids {
            if scene_id.trim().is_empty() {
                return Err(RepositoryError::Validation(
                    "scene sequence sceneIds entries must not be blank".into(),
                ));
            }
            if !seen.insert(scene_id.as_str()) {
                return Err(RepositoryError::Validation(format!(
                    "scene sequence contains duplicate scene {scene_id}"
                )));
            }
        }
        Ok(())
    }
}

fn validation_error(error: serde_json::Error) -> RepositoryError {
    RepositoryError::Validation(error.to_string())
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn scene_from_row(row: &Row<'_>) -> SqlResult<SceneRecord> {
    let place_frame: String = row.get(2)?;
    let time_window: String = row.get(3)?;
    let people: String = row.get(4)?;
    let passages: String = row.get(5)?;
    let language_variants: String = row.get(6)?;
    let curation_events: String = row.get(10)?;
    let nested_sequence_ids: String = row.get(11)?;
    Ok(SceneRecord {
        id: row.get(0)?,
        profile_scope: row.get(1)?,
        place_frame: serde_json::from_str(&place_frame).map_err(json_decode)?,
        time_window: serde_json::from_str(&time_window).map_err(json_decode)?,
        people: serde_json::from_str(&people).map_err(json_decode)?,
        passages: serde_json::from_str(&passages).map_err(json_decode)?,
        language_variants: serde_json::from_str(&language_variants)
            .map_err(json_decode)?,
        title: row.get(7)?,
        narration: row.get(8)?,
        assembled_by: SceneAssembler::try_from(row.get::<_, String>(9)?)
            .map_err(|error| rusqlite::Error::FromSqlConversionFailure(
                9,
                rusqlite::types::Type::Text,
                Box::new(error),
            ))?,
        curation_events: serde_json::from_str(&curation_events).map_err(json_decode)?,
        nested_sequence_ids: serde_json::from_str(&nested_sequence_ids)
            .map_err(json_decode)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn sequence_from_row(row: &Row<'_>) -> SqlResult<SceneSequenceRecord> {
    let scene_ids: String = row.get(3)?;
    Ok(SceneSequenceRecord {
        id: row.get(0)?,
        profile_scope: row.get(1)?,
        name: row.get(2)?,
        scene_ids: serde_json::from_str(&scene_ids).map_err(json_decode)?,
        sub_timeline_id: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn json_decode(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(error),
    )
}
