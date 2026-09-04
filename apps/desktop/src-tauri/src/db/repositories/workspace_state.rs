use rusqlite::{params, Connection, OptionalExtension, Result};

pub struct WorkspaceStateRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> WorkspaceStateRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn load_active_project_id(&self) -> Result<Option<String>> {
        self.connection
            .query_row(
                "SELECT active_project_id FROM workspace_state WHERE singleton = 1",
                [],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map(Option::flatten)
    }

    pub fn save_active_project_id(&self, project_id: &str, now: &str) -> Result<()> {
        self.connection.execute(
            "INSERT INTO workspace_state (singleton, active_project_id, updated_at)
             VALUES (1, ?1, ?2)
             ON CONFLICT(singleton) DO UPDATE SET
                active_project_id = excluded.active_project_id,
                updated_at = excluded.updated_at",
            params![project_id, now],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::Database, repositories::ConstellationRepository};

    fn create_project(db: &Database, display_name: &str, slug: &str) -> String {
        let repo = ConstellationRepository::new(db.connection());
        repo.create_project(
            display_name.to_string(),
            slug.to_string(),
            None,
            format!("/tmp/{slug}"),
            "directory".to_string(),
            format!("project:{slug}"),
            None,
            None,
            serde_json::json!({ "includeResources": true, "theme": "paper" }),
        )
        .unwrap()
        .id
    }

    #[test]
    fn active_project_round_trips_and_overwrites() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db = Database::open(temp_dir.path().join("workspace.sqlite")).unwrap();
        let alpha_id = create_project(&db, "Alpha", "alpha");
        let beta_id = create_project(&db, "Beta", "beta");
        let state = WorkspaceStateRepository::new(db.connection());

        assert_eq!(state.load_active_project_id().unwrap(), None);
        state
            .save_active_project_id(&alpha_id, "2026-09-02T00:00:00Z")
            .unwrap();
        assert_eq!(
            state.load_active_project_id().unwrap(),
            Some(alpha_id.clone())
        );

        state
            .save_active_project_id(&beta_id, "2026-09-02T00:01:00Z")
            .unwrap();
        assert_eq!(state.load_active_project_id().unwrap(), Some(beta_id));
    }
}
