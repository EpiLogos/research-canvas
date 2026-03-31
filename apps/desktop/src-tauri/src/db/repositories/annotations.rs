use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, Result};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq)]
pub struct AnnotationRecord {
    pub id: String,
    pub canvas_id: String,
    pub annotation_type: String,
    pub points_json: String,
    pub style_color: String,
    pub style_width: f64,
    pub style_opacity: f64,
    pub text: Option<String>,
    pub bounds_x: f64,
    pub bounds_y: f64,
    pub bounds_width: f64,
    pub bounds_height: f64,
    pub created_at: String,
    pub updated_at: String,
}

pub struct AnnotationRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> AnnotationRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create_freehand_annotation(
        &self,
        canvas_id: &str,
        annotation_type: &str,
        points: Value,
        style_color: &str,
        style_width: f64,
        style_opacity: f64,
        text: Option<String>,
    ) -> Result<AnnotationRecord> {
        let id = Uuid::new_v4().to_string();
        let now = current_timestamp();
        let bounds = bounds_from_points(&points);
        let points_json = points.to_string();

        self.connection.execute(
            "INSERT INTO canvas_annotations (
                id,
                canvas_id,
                annotation_type,
                points_json,
                style_color,
                style_width,
                style_opacity,
                text,
                bounds_x,
                bounds_y,
                bounds_width,
                bounds_height,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
            params![
                id,
                canvas_id,
                annotation_type,
                points_json,
                style_color,
                style_width,
                style_opacity,
                text.as_deref(),
                bounds.0,
                bounds.1,
                bounds.2,
                bounds.3,
                now,
            ],
        )?;

        Ok(AnnotationRecord {
            id,
            canvas_id: canvas_id.to_string(),
            annotation_type: annotation_type.to_string(),
            points_json,
            style_color: style_color.to_string(),
            style_width,
            style_opacity,
            text,
            bounds_x: bounds.0,
            bounds_y: bounds.1,
            bounds_width: bounds.2,
            bounds_height: bounds.3,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn list_for_canvas(&self, canvas_id: &str) -> Result<Vec<AnnotationRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                canvas_id,
                annotation_type,
                points_json,
                style_color,
                style_width,
                style_opacity,
                text,
                bounds_x,
                bounds_y,
                bounds_width,
                bounds_height,
                created_at,
                updated_at
             FROM canvas_annotations
             WHERE canvas_id = ?1
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map([canvas_id], annotation_from_row)?;
        rows.collect()
    }
}

fn annotation_from_row(row: &rusqlite::Row<'_>) -> Result<AnnotationRecord> {
    Ok(AnnotationRecord {
        id: row.get(0)?,
        canvas_id: row.get(1)?,
        annotation_type: row.get(2)?,
        points_json: row.get(3)?,
        style_color: row.get(4)?,
        style_width: row.get(5)?,
        style_opacity: row.get(6)?,
        text: row.get(7)?,
        bounds_x: row.get(8)?,
        bounds_y: row.get(9)?,
        bounds_width: row.get(10)?,
        bounds_height: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn bounds_from_points(points: &Value) -> (f64, f64, f64, f64) {
    let Some(items) = points.as_array() else {
        return (0.0, 0.0, 1.0, 1.0);
    };

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for item in items {
        let Some(x) = item.get("x").and_then(Value::as_f64) else {
            continue;
        };
        let Some(y) = item.get("y").and_then(Value::as_f64) else {
            continue;
        };
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }

    if !min_x.is_finite() || !min_y.is_finite() || !max_x.is_finite() || !max_y.is_finite() {
        return (0.0, 0.0, 1.0, 1.0);
    }

    (
        min_x,
        min_y,
        (max_x - min_x).max(1.0),
        (max_y - min_y).max(1.0),
    )
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
