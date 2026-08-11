use std::{borrow::Cow, collections::BTreeSet};

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
    Migration {
        version: "0015_graph_relationship_projection",
        sql: include_str!("../../migrations/0015_graph_relationship_projection.sql"),
    },
    Migration {
        version: "0016_graph_relationship_structural_vocabulary_repair",
        sql: include_str!(
            "../../migrations/0016_graph_relationship_structural_vocabulary_repair.sql"
        ),
    },
    Migration {
        version: "0017_graph_relationship_tombstones",
        sql: include_str!("../../migrations/0017_graph_relationship_tombstones.sql"),
    },
    Migration {
        version: "0018_canvas_scoped_edge_layout",
        sql: include_str!("../../migrations/0018_canvas_scoped_edge_layout.sql"),
    },
    Migration {
        version: "0019_node_attachments",
        sql: include_str!("../../migrations/0019_node_attachments.sql"),
    },
    Migration {
        version: "0020_node_attachment_presentation",
        sql: include_str!("../../migrations/0020_node_attachment_presentation.sql"),
    },
    Migration {
        version: "0021_node_attachment_presentation_guards",
        sql: include_str!("../../migrations/0021_node_attachment_presentation_guards.sql"),
    },
    Migration {
        version: "0022_node_attachment_presentation_indirect_guards",
        sql: include_str!("../../migrations/0022_node_attachment_presentation_indirect_guards.sql"),
    },
    Migration {
        version: "0023_node_attachment_primary_usage_guards",
        sql: include_str!("../../migrations/0023_node_attachment_primary_usage_guards.sql"),
    },
    Migration {
        version: "0024_node_attachment_primary_roles",
        sql: include_str!("../../migrations/0024_node_attachment_primary_roles.sql"),
    },
    Migration {
        version: "0025_place_temporal",
        sql: include_str!("../../migrations/0025_place_temporal.sql"),
    },
    Migration {
        version: "0026_scenes",
        sql: include_str!("../../migrations/0026_scenes.sql"),
    },
    Migration {
        version: "0027_scene_consent",
        sql: include_str!("../../migrations/0027_scene_consent.sql"),
    },
    Migration {
        version: "0028_street_view",
        sql: include_str!("../../migrations/0028_street_view.sql"),
    },
    Migration {
        version: "0029_palace_curations",
        sql: include_str!("../../migrations/0029_palace_curations.sql"),
    },
    Migration {
        version: "0030_project_profile_scope",
        sql: include_str!("../../migrations/0030_project_profile_scope.sql"),
    },
    Migration {
        version: "0031_geography_edges",
        sql: include_str!("../../migrations/0031_geography_edges.sql"),
    },
    Migration {
        version: "0032_fetch_records",
        sql: include_str!("../../migrations/0032_fetch_records.sql"),
    },
    Migration {
        version: "0033_constellation_encapsulation",
        sql: include_str!("../../migrations/0033_constellation_encapsulation.sql"),
    },
    Migration {
        version: "0035_project_persistence",
        sql: include_str!("../../migrations/0035_project_persistence.sql"),
    },
];

impl MigrationRunner {
    pub const fn migration_count() -> usize {
        MIGRATIONS.len()
    }

    pub fn migrate(connection: &Connection) -> Result<()> {
        Self::migrate_selected(connection, Self::migration_count())
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

            connection.execute_batch(&migration_sql(migration))?;
            connection.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                [migration.version],
            )?;
        }

        transaction.commit()
    }
}

/// 0015 is immutable history. 0016 deliberately consumes the one canonical
/// runtime vocabulary while rebuilding the old local projection, so root
/// seeding, remote writes, and SQLite checks cannot drift apart. 0033 does the
/// same when admitting the one deliberate substrate addition ENCAPSULATES
/// (ticket #27), so an existing workspace's CHECK constraint gains the new
/// relation atomically.
fn migration_sql(migration: &Migration) -> Cow<'static, str> {
    if matches!(
        migration.version,
        "0016_graph_relationship_structural_vocabulary_repair"
            | "0033_constellation_encapsulation"
    ) {
        return Cow::Owned(migration.sql.replace(
            "__RELATIONSHIP_TYPES__",
            &super::repositories::relationship_vocabulary::sqlite_check_values(),
        ));
    }
    Cow::Borrowed(migration.sql)
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
