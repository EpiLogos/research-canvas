use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppTabRecord {
    pub id: String,
    pub surface_id: String,
    pub title: String,
    #[serde(default)]
    pub pinned: bool,
    pub state: serde_json::Value,
}

pub struct AppTabRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> AppTabRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn load_tabs(&self) -> Result<Vec<AppTabRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT tab_id, surface_id, title, pinned, state_json
             FROM app_tabs
             ORDER BY sort_order ASC, tab_id ASC",
        )?;
        let rows = statement.query_map([], tab_from_row)?;
        rows.collect()
    }

    pub fn load_active_tab_id(&self) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        self.connection
            .query_row(
                "SELECT tab_id FROM app_active_tab WHERE singleton = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
    }

    pub fn save_tabs(
        &self,
        tabs: &[AppTabRecord],
        active_tab_id: Option<&str>,
        now: &str,
    ) -> Result<()> {
        self.connection.execute("DELETE FROM app_tabs", [])?;

        for (index, tab) in tabs.iter().enumerate() {
            let state_json = serde_json::to_string(&tab.state)
                .unwrap_or_else(|_| "{}".to_string());
            let pinned = if tab.pinned { 1 } else { 0 };
            self.connection.execute(
                "INSERT INTO app_tabs (
                    tab_id, surface_id, title, pinned, state_json, sort_order, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    tab.id,
                    tab.surface_id,
                    tab.title,
                    pinned,
                    state_json,
                    index as i64,
                    now,
                ],
            )?;
        }

        self.connection.execute(
            "INSERT INTO app_active_tab (singleton, tab_id, updated_at) VALUES (1, ?1, ?2)
             ON CONFLICT(singleton) DO UPDATE SET
                tab_id = excluded.tab_id,
                updated_at = excluded.updated_at",
            params![active_tab_id.unwrap_or(""), now],
        )?;

        Ok(())
    }
}

fn tab_from_row(row: &rusqlite::Row<'_>) -> Result<AppTabRecord> {
    let pinned_i: i64 = row.get(3)?;
    let state_json: String = row.get(4)?;
    let state =
        serde_json::from_str(&state_json).unwrap_or(serde_json::Value::Object(Default::default()));
    Ok(AppTabRecord {
        id: row.get(0)?,
        surface_id: row.get(1)?,
        title: row.get(2)?,
        pinned: pinned_i != 0,
        state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::Database, migrations::MigrationRunner};
    use serde_json::json;

    fn test_record(id: &str, surface_id: &str) -> AppTabRecord {
        AppTabRecord {
            id: id.to_string(),
            surface_id: surface_id.to_string(),
            title: id.to_string(),
            pinned: surface_id == "canvas",
            state: json!({ "surfaceId": surface_id }),
        }
    }

    #[test]
    fn save_and_load_round_trip() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("tabs.sqlite");
        let db = Database::open(&db_path).unwrap();
        MigrationRunner::migrate(db.connection()).unwrap();
        let repo = AppTabRepository::new(db.connection());

        let tabs = vec![
            test_record("tab-1", "projects"),
            test_record("tab-2", "canvas"),
        ];
        repo.save_tabs(&tabs, Some("tab-2"), "2026-08-12T00:00:00Z")
            .unwrap();

        let loaded = repo.load_tabs().unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "tab-1");
        assert_eq!(loaded[1].surface_id, "canvas");
        assert!(loaded[1].pinned);

        let active = repo.load_active_tab_id().unwrap();
        assert_eq!(active, Some("tab-2".to_string()));
    }

    #[test]
    fn save_overwrites_previous_tabs() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("tabs.sqlite");
        let db = Database::open(&db_path).unwrap();
        MigrationRunner::migrate(db.connection()).unwrap();
        let repo = AppTabRepository::new(db.connection());

        repo.save_tabs(
            &[test_record("a", "story"), test_record("b", "palace")],
            Some("a"),
            "2026-08-12T00:00:00Z",
        )
        .unwrap();
        repo.save_tabs(&[test_record("c", "places")], Some("c"), "2026-08-12T00:01:00Z")
            .unwrap();

        let loaded = repo.load_tabs().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "c");
    }
}
