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
];

impl MigrationRunner {
    pub fn migrate(connection: &Connection) -> Result<()> {
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY NOT NULL,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );",
        )?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;

        let applied_versions = applied_versions(connection)?;
        let transaction = TransactionGuard::begin(connection)?;

        for migration in MIGRATIONS {
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
