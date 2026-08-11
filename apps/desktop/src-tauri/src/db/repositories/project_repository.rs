// apps/desktop/src-tauri/src/db/repositories/project_repository.rs
//! Project persistence across SQLite and Neo4j.
//!
//! A project is a first-class row in the `projects` table and a first-class
//! `Project` node in Neo4j. The `ProjectRepository` owns the SQLite side and
//! derives the canonical `project:<slug>` namespace; the `ProjectGraphRepository`
//! scopes every graph query to that namespace.

use chrono::{SecondsFormat, Utc};
use neo4rs::{query, Graph, Node as NeoNode};
use rusqlite::{params, Connection, OptionalExtension, Result as RusqliteResult};
use serde::{Deserialize, Serialize};

use crate::db::{
    connection::Database,
    neo4j::SharedGraph,
    repositories::{Constellation, ConstellationRepository, GraphRepository},
};

/// SQLite representation of a project. Mirrors the Neo4j `Project` node plus
/// the workspace-local active fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub display_name: String,
    pub slug: String,
    pub root_path: String,
    pub root_type: String,
    pub active_constellation_id: Option<String>,
    pub active_profile_scope: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// SQLite project repository.
pub struct ProjectRepository<'conn> {
    connection: &'conn Connection,
}

impl<'conn> ProjectRepository<'conn> {
    pub fn new(connection: &'conn Connection) -> Self {
        Self { connection }
    }

    pub fn create_project(
        &self,
        display_name: String,
        slug: String,
        root_path: String,
        root_type: String,
    ) -> RusqliteResult<ProjectRecord> {
        let constellation_repository = ConstellationRepository::new(self.connection);
        let constellation = constellation_repository.create_project(
            display_name,
            slug.clone(),
            None,
            root_path,
            root_type,
            format!("project:{slug}"),
            None,
            None,
            serde_json::json!({ "includeResources": true, "theme": "paper" }),
        )?;
        self.set_active_project(&constellation.id, constellation.primary_canvas_id.as_deref())
    }

    pub fn get_by_id(&self, project_id: &str) -> RusqliteResult<Option<ProjectRecord>> {
        self.connection
            .query_row(
                "SELECT
                    id,
                    display_name,
                    slug,
                    root_path,
                    root_type,
                    active_constellation_id,
                    active_profile_scope,
                    created_at,
                    updated_at
                 FROM projects
                 WHERE id = ?1",
                [project_id],
                project_from_row,
            )
            .optional()
    }

    pub fn list_projects(&self) -> RusqliteResult<Vec<ProjectRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT
                id,
                display_name,
                slug,
                root_path,
                root_type,
                active_constellation_id,
                active_profile_scope,
                created_at,
                updated_at
             FROM projects
             ORDER BY display_name COLLATE NOCASE ASC, created_at ASC",
        )?;
        let rows = statement.query_map([], project_from_row)?;
        rows.collect()
    }

    pub fn set_active_project(
        &self,
        project_id: &str,
        constellation_id: Option<&str>,
    ) -> RusqliteResult<ProjectRecord> {
        let profile_scope = self.resolve_profile_scope(project_id)?;
        self.connection.execute(
            "UPDATE projects
             SET active_constellation_id = ?1,
                 active_profile_scope = ?2,
                 updated_at = ?3
             WHERE id = ?4",
            params![
                constellation_id,
                profile_scope,
                current_timestamp(),
                project_id,
            ],
        )?;
        self.get_by_id(project_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Resolve the canonical `project:<slug>` namespace for a project id.
    ///
    /// This is the single source of truth for the SQLite profile scope and the
    /// Neo4j namespace; every surface query is routed through it.
    pub fn resolve_profile_scope(&self, project_id: &str) -> RusqliteResult<String> {
        let slug: Option<String> = self.connection.query_row(
            "SELECT slug FROM projects WHERE id = ?1",
            [project_id],
            |row| row.get(0),
        )?;
        let slug = slug.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        if slug.trim().is_empty() {
            return Ok("migration".to_string());
        }
        Ok(format!("project:{slug}"))
    }

    /// Return a graph repository scoped to the project's namespace.
    pub fn graph_repository(
        &self,
        graph: SharedGraph,
        database: String,
        project_id: String,
    ) -> RusqliteResult<ProjectGraphRepository> {
        let scope = self.resolve_profile_scope(&project_id)?;
        Ok(ProjectGraphRepository::new(graph, database, project_id, scope))
    }
}

fn project_from_row(row: &rusqlite::Row<'_>) -> RusqliteResult<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        display_name: row.get(1)?,
        slug: row.get(2)?,
        root_path: row.get(3)?,
        root_type: row.get(4)?,
        active_constellation_id: row.get(5)?,
        active_profile_scope: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Neo4j project repository. Every query is scoped to the project's namespace.
pub struct ProjectGraphRepository {
    graph: SharedGraph,
    database: String,
    project_id: String,
    profile_scope: String,
}

impl ProjectGraphRepository {
    pub fn new(
        graph: SharedGraph,
        database: String,
        project_id: String,
        profile_scope: String,
    ) -> Self {
        Self {
            graph,
            database,
            project_id,
            profile_scope,
        }
    }

    pub async fn ensure_schema(&self) -> Result<(), String> {
        let statements = [
            "CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT project_slug IF NOT EXISTS FOR (p:Project) REQUIRE p.slug IS UNIQUE",
            "CREATE CONSTRAINT constellation_id IF NOT EXISTS FOR (c:Constellation) REQUIRE c.id IS UNIQUE",
            "CREATE INDEX project_scope_index IF NOT EXISTS FOR (n:TheoryNode) ON (n.profile_scope)",
        ];
        for stmt in statements {
            self.graph
                .run_on(&self.database, query(stmt))
                .await
                .map_err(|e| format!("project schema failed on `{stmt}`: {e}"))?;
        }
        Ok(())
    }

    /// Create the `Project` node and its `Constellation` node, linked by
    /// `BELONGS_TO_PROJECT`. Idempotent by project id.
    pub async fn create_project_subgraph(
        &self,
        record: &ProjectRecord,
    ) -> Result<(), String> {
        let cypher = "
            MERGE (p:Project {id: $project_id})
            SET p.slug = $slug,
                p.displayName = $display_name,
                p.rootPath = $root_path,
                p.rootType = $root_type,
                p.createdAt = $created_at,
                p.updatedAt = $updated_at
            WITH p
            MERGE (c:Constellation {id: $constellation_id})
            SET c.slug = $slug,
                c.displayName = $display_name,
                c.rootPath = $root_path,
                c.rootType = $root_type,
                c.createdAt = $created_at,
                c.updatedAt = $updated_at,
                c.profile_scope = $profile_scope
            MERGE (c)-[:BELONGS_TO_PROJECT]->(p)
            RETURN p.id AS project_id
        ";
        let mut result = self
            .graph
            .execute_on(
                &self.database,
                query(cypher)
                    .param("project_id", record.id.clone())
                    .param("constellation_id", record.active_constellation_id.clone().unwrap_or_default())
                    .param("slug", record.slug.clone())
                    .param("display_name", record.display_name.clone())
                    .param("root_path", record.root_path.clone())
                    .param("root_type", record.root_type.clone())
                    .param("created_at", record.created_at.clone())
                    .param("updated_at", record.updated_at.clone())
                    .param("profile_scope", self.profile_scope.clone()),
            )
            .await
            .map_err(|e| format!("create_project_subgraph failed: {e}"))?;
        result
            .next()
            .await
            .map_err(|e| format!("create_project_subgraph result failed: {e}"))?
            .ok_or_else(|| "create_project_subgraph returned no row".to_string())?;
        Ok(())
    }

    /// Count graph nodes visible in this project's namespace.
    ///
    /// This is the canonical proof that graph queries are scoped: nodes without
    /// the project scope are invisible to the repository.
    pub async fn count_scoped_nodes(&self) -> Result<i64, String> {
        let cypher = "
            MATCH (n:TheoryNode)
            WHERE n.profile_scope = $profile_scope
            RETURN count(n) AS total
        ";
        let mut result = self
            .graph
            .execute_on(
                &self.database,
                query(cypher).param("profile_scope", self.profile_scope.clone()),
            )
            .await
            .map_err(|e| format!("count_scoped_nodes failed: {e}"))?;
        let row = result
            .next()
            .await
            .map_err(|e| format!("count_scoped_nodes result failed: {e}"))?
            .ok_or_else(|| "count_scoped_nodes returned no row".to_string())?;
        row.get::<i64>("total")
            .map_err(|e| format!("count_scoped_nodes parse failed: {e}"))
    }

    /// Create a node in this project's namespace. Used by tests and by any
    /// project-scoped write path.
    pub async fn create_scoped_test_node(
        &self,
        graph_node_id: &str,
        title: &str,
    ) -> Result<(), String> {
        let cypher = "
            CREATE (n:TheoryNode {
                graph_node_id: $graph_node_id,
                title: $title,
                body: '[]',
                summary: '',
                profile_scope: $profile_scope,
                createdAt: datetime(),
                updatedAt: datetime()
            })
            RETURN n
        ";
        self.graph
            .run_on(
                &self.database,
                query(cypher)
                    .param("graph_node_id", graph_node_id.to_string())
                    .param("title", title.to_string())
                    .param("profile_scope", self.profile_scope.clone()),
            )
            .await
            .map_err(|e| format!("create_scoped_test_node failed: {e}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::MigrationRunner;
    use std::env;

    fn open_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        MigrationRunner::migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn create_project_sets_active_namespace() {
        let conn = open_test_db();
        let repo = ProjectRepository::new(&conn);
        let project = repo
            .create_project(
                "Alpha Field".to_string(),
                "alpha-field".to_string(),
                "/tmp/alpha-field".to_string(),
                "directory".to_string(),
            )
            .unwrap();

        assert_eq!(project.slug, "alpha-field");
        assert_eq!(project.active_profile_scope.as_deref(), Some("project:alpha-field"));
        assert!(project.active_constellation_id.is_some());
    }

    #[test]
    fn resolve_profile_scope_derives_from_slug() {
        let conn = open_test_db();
        let repo = ProjectRepository::new(&conn);
        let project = repo
            .create_project(
                "Beta Field".to_string(),
                "beta-field".to_string(),
                "/tmp/beta-field".to_string(),
                "directory".to_string(),
            )
            .unwrap();

        let scope = repo.resolve_profile_scope(&project.id).unwrap();
        assert_eq!(scope, "project:beta-field");
    }

    #[test]
    fn set_active_project_switches_scope_and_old_data_not_leaked() {
        let conn = open_test_db();
        let repo = ProjectRepository::new(&conn);
        let alpha = repo
            .create_project(
                "Alpha Field".to_string(),
                "alpha-field".to_string(),
                "/tmp/alpha-field".to_string(),
                "directory".to_string(),
            )
            .unwrap();
        let beta = repo
            .create_project(
                "Beta Field".to_string(),
                "beta-field".to_string(),
                "/tmp/beta-field".to_string(),
                "directory".to_string(),
            )
            .unwrap();

        let active = repo
            .set_active_project(&beta.id, beta.active_constellation_id.as_deref())
            .unwrap();
        assert_eq!(active.active_profile_scope.as_deref(), Some("project:beta-field"));
        assert_eq!(active.active_constellation_id, beta.active_constellation_id);

        // The old project retains its own scope; it is never returned as the
        // active scope of the new project.
        let alpha_scope = repo.resolve_profile_scope(&alpha.id).unwrap();
        assert_eq!(alpha_scope, "project:alpha-field");
        let active_scope = repo.resolve_profile_scope(&active.id).unwrap();
        assert_eq!(active_scope, "project:beta-field");
    }

    /// Neo4j integration test: only runs when a local Neo4j is configured via
    /// the standard environment variables. SQLite scoping is tested above.
    #[tokio::test(flavor = "multi_thread", worker_threads = 1)]
    async fn graph_queries_are_scoped_to_project() {
        let uri = env::var("NEO4J_URI").unwrap_or_default();
        if uri.is_empty() {
            return;
        }
        let user = env::var("NEO4J_USER").unwrap_or_default();
        let password = env::var("NEO4J_PASSWORD").unwrap_or_default();
        let database = env::var("NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string());

        let graph = neo4rs::Graph::connect(
            neo4rs::ConfigBuilder::default()
                .uri(uri)
                .user(user)
                .password(password)
                .db(database.clone())
                .build()
                .unwrap(),
        )
        .await
        .expect("Neo4j connection");
        let graph = std::sync::Arc::new(graph);

        let alpha_repo = ProjectGraphRepository::new(
            graph.clone(),
            database.clone(),
            "alpha-id".to_string(),
            "project:alpha".to_string(),
        );
        let beta_repo = ProjectGraphRepository::new(
            graph.clone(),
            database.clone(),
            "beta-id".to_string(),
            "project:beta".to_string(),
        );

        alpha_repo.ensure_schema().await.unwrap();
        alpha_repo
            .create_project_subgraph(&ProjectRecord {
                id: "alpha-id".to_string(),
                display_name: "Alpha".to_string(),
                slug: "alpha".to_string(),
                root_path: "/tmp/alpha".to_string(),
                root_type: "directory".to_string(),
                active_constellation_id: Some("alpha-canvas".to_string()),
                active_profile_scope: Some("project:alpha".to_string()),
                created_at: current_timestamp(),
                updated_at: current_timestamp(),
            })
            .await
            .unwrap();
        beta_repo
            .create_project_subgraph(&ProjectRecord {
                id: "beta-id".to_string(),
                display_name: "Beta".to_string(),
                slug: "beta".to_string(),
                root_path: "/tmp/beta".to_string(),
                root_type: "directory".to_string(),
                active_constellation_id: Some("beta-canvas".to_string()),
                active_profile_scope: Some("project:beta".to_string()),
                created_at: current_timestamp(),
                updated_at: current_timestamp(),
            })
            .await
            .unwrap();

        alpha_repo
            .create_scoped_test_node("gn-alpha-1", "Alpha Node")
            .await
            .unwrap();
        beta_repo
            .create_scoped_test_node("gn-beta-1", "Beta Node")
            .await
            .unwrap();

        assert_eq!(alpha_repo.count_scoped_nodes().await.unwrap(), 1);
        assert_eq!(beta_repo.count_scoped_nodes().await.unwrap(), 1);
    }
}
