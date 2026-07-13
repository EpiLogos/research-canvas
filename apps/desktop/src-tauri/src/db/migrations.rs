use std::collections::BTreeSet;

use rusqlite::{Connection, Result};

use super::transaction::TransactionGuard;

pub struct MigrationRunner;

struct Migration {
    version: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: "0001_initial",
        sql: include_str!("../../migrations/0001_initial.sql"),
    },
    Migration {
        version: "0002_search_index",
        sql: include_str!("../../migrations/0002_search_index.sql"),
    },
    Migration {
        version: "0003_project_resource_roots",
        sql: include_str!("../../migrations/0003_project_resource_roots.sql"),
    },
    Migration {
        version: "0004_node_style_fields",
        sql: include_str!("../../migrations/0004_node_style_fields.sql"),
    },
    Migration {
        version: "0005_edge_anchor_fields",
        sql: include_str!("../../migrations/0005_edge_anchor_fields.sql"),
    },
    Migration {
        version: "0006_sequence_redesign",
        sql: include_str!("../../migrations/0006_sequence_redesign.sql"),
    },
    Migration {
        version: "0007_saved_sequences",
        sql: include_str!("../../migrations/0007_saved_sequences.sql"),
    },
    Migration {
        version: "0008_layout_store",
        sql: include_str!("../../migrations/0008_layout_store.sql"),
    },
    Migration {
        version: "0009_agent_activity",
        sql: include_str!("../../migrations/0009_agent_activity.sql"),
    },
    Migration {
        version: "0010_node_document",
        sql: include_str!("../../migrations/0010_node_document.sql"),
    },
    Migration {
        version: "0011_graph_node_metadata",
        sql: include_str!("../../migrations/0011_graph_node_metadata.sql"),
    },
    Migration {
        version: "0012_timeline_layout",
        sql: include_str!("../../migrations/0012_timeline_layout.sql"),
    },
    Migration {
        version: "0013_node_document_reconciliation",
        sql: include_str!("../../migrations/0013_node_document_reconciliation.sql"),
    },
    Migration {
        version: "0014_remove_selection_click_timeline_layouts",
        sql: include_str!("../../migrations/0014_remove_selection_click_timeline_layouts.sql"),
    },
];

impl MigrationRunner {
    pub fn migrate(connection: &Connection) -> Result<()> {
        Self::migrate_selected(connection, MIGRATIONS.len())
    }

    /// Executes the real ordered migration chain through an inclusive version.
    /// This narrow boundary exists so upgrade tests can construct authentic old
    /// databases without copying or approximating historical schemas.
    #[doc(hidden)]
    pub fn migrate_through(connection: &Connection, through_version: &str) -> Result<()> {
        let migration_count = MIGRATIONS
            .iter()
            .position(|migration| migration.version == through_version)
            .map(|index| index + 1)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(through_version.into()))?;
        Self::migrate_selected(connection, migration_count)
    }

    fn migrate_selected(connection: &Connection, migration_count: usize) -> Result<()> {
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;

        let applied_versions = applied_versions(connection)?;
        let transaction = TransactionGuard::begin(connection)?;

        for migration in MIGRATIONS.iter().take(migration_count) {
            if applied_versions.contains(migration.version) {
                continue;
            }

            connection.execute_batch(migration.sql)?;
            connection.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                [migration.version],
            )?;
        }

        transaction.commit()
    }
}

fn applied_versions(connection: &Connection) -> Result<BTreeSet<String>> {
    let mut statement = connection.prepare(
        "SELECT version
         FROM schema_migrations
         ORDER BY version ASC",
    )?;
    let rows = statement.query_map([], |row: &rusqlite::Row<'_>| row.get::<_, String>(0))?;
    let mut versions = BTreeSet::new();
    for row in rows {
        versions.insert(row?);
    }
    Ok(versions)
}
