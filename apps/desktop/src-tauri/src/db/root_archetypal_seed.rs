use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

use crate::db::repositories::{
    canvas::CanvasRepository,
    graph::{EntityType, GraphRepository, SeedGraphNode, TemporalPrecision},
    graph_metadata::{
        GraphMetadataMutation, GraphNodeMetadataRecord, GraphNodeMetadataRepository, SyncState,
    },
    layout::{LayoutRepository, NodeLayoutRecord},
    ConstellationRepository, DocumentContentInput, DocumentReconciliationItem,
    NodeDocumentMutation, NodeDocumentRepository,
};
use crate::db::transaction::TransactionGuard;

#[derive(Debug, Clone)]
pub struct RootArchetypalConstellationReport {
    pub constellation_id: String,
    pub constellation_slug: String,
    pub canvas_id: String,
    pub layouts_written: usize,
}

#[derive(Debug, Clone)]
pub struct RootArchetypalSeedReport {
    pub constellation_id: String,
    pub constellation_slug: String,
    pub canvas_id: String,
    pub nodes_written: usize,
    pub relationships_written: usize,
    pub layouts_written: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RootArchetypalLocalProjectionReport {
    pub constellation_id: String,
    pub canvas_id: String,
    pub nodes_projected: usize,
    pub documents_projected: usize,
    pub pending_syncs: usize,
    pub layouts_written: usize,
}

#[derive(Clone)]
struct NodeSeed {
    slug: &'static str,
    entity_type: &'static str,
    title: &'static str,
    summary: &'static str,
    coordinate: Option<&'static str>,
    source_coordinates: &'static [&'static str],
    evidence_tags: &'static [&'static str],
    source_kind: Option<&'static str>,
    is_temporal: bool,
    valid_from: Option<&'static str>,
    valid_to: Option<&'static str>,
    temporal_precision: Option<&'static str>,
}

#[derive(Clone)]
struct RelSeed {
    source: &'static str,
    rel_type: &'static str,
    target: &'static str,
    dominance: Option<&'static str>,
    evidence_tags: &'static [&'static str],
}

#[derive(Clone)]
struct ConstellationSeed {
    slug: &'static str,
    canvas_name: &'static str,
    canvas_summary: &'static str,
    constellation_kind: &'static str,
    members: &'static [&'static str],
    root_x: f64,
    root_y: f64,
}

const ROOT_CONSTELLATION_SLUG: &str = "root-archetypal-field";
const ROOT_CONSTELLATION_TITLE: &str = "Root Archetypal Field";
const ROOT_CONSTELLATION_SUMMARY: &str = "A real ontology-backed canvas for the bounded QL units, archetypal images, animal quaternity, conceptual operations, historical forms, and claim provenance extracted from the Antichrist research vault.";
const RESONANCE_SOURCE: &str = "antichrist-vault/episodes/episode-1-2-archetypal-resonance.md";
const SELF_IDENTITY_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/self-identity.md";
const ONTOLOGICAL_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/unit-ontological.md";
const SOLAR_SYSTEM_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/unit-solar-system.md";
const SOCIAL_POWER_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/unit-social-power.md";
const DEFICIENCY_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/unit-deficiency.md";
const DEVIL_CHAIN_SOURCE: &str =
    "antichrist-vault/episodes/1/ql-units/unit-spectral-devils-chain.md";
const CHRIST_CHAIN_SOURCE: &str =
    "antichrist-vault/episodes/1/ql-units/unit-spectral-christs-chain.md";
const DOUBLE_HELIX_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/double-helix.md";
const POSITION_0_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/position-0.md";
const POSITION_1_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/position-1.md";
const POSITION_2_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/position-2.md";
const POSITION_3_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/position-3.md";
const POSITION_4_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/position-4.md";
const POSITION_5_SOURCE: &str = "antichrist-vault/episodes/1/ql-units/position-5.md";
const TIMELINE_SOURCE: &str =
    "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/episode-2-research-timeline.md";
const TECHNOLOGICAL_OCCULTATION_SOURCE: &str =
    "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/Research/Report6.md";

pub async fn seed_root_archetypal_field(
    graph_repo: &GraphRepository,
    connection: &Connection,
    root_path: &str,
    namespace: &str,
) -> Result<RootArchetypalSeedReport, String> {
    let layout_report = ensure_root_archetypal_constellation_layout(
        connection,
        root_path,
        LayoutWriteMode::Upsert,
    )?;
    let nodes = node_seeds();
    for seed in &nodes {
        graph_repo
            .upsert_seed_node(&seed.to_graph_node(namespace))
            .await?;
    }

    let relationships = relationship_seeds();
    for rel in &relationships {
        let properties = relationship_properties(rel);
        graph_repo
            .merge_seed_relationship(
                &graph_id(namespace, rel.source),
                &graph_id(namespace, rel.target),
                rel.rel_type,
                &format!("{namespace}:{}:{}:{}", rel.source, rel.rel_type, rel.target),
                properties,
            )
            .await?;
    }

    Ok(RootArchetypalSeedReport {
        constellation_id: layout_report.constellation_id,
        constellation_slug: layout_report.constellation_slug,
        canvas_id: layout_report.canvas_id,
        nodes_written: nodes.len(),
        relationships_written: relationships.len(),
        layouts_written: layout_report.layouts_written,
    })
}

pub fn ensure_root_archetypal_constellation_workspace(
    connection: &Connection,
    root_path: &str,
) -> Result<RootArchetypalConstellationReport, String> {
    ensure_root_archetypal_constellation_layout(
        connection,
        root_path,
        LayoutWriteMode::PreserveExisting,
    )
}

/// Materializes the complete canonical graph/document projection in SQLite.
/// Neo4j is deliberately not opened here: every unsynchronised row remains a
/// durable, fully typed pending item for the independent remote sync boundary.
pub fn ensure_root_archetypal_local_projection(
    connection: &Connection,
    root_path: &str,
    namespace: &str,
) -> Result<RootArchetypalLocalProjectionReport, String> {
    let transaction = TransactionGuard::begin(connection).map_err(|error| error.to_string())?;
    let layout = ensure_root_archetypal_constellation_layout_in_existing_transaction(
        connection,
        root_path,
        LayoutWriteMode::PreserveExisting,
    )?;
    let seeds = node_seeds()
        .iter()
        .map(|seed| seed.to_graph_node(namespace))
        .collect::<Vec<_>>();
    let mut documents = root_archetypal_document_inputs(namespace);

    // Preserve a prior exact remote acknowledgement. Bootstrap is not a sync
    // attempt and must not turn an already-synced document back into pending.
    let document_repo = NodeDocumentRepository::new(connection);
    for incoming in &mut documents {
        if let Some(current) = document_repo
            .get_node_document(&incoming.graph_node_id)
            .map_err(|error| error.to_string())?
        {
            let same_content = current.body == incoming.body
                && current.summary == incoming.summary
                && current.content_origin == incoming.content_origin
                && current.content_revision == incoming.content_revision
                && current.body_source_coordinates == incoming.body_source_coordinates;
            if same_content {
                incoming.neo4j_synced = current.neo4j_synced;
            }
        }
    }
    let mut items = documents
        .into_iter()
        .map(|document| {
            let expected_revision = document_repo
                .get_node_document(&document.graph_node_id)
                .map_err(|error| error.to_string())?
                .and_then(|current| {
                    (document.content_revision > current.content_revision)
                        .then_some(current.content_revision)
                });
            Ok(DocumentReconciliationItem {
                document,
                expected_revision,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let metadata_repo = GraphNodeMetadataRepository::new(connection);
    for seed in &seeds {
        let mut metadata = metadata_record(seed)?;
        let document = NodeDocumentRepository::new(connection)
            .get_node_document(&seed.graph_node_id)
            .map_err(|error| error.to_string())?;
        let current_metadata = metadata_repo
            .get(&seed.graph_node_id)
            .map_err(|error| error.to_string())?;
        if let (Some(document), Some(current_metadata)) = (&document, &current_metadata) {
            let document_sync_state = if document.neo4j_synced {
                SyncState::Synced
            } else {
                SyncState::Pending
            };
            if document.content_origin != current_metadata.content_origin
                || document.content_revision != current_metadata.content_revision
                || document.body_source_coordinates != current_metadata.body_source_coordinates
                || document_sync_state != current_metadata.sync_state
                || (current_metadata.sync_state == SyncState::Synced
                    && current_metadata.remote_revision != Some(current_metadata.content_revision))
            {
                return Err(format!(
                    "local document and graph metadata projection diverged for {}",
                    seed.graph_node_id
                ));
            }
        }
        if document.is_none() {
            if let Some(current_metadata) = &current_metadata {
                if current_metadata.content_origin != metadata.content_origin
                    || current_metadata.content_revision != metadata.content_revision
                    || current_metadata.body_source_coordinates != metadata.body_source_coordinates
                    || !matches!(
                        current_metadata.sync_state,
                        SyncState::Pending | SyncState::Synced
                    )
                    || (current_metadata.sync_state == SyncState::Synced
                        && current_metadata.remote_revision
                            != Some(current_metadata.content_revision))
                {
                    return Err(format!(
                        "metadata-only projection is incompatible with canonical seed document for {}",
                        seed.graph_node_id
                    ));
                }
                let item = items
                    .iter_mut()
                    .find(|item| item.document.graph_node_id == seed.graph_node_id)
                    .expect("every seed has one document reconciliation item");
                item.document.neo4j_synced = current_metadata.sync_state == SyncState::Synced;
            }
        }
        // A document may pre-date the graph metadata migration. Repair that
        // one-sided legacy state from the authoritative document without
        // transferring its ownership or revision back to the seed.
        if current_metadata.is_none() {
            if let Some(document) = document {
                metadata.content_origin = document.content_origin;
                metadata.content_revision = document.content_revision;
                metadata.body_source_coordinates = document.body_source_coordinates;
                metadata.sync_state = if document.neo4j_synced {
                    SyncState::Synced
                } else {
                    SyncState::Pending
                };
                metadata.remote_revision =
                    document.neo4j_synced.then_some(document.content_revision);
            }
        }
        if matches!(
            metadata_repo
                .ensure_seed_projection(&metadata)
                .map_err(|error| error.to_string())?,
            GraphMetadataMutation::Conflict { .. }
        ) {
            return Err(format!(
                "canonical graph metadata projection conflicted for {}",
                seed.graph_node_id
            ));
        }
    }
    let decisions = NodeDocumentRepository::new(connection)
        .apply_bulk_in_existing_transaction(&items)
        .map_err(|error| error.to_string())?;
    if let Some(conflict) = decisions
        .iter()
        .find(|decision| matches!(decision.mutation, NodeDocumentMutation::Conflict { .. }))
    {
        return Err(format!(
            "canonical document projection conflicted for {}",
            conflict.graph_node_id
        ));
    }
    for seed in &seeds {
        let document = NodeDocumentRepository::new(connection)
            .get_node_document(&seed.graph_node_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| {
                format!(
                    "missing local document postcondition for {}",
                    seed.graph_node_id
                )
            })?;
        let metadata = metadata_repo
            .get(&seed.graph_node_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| {
                format!(
                    "missing graph metadata postcondition for {}",
                    seed.graph_node_id
                )
            })?;
        let expected_sync_state = if document.neo4j_synced {
            SyncState::Synced
        } else {
            SyncState::Pending
        };
        if document.content_origin != metadata.content_origin
            || document.content_revision != metadata.content_revision
            || document.body_source_coordinates != metadata.body_source_coordinates
            || expected_sync_state != metadata.sync_state
            || (metadata.sync_state == SyncState::Synced
                && metadata.remote_revision != Some(metadata.content_revision))
        {
            return Err(format!(
                "local document and graph metadata postcondition failed for {}",
                seed.graph_node_id
            ));
        }
    }
    let pending_syncs = NodeDocumentRepository::new(connection)
        .list_pending_syncs()
        .map_err(|error| error.to_string())?
        .len();
    transaction.commit().map_err(|error| error.to_string())?;

    Ok(RootArchetypalLocalProjectionReport {
        constellation_id: layout.constellation_id,
        canvas_id: layout.canvas_id,
        nodes_projected: seeds.len(),
        documents_projected: items.len(),
        pending_syncs,
        layouts_written: layout.layouts_written,
    })
}

fn metadata_record(seed: &SeedGraphNode) -> Result<GraphNodeMetadataRecord, String> {
    Ok(GraphNodeMetadataRecord {
        graph_node_id: seed.graph_node_id.clone(),
        entity_type: EntityType::try_from(seed.entity_type.clone())?,
        title: seed.title.clone(),
        archetypal_resonance: seed.archetypal_resonance.clone(),
        coordinate: seed.coordinate.clone(),
        source_coordinates: seed.source_coordinates.clone(),
        evidence_tags: seed.evidence_tags.clone(),
        source_kind: seed.source_kind.clone(),
        content_origin: seed.content_origin,
        content_revision: seed.content_revision,
        seed_schema_version: Some(seed.seed_schema_version),
        body_source_coordinates: seed.body_source_coordinates.clone(),
        historicity: seed.historicity,
        claim_kind: seed.claim_kind,
        evidence_status: seed.evidence_status,
        temporal_role: seed.temporal_role,
        place_coverage: seed.place_coverage,
        ql_form: seed.ql_form,
        ql_unit_id: seed.ql_unit_id.clone(),
        ql_arc: seed.ql_arc,
        ql_topology: seed.ql_topology,
        ql_schema_version: seed.ql_schema_version,
        ql_source_coordinates: seed.ql_source_coordinates.clone(),
        ql_completeness_status: seed.ql_completeness_status,
        is_temporal: seed.is_temporal,
        valid_from: seed.valid_from.clone(),
        valid_to: seed.valid_to.clone(),
        temporal_precision: seed
            .temporal_precision
            .clone()
            .map(TemporalPrecision::try_from)
            .transpose()?,
        schema_version: 1,
        sync_state: SyncState::Pending,
        remote_revision: None,
    })
}

impl NodeSeed {
    fn to_document_input(&self, namespace: &str) -> DocumentContentInput {
        DocumentContentInput {
            graph_node_id: graph_id(namespace, self.slug),
            body: body_for(self.title, self.summary, self.evidence_tags),
            summary: self.summary.to_string(),
            content_origin: crate::db::repositories::graph::ContentOrigin::Seed,
            content_revision: 1,
            body_source_coordinates: self
                .source_coordinates
                .iter()
                .map(|value| value.to_string())
                .collect(),
            neo4j_synced: false,
        }
    }

    fn to_graph_node(&self, namespace: &str) -> SeedGraphNode {
        let source_coordinates = self
            .source_coordinates
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        let is_claim = self.entity_type == "Claim";
        let is_interpretive = self.evidence_tags.contains(&"interpretive_vector");
        SeedGraphNode {
            graph_node_id: graph_id(namespace, self.slug),
            entity_type: self.entity_type.to_string(),
            title: self.title.to_string(),
            body: body_for(self.title, self.summary, self.evidence_tags),
            summary: self.summary.to_string(),
            archetypal_resonance: Some(self.summary.to_string()),
            coordinate: self.coordinate.map(str::to_string),
            source_coordinates: source_coordinates.clone(),
            evidence_tags: self.evidence_tags.iter().map(|s| s.to_string()).collect(),
            source_kind: self.source_kind.map(str::to_string),
            content_origin: crate::db::repositories::graph::ContentOrigin::Seed,
            content_revision: 1,
            seed_schema_version: 1,
            body_source_coordinates: source_coordinates,
            historicity: match self.entity_type {
                "Event" | "Figure" | "People" | "Institution" | "Place" => {
                    Some(crate::db::repositories::graph::Historicity::Historical)
                }
                "Claim" => Some(crate::db::repositories::graph::Historicity::Mixed),
                "Myth" => Some(crate::db::repositories::graph::Historicity::Mythic),
                "Interpretation" | "Archetype" | "Dynamic" | "Constellation" => {
                    Some(crate::db::repositories::graph::Historicity::Theoretical)
                }
                _ => None,
            },
            claim_kind: if is_claim {
                Some(if is_interpretive {
                    crate::db::repositories::graph::ClaimKind::Interpretation
                } else {
                    crate::db::repositories::graph::ClaimKind::Allegation
                })
            } else {
                None
            },
            evidence_status: if self.evidence_tags.contains(&"documented") {
                Some(crate::db::repositories::graph::EvidenceStatus::Documented)
            } else if self.evidence_tags.contains(&"contested") {
                Some(crate::db::repositories::graph::EvidenceStatus::Contested)
            } else if is_interpretive {
                Some(crate::db::repositories::graph::EvidenceStatus::Interpretive)
            } else {
                None
            },
            temporal_role: if self.is_temporal {
                Some(if is_claim {
                    crate::db::repositories::graph::TemporalRole::ClaimAboutTime
                } else {
                    crate::db::repositories::graph::TemporalRole::OccurredAt
                })
            } else {
                None
            },
            place_coverage: Some(if self.is_temporal {
                crate::db::repositories::graph::PlaceCoverage::Unknown
            } else {
                crate::db::repositories::graph::PlaceCoverage::NotApplicable
            }),
            ql_form: None,
            ql_unit_id: None,
            ql_arc: None,
            ql_topology: None,
            ql_schema_version: None,
            ql_source_coordinates: Vec::new(),
            ql_completeness_status: None,
            is_temporal: self.is_temporal,
            valid_from: self.valid_from.map(str::to_string),
            valid_to: self.valid_to.map(str::to_string),
            temporal_precision: self.temporal_precision.map(str::to_string),
        }
    }
}

/// Plannable local-document side of the root seed. Task 6 may dry-run these
/// inputs before applying them; merely constructing this list performs no IO.
pub fn root_archetypal_document_inputs(namespace: &str) -> Vec<DocumentContentInput> {
    node_seeds()
        .iter()
        .map(|seed| seed.to_document_input(namespace))
        .collect()
}

#[derive(Debug, Clone, Copy)]
enum LayoutWriteMode {
    PreserveExisting,
    Upsert,
}

fn ensure_root_archetypal_constellation_layout(
    connection: &Connection,
    root_path: &str,
    layout_mode: LayoutWriteMode,
) -> Result<RootArchetypalConstellationReport, String> {
    ensure_root_archetypal_constellation_layout_with_transaction(
        connection,
        root_path,
        layout_mode,
        false,
    )
}

fn ensure_root_archetypal_constellation_layout_in_existing_transaction(
    connection: &Connection,
    root_path: &str,
    layout_mode: LayoutWriteMode,
) -> Result<RootArchetypalConstellationReport, String> {
    ensure_root_archetypal_constellation_layout_with_transaction(
        connection,
        root_path,
        layout_mode,
        true,
    )
}

fn ensure_root_archetypal_constellation_layout_with_transaction(
    connection: &Connection,
    root_path: &str,
    layout_mode: LayoutWriteMode,
    transaction_owned_by_caller: bool,
) -> Result<RootArchetypalConstellationReport, String> {
    let (constellation_id, canvas_id) =
        ensure_root_constellation(connection, root_path, transaction_owned_by_caller)?;
    let constellations = constellation_seeds();
    let constellation_canvas_ids = ensure_constellation_canvases(
        connection,
        &constellation_id,
        root_path,
        &constellations,
    )?;
    let nodes = node_seeds();
    let layouts = layout_records(
        ROOT_CONSTELLATION_SLUG,
        &canvas_id,
        &nodes,
        &constellations,
        &constellation_canvas_ids,
    );
    let layouts_written = write_layout_records(connection, &layouts, layout_mode)?;

    Ok(RootArchetypalConstellationReport {
        constellation_id,
        constellation_slug: ROOT_CONSTELLATION_SLUG.to_string(),
        canvas_id,
        layouts_written,
    })
}

fn ensure_root_constellation(
    connection: &Connection,
    root_path: &str,
    transaction_owned_by_caller: bool,
) -> Result<(String, String), String> {
    if let Some((constellation_id, canvas_id)) = connection
        .query_row(
            "SELECT id, primary_canvas_id FROM projects WHERE slug = ?1",
            [ROOT_CONSTELLATION_SLUG],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .and_then(|(constellation_id, canvas_id)| {
            canvas_id.map(|canvas_id| (constellation_id, canvas_id))
        })
    {
        return Ok((constellation_id, canvas_id));
    }

    let repository = ConstellationRepository::new(connection);
    let create = |repository: &ConstellationRepository<'_>| {
        if transaction_owned_by_caller {
            repository.create_in_existing_transaction(
                ROOT_CONSTELLATION_TITLE.to_string(),
                ROOT_CONSTELLATION_SLUG.to_string(),
                None,
                root_path.to_string(),
                Some(ROOT_CONSTELLATION_SUMMARY.to_string()),
                None,
                serde_json::json!({ "includeResources": true, "theme": "dark" }),
            )
        } else {
            repository.create(
                ROOT_CONSTELLATION_TITLE.to_string(),
                ROOT_CONSTELLATION_SLUG.to_string(),
                None,
                root_path.to_string(),
                Some(ROOT_CONSTELLATION_SUMMARY.to_string()),
                None,
                serde_json::json!({ "includeResources": true, "theme": "dark" }),
            )
        }
    };
    let constellation = create(&repository).map_err(|e| e.to_string())?;
    let canvas_id = constellation
        .primary_canvas_id
        .clone()
        .ok_or_else(|| "root archetypal constellation missing primary canvas".to_string())?;
    connection
        .execute(
            "UPDATE canvases SET name = ?1, summary = ?2 WHERE id = ?3",
            params![
                "Archetypal Field",
                "Canvas projection of the root archetypal ontology.",
                canvas_id
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok((constellation.id, canvas_id))
}

fn ensure_constellation_canvases(
    connection: &Connection,
    root_constellation_id: &str,
    root_path: &str,
    constellations: &[ConstellationSeed],
) -> Result<HashMap<&'static str, String>, String> {
    let canvas_repo = CanvasRepository::new(connection);
    let mut out = HashMap::with_capacity(constellations.len());
    for seed in constellations {
        let legacy_canvas_id = connection
            .query_row(
                "SELECT id FROM canvases WHERE project_id = ?1 AND kind = ?2",
                params![root_constellation_id, constellation_canvas_kind(seed.slug)],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let child = connection
            .query_row(
                "SELECT id, parent_project_id, primary_canvas_id FROM projects WHERE slug = ?1",
                [seed.slug],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let (child_constellation_id, generated_primary_canvas_id) = match child {
            Some((id, parent_id, primary_canvas_id)) => {
                if parent_id.as_deref() != Some(root_constellation_id) {
                    return Err(format!(
                        "seeded constellation slug `{}` belongs to a different parent",
                        seed.slug,
                    ));
                }
                let primary_canvas_id = primary_canvas_id.ok_or_else(|| {
                    format!("seeded constellation `{}` has no primary canvas", seed.slug)
                })?;
                (id, primary_canvas_id)
            }
            None => {
                let child = ConstellationRepository::new(connection)
                    .create_in_existing_transaction(
                        seed.canvas_name.to_string(),
                        seed.slug.to_string(),
                        Some(root_constellation_id.to_string()),
                        root_path.to_string(),
                        Some(seed.canvas_summary.to_string()),
                        None,
                        serde_json::json!({
                            "includeResources": true,
                            "constellationKind": seed.constellation_kind,
                            "theme": "dark",
                        }),
                    )
                    .map_err(|error| error.to_string())?;
                let primary_canvas_id = child.primary_canvas_id.ok_or_else(|| {
                    format!("created constellation `{}` has no primary canvas", seed.slug)
                })?;
                (child.id, primary_canvas_id)
            }
        };

        let canvas_id = if let Some(legacy_canvas_id) = legacy_canvas_id {
            // Earlier seed versions created target canvases under the root
            // constellation only. Preserve those layouts by promoting the
            // existing canvas to the new child's primary canvas, rather than
            // creating another empty surface and stranding user placement.
            canvas_repo
                .delete_by_id(&generated_primary_canvas_id)
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "UPDATE canvases
                     SET project_id = ?1, kind = 'primary', is_primary = 1,
                         name = ?2, summary = ?3, updated_at = ?4
                     WHERE id = ?5",
                    params![
                        child_constellation_id,
                        seed.canvas_name,
                        seed.canvas_summary,
                        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
                        legacy_canvas_id,
                    ],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "UPDATE projects SET primary_canvas_id = ?1 WHERE id = ?2",
                    params![legacy_canvas_id, child_constellation_id],
                )
                .map_err(|error| error.to_string())?;
            legacy_canvas_id
        } else {
            connection
                .execute(
                    "UPDATE canvases SET name = ?1, summary = ?2, kind = 'primary', is_primary = 1 WHERE id = ?3",
                    params![seed.canvas_name, seed.canvas_summary, generated_primary_canvas_id],
                )
                .map_err(|error| error.to_string())?;
            generated_primary_canvas_id
        };
        out.insert(seed.slug, canvas_id);
    }
    Ok(out)
}

fn write_layout_records(
    connection: &Connection,
    records: &[NodeLayoutRecord],
    mode: LayoutWriteMode,
) -> Result<usize, String> {
    match mode {
        LayoutWriteMode::Upsert => LayoutRepository::new(connection)
            .upsert_node_layouts(records)
            .map_err(|e| e.to_string()),
        LayoutWriteMode::PreserveExisting => {
            let mut written = 0;
            for record in records {
                written += connection
                    .execute(
                        "INSERT OR IGNORE INTO node_layout (
                            graph_node_id,
                            canvas_id,
                            position_x,
                            position_y,
                            width,
                            height,
                            style_json,
                            created_at,
                            updated_at
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                        params![
                            record.graph_node_id,
                            record.canvas_id,
                            record.position_x,
                            record.position_y,
                            record.width,
                            record.height,
                            record.style_json,
                            record.created_at,
                            record.updated_at,
                        ],
                    )
                    .map_err(|e| e.to_string())?;
            }
            Ok(written)
        }
    }
}

fn constellation_canvas_kind(slug: &str) -> String {
    format!("constellation:{slug}")
}

fn graph_id(namespace: &str, slug: &str) -> String {
    format!("{namespace}:{slug}")
}

fn body_for(title: &str, summary: &str, evidence_tags: &[&str]) -> String {
    serde_json::json!([
        {
            "type": "paragraph",
            "content": [{ "type": "text", "text": title, "styles": { "bold": true } }]
        },
        {
            "type": "paragraph",
            "content": [{ "type": "text", "text": summary, "styles": {} }]
        },
        {
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": format!("Directions: read this node as part of the root archetypal field; follow its resonance, source coordinates, and temporal links before flattening it into episode chronology. Evidence tags: {}.", evidence_tags.join(", ")),
                "styles": {}
            }]
        }
    ])
    .to_string()
}

fn relationship_properties(seed: &RelSeed) -> serde_json::Value {
    let mut value = serde_json::json!({
        "evidence_tags": seed.evidence_tags,
        "source_coordinates": [
            "antichrist-vault/episodes/episode-1-2-archetypal-resonance.md",
            "antichrist-vault/episodes/2/ep-0.2-(now-ep-2.0-to-2.5)/episode-2-research-timeline.md"
        ]
    });
    if let Some(dominance) = seed.dominance {
        value["dominance"] = serde_json::Value::String(dominance.to_string());
    }
    value
}

fn layout_records(
    namespace: &str,
    root_canvas_id: &str,
    nodes: &[NodeSeed],
    constellations: &[ConstellationSeed],
    constellation_canvas_ids: &HashMap<&'static str, String>,
) -> Vec<NodeLayoutRecord> {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let by_slug = nodes
        .iter()
        .map(|seed| (seed.slug, seed))
        .collect::<HashMap<_, _>>();
    let constellation_by_slug = constellations
        .iter()
        .map(|seed| (seed.slug, seed))
        .collect::<HashMap<_, _>>();
    let mut records = Vec::new();

    for seed in constellations {
        let node = by_slug
            .get(seed.slug)
            .expect("constellation node seed exists");
        let target_canvas_id = constellation_canvas_ids
            .get(seed.slug)
            .expect("constellation canvas exists");
        records.push(NodeLayoutRecord {
            graph_node_id: graph_id(namespace, seed.slug),
            canvas_id: root_canvas_id.to_string(),
            position_x: seed.root_x,
            position_y: seed.root_y,
            width: 320.0,
            height: 180.0,
            style_json: serde_json::json!({
                "dotColour": colour_for(node.entity_type),
                "bgColour": "#101820",
                "textColour": "#f2efe8",
                "__canvasNode": {
                    "type": "portal",
                    "title": node.title,
                    "summary": node.summary,
                    "targetCanvasId": target_canvas_id,
                    "constellationKind": seed.constellation_kind
                }
            })
            .to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        });

        for (index, member_slug) in seed.members.iter().enumerate() {
            let member = by_slug
                .get(member_slug)
                .unwrap_or_else(|| panic!("constellation member node seed exists: {member_slug}"));
            let (x, y) = child_layout_position(index);
            records.push(NodeLayoutRecord {
                graph_node_id: graph_id(namespace, member.slug),
                canvas_id: target_canvas_id.to_string(),
                position_x: x,
                position_y: y,
                width: 260.0,
                height: 150.0,
                style_json: layout_style_json(
                    member,
                    &constellation_by_slug,
                    constellation_canvas_ids,
                ),
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }
    }

    records
}

fn layout_style_json(
    seed: &NodeSeed,
    constellations: &HashMap<&'static str, &ConstellationSeed>,
    constellation_canvas_ids: &HashMap<&'static str, String>,
) -> String {
    if seed.entity_type == "Constellation" {
        let constellation = constellations
            .get(seed.slug)
            .unwrap_or_else(|| panic!("constellation seed exists for {}", seed.slug));
        let target_canvas_id = constellation_canvas_ids
            .get(seed.slug)
            .unwrap_or_else(|| panic!("canvas id exists for {}", seed.slug));
        return serde_json::json!({
            "dotColour": colour_for(seed.entity_type),
            "bgColour": "#101820",
            "textColour": "#f2efe8",
            "__canvasNode": {
                "type": "portal",
                "title": seed.title,
                "summary": seed.summary,
                "targetCanvasId": target_canvas_id,
                "constellationKind": constellation.constellation_kind
            }
        })
        .to_string();
    }

    node_style_json(seed)
}

fn node_style_json(seed: &NodeSeed) -> String {
    serde_json::json!({
        "dotColour": colour_for(seed.entity_type),
        "bgColour": "#151515",
        "textColour": "#f2efe8",
        "__canvasNode": {
            "type": "note",
            "title": seed.title,
            "content": seed.summary,
            "tags": seed.evidence_tags
        }
    })
    .to_string()
}

fn child_layout_position(index: usize) -> (f64, f64) {
    let columns = 6;
    (
        (index % columns) as f64 * 300.0,
        (index / columns) as f64 * 190.0,
    )
}

fn colour_for(entity_type: &str) -> &'static str {
    match entity_type {
        "Archetype" => "#d8b65a",
        "Dynamic" => "#7db7a5",
        "Event" => "#c46f5b",
        "Source" => "#9f8fd1",
        "Constellation" => "#5aa9d8",
        _ => "#aeb7c2",
    }
}

fn constellation_seeds() -> Vec<ConstellationSeed> {
    vec![
        c(
            "root-ecology",
            "Root Ecology",
            "Meta-constellation of completed sub-constellations; each child appears as a first-class nested portal.",
            "standard",
            &[
                "spectral-lineage-field",
                "image-system-field",
                "power-history-field",
                "generative-axis",
                "ql-position-wheel",
                "ontological-unit",
                "solar-system-unit",
                "social-power-unit",
                "deficiency-unit",
                "devil-sixfold-lineage",
                "christ-sixfold-lineage",
                "double-helix",
                "dual-animal-quaternity",
                "conceptual-operations-quaternity",
                "persona-techne-masks",
                "historical-forms",
                "claim-provenance",
            ],
            -1440.0,
            -520.0,
        ),
        c(
            "spectral-lineage-field",
            "Spectral Lineage Field",
            "Higher-order field that nests the completed Devil, Christ, and double-helix constellations.",
            "standard",
            &[
                "devil-sixfold-lineage",
                "christ-sixfold-lineage",
                "double-helix",
            ],
            -1080.0,
            -520.0,
        ),
        c(
            "image-system-field",
            "Image-System Field",
            "Higher-order field for the ontological and solar image system with its animal and persona masks.",
            "standard",
            &[
                "generative-axis",
                "ql-position-wheel",
                "ontological-unit",
                "solar-system-unit",
                "dual-animal-quaternity",
                "persona-techne-masks",
            ],
            -720.0,
            -520.0,
        ),
        c(
            "power-history-field",
            "Power-History Field",
            "Higher-order field for social power, deficiency, operations, historical forms, and claim discipline.",
            "standard",
            &[
                "social-power-unit",
                "deficiency-unit",
                "conceptual-operations-quaternity",
                "historical-forms",
                "claim-provenance",
            ],
            -360.0,
            -520.0,
        ),
        c(
            "generative-axis",
            "Generative Axis",
            "Root archetypal operators that frame the field before the QL images differentiate.",
            "standard",
            &[
                "self-identity-parent",
                "archetype-as-such",
                "living-symbol",
                "sun-self-source",
                "black-sun-monopoly",
                "father",
                "mother-chora",
                "christ-son",
                "devil-dark-son",
                "humanity",
                "son-of-man",
            ],
            0.0,
            -520.0,
        ),
        c(
            "ql-position-wheel",
            "QL Position Wheel",
            "Six-position wheel that keeps the source-derived QL coordinates reusable across units.",
            "ql-unit",
            &[
                "ql-pos-0",
                "ql-pos-1",
                "ql-pos-2",
                "ql-pos-3",
                "ql-pos-4",
                "ql-pos-5",
            ],
            360.0,
            -520.0,
        ),
        c(
            "ontological-unit",
            "Ontological Unit",
            "Metaphysical face of Self-Identity from Truth through Image.",
            "ql-unit",
            &["truth", "mind", "word", "logos", "son", "image"],
            720.0,
            -520.0,
        ),
        c(
            "solar-system-unit",
            "Solar System Unit",
            "Physical image of the field from Space through System-as-One.",
            "ql-unit",
            &[
                "space",
                "sun",
                "light-heat",
                "keplerian-harmonics-entropy",
                "planetary-life",
                "system-as-one",
            ],
            -1080.0,
            -220.0,
        ),
        c(
            "social-power-unit",
            "Social/Power Unit",
            "Social face of Self-Identity from Play through Work.",
            "ql-unit",
            &["play", "need", "sacrifice", "decision", "love", "work"],
            -720.0,
            -220.0,
        ),
        c(
            "deficiency-unit",
            "Deficiency Unit",
            "Inverted field of Self-Identity denied, from Dogma through Show.",
            "ql-unit",
            &[
                "dogma",
                "fragmentation",
                "fossilised-economy-of-signs",
                "techne-as-extraction",
                "devouring-i-deal",
                "show",
            ],
            -360.0,
            -220.0,
        ),
        c(
            "devil-sixfold-lineage",
            "Devil Sixfold Spectral Lineage",
            "Bounded QL child surface for the sixfold Devil-image lineage.",
            "ql-unit",
            &[
                "devil",
                "mithra",
                "prometheus",
                "lucifer-venus",
                "satan-chronos",
                "pan-hen",
            ],
            0.0,
            -220.0,
        ),
        c(
            "christ-sixfold-lineage",
            "Christ Sixfold Spectral Lineage",
            "Complementary QL child surface for the sixfold Christ-image lineage.",
            "ql-unit",
            &[
                "god-father",
                "zarathustra",
                "prometheus",
                "christ",
                "jesus",
                "god-man",
            ],
            360.0,
            -220.0,
        ),
        c(
            "double-helix",
            "Double Helix",
            "Nested lineage topology where Devil and Christ chains share Prometheus and converge at Pan/God-Man.",
            "ql-unit",
            &[
                "devil-sixfold-lineage",
                "christ-sixfold-lineage",
                "self-identity-parent",
                "prometheus",
                "pan-hen",
                "god-man",
            ],
            720.0,
            -220.0,
        ),
        c(
            "dual-animal-quaternity",
            "Dual Animal Quaternity",
            "Animal faces arranged across the six QL positions.",
            "ql-unit",
            &[
                "lamb-sheep",
                "bull-ox",
                "dog-sheepdog-wolf",
                "eagle-owl",
                "lion-jaguar-puma",
                "son-of-man-man-the-son",
            ],
            -720.0,
            40.0,
        ),
        c(
            "conceptual-operations-quaternity",
            "Conceptual Operations Quaternity",
            "Operational faces of persuasion, trance, spectacle, and force.",
            "ql-unit",
            &[
                "advertising-propaganda",
                "mind-control-hypnosis",
                "spectacle-illusion",
                "power-magic",
            ],
            -360.0,
            40.0,
        ),
        c(
            "persona-techne-masks",
            "Persona-Techne Masks",
            "Archetypal masks of attention, experiment, spectacle, record, and failed fabrication.",
            "standard",
            &[
                "magician-con-man",
                "chemist-doctor",
                "showman-actor",
                "record-keeper",
                "frankenstein-failed-experiment",
            ],
            0.0,
            40.0,
        ),
        c(
            "historical-forms",
            "Historical Forms",
            "Dated institutional and event forms used by the timeline lens.",
            "standard",
            &[
                "ebla-opium-residue",
                "medici-template",
                "studiolo-image-knowledge",
                "voc-eic-corpora",
                "banda-genocide",
                "enlightenment-occultation",
                "bank-of-england",
                "plassey-eic-sovereignty",
                "opium-war",
                "rhodes-round-table-city",
                "balfour-declaration",
                "chatham-cfr",
                "ig-farben",
                "bis",
                "nazi-oss-cia-continuum",
                "mk-ultra-midnight-climax",
                "in-q-tel",
                "dutroux-institutional-failure",
                "epstein-construct",
                "nygard-complement",
                "fentanyl-corridor",
            ],
            360.0,
            40.0,
        ),
        c(
            "claim-provenance",
            "Claim Provenance",
            "Contested and do-not-flatten claims preserved as source nodes.",
            "standard",
            &[
                "claim-society-of-elect-quigley-1891",
                "claim-balfour-hidden-hand",
                "claim-olson-death-contested-causality",
                "claim-aquino-wewelsburg-self-report",
                "claim-franklin-abuse-network",
                "claim-caradori-suspicious-death",
                "claim-dutroux-extended-network",
                "claim-epstein-intelligence-role",
                "claim-epstein-blackmail-network-extent",
                "claim-nygard-symbolic-complement",
                "claim-lifelog-facebook-direct-link",
                "claim-google-mdds-cia-origin",
                "claim-ben-rich-suppressed-technology",
                "claim-inventor-suppression",
                "claim-occult-exoteric-parallels",
            ],
            720.0,
            40.0,
        ),
    ]
}

fn c(
    slug: &'static str,
    canvas_name: &'static str,
    canvas_summary: &'static str,
    constellation_kind: &'static str,
    members: &'static [&'static str],
    root_x: f64,
    root_y: f64,
) -> ConstellationSeed {
    ConstellationSeed {
        slug,
        canvas_name,
        canvas_summary,
        constellation_kind,
        members,
        root_x,
        root_y,
    }
}

fn node_seeds() -> Vec<NodeSeed> {
    vec![
        n(
            "root-ecology",
            "Constellation",
            "Root Ecology",
            "Meta-constellation that holds completed sub-constellations as first-class nested constellation nodes.",
            None,
            &[RESONANCE_SOURCE, TIMELINE_SOURCE],
            &["root_ecology", "constellation_index", "interpretive_vector"],
            Some("root-ecology"),
            false,
            None,
            None,
            None,
        ),
        n(
            "spectral-lineage-field",
            "Constellation",
            "Spectral Lineage Field",
            "Higher-order field that nests the completed Devil, Christ, and double-helix constellations.",
            None,
            &[DEVIL_CHAIN_SOURCE, CHRIST_CHAIN_SOURCE, DOUBLE_HELIX_SOURCE],
            &["constellation_index", "interpretive_vector"],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "image-system-field",
            "Constellation",
            "Image-System Field",
            "Higher-order field for the ontological and solar image system with its animal and persona masks.",
            None,
            &[
                ONTOLOGICAL_SOURCE,
                SOLAR_SYSTEM_SOURCE,
                POSITION_0_SOURCE,
                POSITION_1_SOURCE,
                POSITION_2_SOURCE,
                POSITION_3_SOURCE,
                POSITION_4_SOURCE,
                POSITION_5_SOURCE,
            ],
            &["constellation_index", "interpretive_vector"],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "power-history-field",
            "Constellation",
            "Power-History Field",
            "Higher-order field for social power, deficiency, operations, historical forms, and claim discipline.",
            None,
            &[
                SOCIAL_POWER_SOURCE,
                DEFICIENCY_SOURCE,
                RESONANCE_SOURCE,
                TIMELINE_SOURCE,
            ],
            &["constellation_index", "interpretive_vector"],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "generative-axis",
            "Constellation",
            "Generative Axis",
            "Root archetypal operators that frame the field before the QL images differentiate.",
            None,
            &[SELF_IDENTITY_SOURCE, RESONANCE_SOURCE],
            &["interpretive_vector"],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-position-wheel",
            "Constellation",
            "QL Position Wheel",
            "Six-position wheel that keeps the source-derived QL coordinates reusable across units.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                POSITION_0_SOURCE,
                POSITION_1_SOURCE,
                POSITION_2_SOURCE,
                POSITION_3_SOURCE,
                POSITION_4_SOURCE,
                POSITION_5_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "structural"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "ontological-unit",
            "Constellation",
            "Ontological Unit",
            "Metaphysical face of Self-Identity from Truth through Image.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                ONTOLOGICAL_SOURCE,
                SELF_IDENTITY_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "solar-system-unit",
            "Constellation",
            "Solar System Unit",
            "Physical image of the field from Space through System-as-One.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                SOLAR_SYSTEM_SOURCE,
                SELF_IDENTITY_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "social-power-unit",
            "Constellation",
            "Social/Power Unit",
            "Social face of Self-Identity from Play through Work.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                SOCIAL_POWER_SOURCE,
                SELF_IDENTITY_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "deficiency-unit",
            "Constellation",
            "Deficiency Unit",
            "Inverted field of Self-Identity denied, from Dogma through Show.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                DEFICIENCY_SOURCE,
                SELF_IDENTITY_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "devil-sixfold-lineage",
            "Constellation",
            "Devil Sixfold Spectral Lineage",
            "Bounded QL unit for the sixfold Devil-image lineage.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                DEVIL_CHAIN_SOURCE,
                DOUBLE_HELIX_SOURCE,
                RESONANCE_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "christ-sixfold-lineage",
            "Constellation",
            "Christ Sixfold Spectral Lineage",
            "Complementary QL unit for the sixfold Christ-image lineage.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                CHRIST_CHAIN_SOURCE,
                DOUBLE_HELIX_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "double-helix",
            "Constellation",
            "Double Helix",
            "Lineage topology where Devil and Christ chains share Prometheus and converge at Pan/God-Man.",
            None,
            &[
                "#2",
                "#5",
                DOUBLE_HELIX_SOURCE,
                DEVIL_CHAIN_SOURCE,
                CHRIST_CHAIN_SOURCE,
                SELF_IDENTITY_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "dual-animal-quaternity",
            "Constellation",
            "Dual Animal Quaternity",
            "Solar and lunar animal faces arranged across the six QL positions.",
            None,
            &[
                "#0",
                "#1",
                "#2",
                "#3",
                "#4",
                "#5",
                POSITION_0_SOURCE,
                POSITION_1_SOURCE,
                POSITION_2_SOURCE,
                POSITION_3_SOURCE,
                POSITION_4_SOURCE,
                POSITION_5_SOURCE,
                RESONANCE_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "conceptual-operations-quaternity",
            "Constellation",
            "Conceptual Operations Quaternity",
            "Advertising, hypnosis, spectacle, and power as operational faces of the field.",
            None,
            &[
                "#1",
                "#2",
                "#3",
                "#4",
                SOCIAL_POWER_SOURCE,
                RESONANCE_SOURCE,
                TIMELINE_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            Some("ql-unit"),
            false,
            None,
            None,
            None,
        ),
        n(
            "persona-techne-masks",
            "Constellation",
            "Persona-Techne Masks",
            "Archetypal masks of attention, experiment, spectacle, record, and failed fabrication.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "historical-forms",
            "Constellation",
            "Historical Forms",
            "Dated institutional and event forms used by the timeline lens.",
            None,
            &[TIMELINE_SOURCE],
            &[
                "documented",
                "well_evidenced_inference",
                "interpretive_vector",
            ],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "claim-provenance",
            "Constellation",
            "Claim Provenance",
            "Contested and do-not-flatten claims preserved as source nodes.",
            None,
            &[TIMELINE_SOURCE],
            &["contested", "do_not_seed_as_fact"],
            Some("constellation"),
            false,
            None,
            None,
            None,
        ),
        n(
            "archetype-as-such",
            "Archetype",
            "Archetype-as-such",
            "Irrepresentable generative pattern; empty hub or strange attractor.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "living-symbol",
            "Archetype",
            "Living Symbol",
            "Open intersection where meanings gather, dissolve, and recombine.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "sun-self-source",
            "Archetype",
            "Sun / Self / Source",
            "Radiant source that gives without loss.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "black-sun-monopoly",
            "Archetype",
            "Black Sun / Monopoly",
            "Collapsed center where the one devours the many.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "father",
            "Archetype",
            "Father",
            "Formless identity principle.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "mother-chora",
            "Archetype",
            "Mother / Chora",
            "Matter, evolving love, and generative container.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "christ-son",
            "Archetype",
            "Christ / Son",
            "Received identity and offered self.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "devil-dark-son",
            "Archetype",
            "Devil / Dark Son",
            "Lost child, fabricated father-costume, and false patriarch.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "humanity",
            "Archetype",
            "Humanity",
            "Divine substance exceeding merely rational Man.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "son-of-man",
            "Archetype",
            "Son of Man",
            "Integrated personhood; Man delivered into Humanity.",
            Some("#5"),
            &["#5", RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "self-identity-parent",
            "Archetype",
            "Self-Identity Parent",
            "Parent node for the QL units; the identity structure from which the faces differentiate.",
            None,
            &[SELF_IDENTITY_SOURCE],
            &["ql_unit", "structural", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-pos-0",
            "Archetype",
            "QL #0 Ground",
            "Void, ground, source, and the 0/5 axis before differentiation.",
            Some("#0"),
            &["#0", POSITION_0_SOURCE],
            &["ql_unit", "ql_positioned", "structural"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-pos-1",
            "Archetype",
            "QL #1 Singularity / Split",
            "The first split, solar center, and need-bearing point of differentiation.",
            Some("#1"),
            &["#1", POSITION_1_SOURCE],
            &["ql_unit", "ql_positioned", "structural"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-pos-2",
            "Archetype",
            "QL #2 Medium / Exchange",
            "Bridge, word, sacrifice, and exchange between separated poles.",
            Some("#2"),
            &["#2", POSITION_2_SOURCE],
            &["ql_unit", "ql_positioned", "structural"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-pos-3",
            "Archetype",
            "QL #3 Ordering Intelligence",
            "Logos, harmonics, decision, and trinitarian ordering intelligence.",
            Some("#3"),
            &["#3", POSITION_3_SOURCE],
            &["ql_unit", "ql_positioned", "structural"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-pos-4",
            "Archetype",
            "QL #4 Container / Person",
            "Personal container, love, planetary life, sonship, and convergence.",
            Some("#4"),
            &["#4", POSITION_4_SOURCE],
            &["ql_unit", "ql_positioned", "structural"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ql-pos-5",
            "Archetype",
            "QL #5 Visible Whole / Return",
            "Visible totality, work, image, and the 5=0 return.",
            Some("#5"),
            &["#5", POSITION_5_SOURCE],
            &["ql_unit", "ql_positioned", "structural"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "truth",
            "Archetype",
            "Truth",
            "Ontological #0: ground of the metaphysical face of Self-Identity.",
            Some("#0"),
            &["#0", ONTOLOGICAL_SOURCE, POSITION_0_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "mind",
            "Archetype",
            "Mind",
            "Ontological #1: the knowing split of Self-Identity.",
            Some("#1"),
            &["#1", ONTOLOGICAL_SOURCE, POSITION_1_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "word",
            "Archetype",
            "Word",
            "Ontological #2: medium, articulation, and bridge.",
            Some("#2"),
            &["#2", ONTOLOGICAL_SOURCE, POSITION_2_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "logos",
            "Archetype",
            "Logos",
            "Ontological #3: ordering intelligence and harmonic relation.",
            Some("#3"),
            &["#3", ONTOLOGICAL_SOURCE, POSITION_3_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "son",
            "Archetype",
            "Son",
            "Ontological #4: person, received identity, and living container.",
            Some("#4"),
            &["#4", ONTOLOGICAL_SOURCE, POSITION_4_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "image",
            "Archetype",
            "Image",
            "Ontological #5: visible world of truth and return of the whole.",
            Some("#5"),
            &["#5", ONTOLOGICAL_SOURCE, POSITION_5_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "space",
            "Archetype",
            "Space",
            "Solar #0: open field in which the solar system appears.",
            Some("#0"),
            &["#0", SOLAR_SYSTEM_SOURCE, POSITION_0_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "sun",
            "Archetype",
            "Sun",
            "Solar #1: source that gives without loss.",
            Some("#1"),
            &["#1", SOLAR_SYSTEM_SOURCE, POSITION_1_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "light-heat",
            "Archetype",
            "Light and Heat",
            "Solar #2: radiance, medium, and energetic exchange.",
            Some("#2"),
            &["#2", SOLAR_SYSTEM_SOURCE, POSITION_2_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "keplerian-harmonics-entropy",
            "Archetype",
            "Keplerian Harmonics / Entropy",
            "Solar #3: harmonic ordering and entropic dispersion.",
            Some("#3"),
            &["#3", SOLAR_SYSTEM_SOURCE, POSITION_3_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "planetary-life",
            "Archetype",
            "Planetary Life",
            "Solar #4: living container where the system becomes personal and biological.",
            Some("#4"),
            &["#4", SOLAR_SYSTEM_SOURCE, POSITION_4_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "system-as-one",
            "Archetype",
            "System-as-One",
            "Solar #5: visible solar totality as one system.",
            Some("#5"),
            &["#5", SOLAR_SYSTEM_SOURCE, POSITION_5_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "play",
            "Dynamic",
            "Play",
            "Social/Power #0: uncoerced ground prior to work inversion.",
            Some("#0"),
            &["#0", SOCIAL_POWER_SOURCE, POSITION_0_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "need",
            "Dynamic",
            "Need",
            "Social/Power #1: dependency and the first pressure of lack.",
            Some("#1"),
            &["#1", SOCIAL_POWER_SOURCE, POSITION_1_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "sacrifice",
            "Dynamic",
            "Sacrifice",
            "Social/Power #2: offering, mediation, and cost.",
            Some("#2"),
            &["#2", SOCIAL_POWER_SOURCE, POSITION_2_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "decision",
            "Dynamic",
            "Decision",
            "Social/Power #3: ordering act that determines the field.",
            Some("#3"),
            &["#3", SOCIAL_POWER_SOURCE, POSITION_3_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "love",
            "Dynamic",
            "Love",
            "Social/Power #4: offered self rather than devouring I-Deal.",
            Some("#4"),
            &["#4", SOCIAL_POWER_SOURCE, POSITION_4_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "work",
            "Dynamic",
            "Work",
            "Social/Power #5: visible social totality and inverted form of play.",
            Some("#5"),
            &["#5", SOCIAL_POWER_SOURCE, POSITION_5_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "dogma",
            "Dynamic",
            "Dogma",
            "Deficiency #0: occluded ground hardened into fixed declaration.",
            Some("#0"),
            &["#0", DEFICIENCY_SOURCE, POSITION_0_SOURCE],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "fragmentation",
            "Dynamic",
            "Fragmentation",
            "Deficiency #1: the split when Self-Identity is denied.",
            Some("#1"),
            &["#1", DEFICIENCY_SOURCE, POSITION_1_SOURCE],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "fossilised-economy-of-signs",
            "Dynamic",
            "Fossilised Economy of Signs",
            "Deficiency #2: word and exchange ossified into dead signs.",
            Some("#2"),
            &["#2", DEFICIENCY_SOURCE, POSITION_2_SOURCE],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "techne-as-extraction",
            "Dynamic",
            "Techne as Extraction",
            "Deficiency #3: ordering intelligence turned into extractive technique.",
            Some("#3"),
            &["#3", DEFICIENCY_SOURCE, POSITION_3_SOURCE],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "devouring-i-deal",
            "Dynamic",
            "Devouring I-Deal",
            "Deficiency #4: personal container inverted into consuming ideal.",
            Some("#4"),
            &["#4", DEFICIENCY_SOURCE, POSITION_4_SOURCE],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "show",
            "Dynamic",
            "Show",
            "Deficiency #5: visible totality reduced to performance surface.",
            Some("#5"),
            &["#5", DEFICIENCY_SOURCE, POSITION_5_SOURCE],
            &["ql_unit", "ql_positioned", "deficiency", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "devil",
            "Archetype",
            "Devil",
            "Sixfold image at QL #0.",
            Some("#0"),
            &["#0", DEVIL_CHAIN_SOURCE, POSITION_0_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "mithra",
            "Archetype",
            "Mithra",
            "Solar-bull covenant image at QL #1.",
            Some("#1"),
            &["#1", DEVIL_CHAIN_SOURCE, POSITION_1_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "prometheus",
            "Archetype",
            "Prometheus",
            "Stolen fire and technical mediation at QL #2.",
            Some("#2"),
            &[
                "#2",
                DEVIL_CHAIN_SOURCE,
                CHRIST_CHAIN_SOURCE,
                DOUBLE_HELIX_SOURCE,
                POSITION_2_SOURCE,
                RESONANCE_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "lucifer-venus",
            "Archetype",
            "Lucifer / Venus",
            "Light-bearer, beauty, and reflective seduction at QL #3.",
            Some("#3"),
            &["#3", DEVIL_CHAIN_SOURCE, POSITION_3_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "satan-chronos",
            "Archetype",
            "Satan / Chronos",
            "Accuser-time and devouring age at QL #4.",
            Some("#4"),
            &["#4", DEVIL_CHAIN_SOURCE, POSITION_4_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "pan-hen",
            "Archetype",
            "Pan-Hen",
            "All-one field and animal-divine threshold at QL #5.",
            Some("#5"),
            &[
                "#5",
                DEVIL_CHAIN_SOURCE,
                DOUBLE_HELIX_SOURCE,
                POSITION_5_SOURCE,
                RESONANCE_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "god-father",
            "Archetype",
            "God / Father",
            "Christ-chain image at QL #0: source and fatherhood read from the offered side.",
            Some("#0"),
            &["#0", CHRIST_CHAIN_SOURCE, POSITION_0_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "zarathustra",
            "Archetype",
            "Zarathustra",
            "Christ-chain image at QL #1: solar moral split and first differentiation.",
            Some("#1"),
            &["#1", CHRIST_CHAIN_SOURCE, POSITION_1_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "christ",
            "Archetype",
            "Christ",
            "Christ-chain image at QL #3: Logos as offered ordering intelligence.",
            Some("#3"),
            &["#3", CHRIST_CHAIN_SOURCE, POSITION_3_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "jesus",
            "Archetype",
            "Jesus",
            "Christ-chain image at QL #4: personal incarnation of offered love.",
            Some("#4"),
            &["#4", CHRIST_CHAIN_SOURCE, POSITION_4_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "god-man",
            "Archetype",
            "God-Man",
            "Christ-chain image at QL #5: Pan-Hen read from the Christic side.",
            Some("#5"),
            &[
                "#5",
                CHRIST_CHAIN_SOURCE,
                DOUBLE_HELIX_SOURCE,
                POSITION_5_SOURCE,
            ],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "magician-con-man",
            "Archetype",
            "Magician / Con-man",
            "Manipulation of attention, promise, and counterfeit wonder.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "chemist-doctor",
            "Archetype",
            "Chemist / Doctor",
            "Technical cure shadowed by experimental control.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "showman-actor",
            "Archetype",
            "Showman / Actor",
            "Spectacle as identity production.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "record-keeper",
            "Archetype",
            "Record Keeper",
            "Archive, ledger, file, and hidden memory.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "frankenstein-failed-experiment",
            "Archetype",
            "Frankenstein / Failed Experiment",
            "Fabricated life returning as unmanaged consequence.",
            None,
            &[RESONANCE_SOURCE],
            &["interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "lamb-sheep",
            "Archetype",
            "Lamb / Sheep",
            "Sacrificial innocence and herd-passivity polarity.",
            Some("#0"),
            &["#0", POSITION_0_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "bull-ox",
            "Archetype",
            "Bull / Ox",
            "Solar force and laboring capture.",
            Some("#1"),
            &["#1", POSITION_1_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "dog-sheepdog-wolf",
            "Archetype",
            "Dog-Sheepdog / Wolf",
            "Guardian, manager, predator, and pack intelligence.",
            Some("#2"),
            &["#2", POSITION_2_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "eagle-owl",
            "Archetype",
            "Eagle / Owl",
            "Imperial vision and nocturnal occult sight.",
            Some("#3"),
            &["#3", POSITION_3_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "lion-jaguar-puma",
            "Archetype",
            "Lion / Jaguar-Puma",
            "Royal force, jungle sovereignty, and predatory charisma.",
            Some("#4"),
            &["#4", POSITION_4_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "son-of-man-man-the-son",
            "Archetype",
            "Son of Man / Man the Son",
            "Human image folded through divine sonship.",
            Some("#5"),
            &["#5", POSITION_5_SOURCE, RESONANCE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "advertising-propaganda",
            "Dynamic",
            "Advertising / Propaganda",
            "Mass persuasion as desire-shaping operation.",
            Some("#1"),
            &["#1", SOCIAL_POWER_SOURCE, RESONANCE_SOURCE, TIMELINE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "mind-control-hypnosis",
            "Dynamic",
            "Mind Control / Hypnosis",
            "Trance, conditioning, and experimental control.",
            Some("#2"),
            &["#2", SOCIAL_POWER_SOURCE, RESONANCE_SOURCE, TIMELINE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "spectacle-illusion",
            "Dynamic",
            "Spectacle / Illusion",
            "Image-world as governance of perception.",
            Some("#3"),
            &["#3", SOCIAL_POWER_SOURCE, RESONANCE_SOURCE, TIMELINE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "power-magic",
            "Dynamic",
            "Power / Magic",
            "Will, charisma, and operative force.",
            Some("#4"),
            &["#4", SOCIAL_POWER_SOURCE, RESONANCE_SOURCE, TIMELINE_SOURCE],
            &["ql_unit", "ql_positioned", "interpretive_vector"],
            None,
            false,
            None,
            None,
            None,
        ),
        n(
            "ebla-opium-residue",
            "Event",
            "Ebla poppy / opium residue vector",
            "Ancient drug-vector source point used as a long-duration temporal background, not as direct causation.",
            None,
            &[TIMELINE_SOURCE],
            &["documented", "interpretive_vector"],
            None,
            true,
            Some("-2400-01-01"),
            None,
            Some("century"),
        ),
        n(
            "medici-template",
            "Event",
            "Medici Template",
            "Renaissance template for banking, patronage, image, and power.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1460-01-01"),
            Some("1600-12-31"),
            Some("year"),
        ),
        n(
            "studiolo-image-knowledge",
            "Event",
            "Studiolo Image-Knowledge Ordering",
            "Renaissance image-knowledge cabinet as documented cultural form and interpretive ordering vector.",
            None,
            &[TIMELINE_SOURCE],
            &["documented", "interpretive_vector"],
            None,
            true,
            Some("1570-01-01"),
            Some("1572-12-31"),
            Some("year"),
        ),
        n(
            "voc-eic-corpora",
            "Event",
            "VOC / EIC Corpora",
            "Chartered corporate sovereignty and extraction.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1602-01-01"),
            None,
            Some("year"),
        ),
        n(
            "banda-genocide",
            "Event",
            "Banda Genocide",
            "Colonial violence as monopoly enforcement.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1621-01-01"),
            None,
            Some("year"),
        ),
        n(
            "enlightenment-occultation",
            "Event",
            "Enlightenment Occultation",
            "Interpretive vector from rational light to hidden administrative power.",
            None,
            &[TIMELINE_SOURCE],
            &["interpretive_vector"],
            None,
            true,
            Some("1648-01-01"),
            Some("1806-12-31"),
            Some("year"),
        ),
        n(
            "bank-of-england",
            "Institution",
            "Bank of England",
            "Documented finance-state institution used in the corporate sovereignty and monopoly vector.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1694-07-27"),
            None,
            Some("day"),
        ),
        n(
            "plassey-eic-sovereignty",
            "Event",
            "Plassey / EIC Sovereignty",
            "Company-state sovereignty vector around Plassey and East India Company power.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1757-06-23"),
            None,
            Some("day"),
        ),
        n(
            "opium-war",
            "Event",
            "Opium War",
            "Documented drug, empire, trade, and coercive-market vector.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1839-01-01"),
            Some("1842-12-31"),
            Some("year"),
        ),
        n(
            "rhodes-round-table-city",
            "Event",
            "Rhodes / Round Table / City",
            "Imperial network form around Rhodes, Round Table, and City finance.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1877-01-30"),
            None,
            Some("day"),
        ),
        n(
            "balfour-declaration",
            "Event",
            "Balfour Declaration",
            "Documented declaration event; hidden-hand interpretations are separated as claim provenance.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1917-11-02"),
            None,
            Some("day"),
        ),
        n(
            "chatham-cfr",
            "Institution",
            "Chatham House / CFR Formation",
            "Documented institutional-network formation vector after the First World War.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1919-01-01"),
            Some("1921-12-31"),
            Some("year"),
        ),
        n(
            "ig-farben",
            "Institution",
            "IG Farben",
            "Documented industrial combine used in the war, chemical, and institutional continuity vector.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1925-01-01"),
            None,
            Some("year"),
        ),
        n(
            "bis",
            "Institution",
            "Bank for International Settlements",
            "Documented finance-network institution used in the historical resonance field.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1930-01-01"),
            None,
            Some("year"),
        ),
        n(
            "nazi-oss-cia-continuum",
            "Event",
            "Nazi-OSS-CIA Continuum",
            "Postwar transfer and intelligence continuity as a research vector.",
            None,
            &[TIMELINE_SOURCE],
            &["well_evidenced_inference"],
            None,
            true,
            Some("1945-01-01"),
            Some("1973-12-31"),
            Some("year"),
        ),
        n(
            "mk-ultra-midnight-climax",
            "Event",
            "MK-ULTRA / Midnight Climax",
            "Documented mind-control research and sexual blackmail experiment complex.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1953-01-01"),
            Some("1973-12-31"),
            Some("year"),
        ),
        n(
            "in-q-tel",
            "Institution",
            "In-Q-Tel",
            "Documented intelligence-technology venture vector.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1999-01-01"),
            None,
            Some("year"),
        ),
        n(
            "dutroux-institutional-failure",
            "Event",
            "Dutroux Case Institutional Failure",
            "Documented abuse and institutional-failure case; extended-network claims are preserved separately.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1995-01-01"),
            Some("1996-12-31"),
            Some("year"),
        ),
        n(
            "epstein-construct",
            "Event",
            "Epstein Construct",
            "Documented trafficking case; blackmail and intelligence-network readings are preserved as separate claim nodes.",
            None,
            &[TIMELINE_SOURCE],
            &["documented"],
            None,
            true,
            Some("1990-01-01"),
            Some("2019-12-31"),
            Some("decade"),
        ),
        n(
            "nygard-complement",
            "Event",
            "Nygard Complement",
            "Documented legal proceedings around Nygard; symbolic complement readings remain separately tagged as claims.",
            None,
            &[TIMELINE_SOURCE],
            &["documented", "interpretive_vector"],
            None,
            true,
            Some("2020-01-01"),
            Some("2025-12-31"),
            Some("year"),
        ),
        n(
            "fentanyl-corridor",
            "Event",
            "Fentanyl Corridor",
            "Documented modern drug-corridor vector; intent and coordination claims require separate provenance.",
            None,
            &[TIMELINE_SOURCE],
            &["documented", "interpretive_vector"],
            None,
            true,
            Some("2020-01-01"),
            None,
            Some("decade"),
        ),
        n(
            "claim-society-of-elect-quigley-1891",
            "Claim",
            "Society of the Elect constituted per Quigley",
            "Contested claim preserved as provenance rather than factual graph edge.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("1891-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-balfour-hidden-hand",
            "Claim",
            "Balfour hidden-hand interpretations",
            "Contested drafting-emphasis or hidden-hand interpretations preserved as provenance beyond the documented declaration.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("1917-11-02"),
            None,
            Some("day"),
        ),
        n(
            "claim-olson-death-contested-causality",
            "Claim",
            "Frank Olson death causality remains contested",
            "Contested causality claim preserved as a claim source.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("1953-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-aquino-wewelsburg-self-report",
            "Claim",
            "Aquino Wewelsburg self-report",
            "Self-reported occult ritual material preserved as source provenance rather than objective historical causation.",
            None,
            &[TIMELINE_SOURCE],
            &["contested", "source_reported"],
            Some("claim"),
            true,
            Some("1982-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-franklin-abuse-network",
            "Claim",
            "Franklin abuse network allegations",
            "Contested allegations preserved as claim provenance.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("1988-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-caradori-suspicious-death",
            "Claim",
            "Gary Caradori death suspicious timing",
            "Suspicious-timing claim preserved without factual flattening.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("1990-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-dutroux-extended-network",
            "Claim",
            "Dutroux extended-network allegations",
            "Extended-network and suspicious-death claims separated from documented abuse and institutional failure.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("1996-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-epstein-intelligence-role",
            "Claim",
            "Epstein intelligence role",
            "Contested intelligence-role claim preserved as claim provenance.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("2019-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-epstein-blackmail-network-extent",
            "Claim",
            "Epstein blackmail-network extent",
            "Blackmail-network claims beyond documented trafficking are preserved as contested provenance.",
            None,
            &[TIMELINE_SOURCE],
            &["contested"],
            Some("claim"),
            true,
            Some("2019-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-nygard-symbolic-complement",
            "Claim",
            "Nygard symbolic complement",
            "Symbolic-complement reading of Nygard material preserved as interpretive claim, separate from documented legal events.",
            None,
            &[TIMELINE_SOURCE],
            &["interpretive_vector", "do_not_seed_as_fact"],
            Some("claim"),
            true,
            Some("2020-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-lifelog-facebook-direct-link",
            "Claim",
            "LifeLog and Facebook direct linkage not established",
            "Do-not-seed-as-fact claim for the LifeLog/Facebook linkage.",
            None,
            &[TIMELINE_SOURCE],
            &["do_not_seed_as_fact"],
            Some("claim"),
            true,
            Some("2004-02-04"),
            None,
            Some("day"),
        ),
        n(
            "claim-google-mdds-cia-origin",
            "Claim",
            "Google / MDDS / CIA direct-origin claim",
            "Documented research funding history must stay separate from direct-control or origin claims.",
            None,
            &[TECHNOLOGICAL_OCCULTATION_SOURCE],
            &["contested", "do_not_seed_as_fact"],
            Some("claim"),
            true,
            Some("1999-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-ben-rich-suppressed-technology",
            "Claim",
            "Ben Rich suppressed-technology quotation",
            "Suppressed-technology quotation material requires source-specific evidence before factual seeding.",
            None,
            &[TECHNOLOGICAL_OCCULTATION_SOURCE],
            &["contested", "do_not_seed_as_fact"],
            Some("claim"),
            true,
            Some("1993-01-01"),
            None,
            Some("year"),
        ),
        n(
            "claim-inventor-suppression",
            "Claim",
            "Inventor suppression stories",
            "Ogle, Meyer, and similar inventor-suppression stories require individual source discipline before factual graph edges.",
            None,
            &[TECHNOLOGICAL_OCCULTATION_SOURCE],
            &["contested", "do_not_seed_as_fact"],
            Some("claim"),
            true,
            Some("1970-01-01"),
            None,
            Some("decade"),
        ),
        n(
            "claim-occult-exoteric-parallels",
            "Claim",
            "Occult / exoteric symbolic parallels",
            "Symbolic or typological parallels preserved as interpretive vectors rather than documented historical causation.",
            None,
            &[RESONANCE_SOURCE, TIMELINE_SOURCE],
            &["interpretive_vector", "do_not_seed_as_fact"],
            Some("claim"),
            false,
            None,
            None,
            None,
        ),
    ]
}

#[allow(clippy::too_many_arguments)]
fn n(
    slug: &'static str,
    entity_type: &'static str,
    title: &'static str,
    summary: &'static str,
    coordinate: Option<&'static str>,
    source_coordinates: &'static [&'static str],
    evidence_tags: &'static [&'static str],
    source_kind: Option<&'static str>,
    is_temporal: bool,
    valid_from: Option<&'static str>,
    valid_to: Option<&'static str>,
    temporal_precision: Option<&'static str>,
) -> NodeSeed {
    NodeSeed {
        slug,
        entity_type,
        title,
        summary,
        coordinate,
        source_coordinates,
        evidence_tags,
        source_kind,
        is_temporal,
        valid_from,
        valid_to,
        temporal_precision,
    }
}

fn relationship_seeds() -> Vec<RelSeed> {
    let mut relationships = vec![
        r(
            "archetype-as-such",
            "RESONATES_WITH",
            "living-symbol",
            None,
            &["interpretive_vector"],
        ),
        r(
            "living-symbol",
            "INFLUENCES",
            "sun-self-source",
            None,
            &["interpretive_vector"],
        ),
        r(
            "black-sun-monopoly",
            "OPPOSES",
            "sun-self-source",
            None,
            &["interpretive_vector"],
        ),
        r(
            "devil-dark-son",
            "OPPOSES",
            "christ-son",
            None,
            &["interpretive_vector"],
        ),
        r(
            "devil",
            "RESONATES_WITH",
            "devil-sixfold-lineage",
            None,
            &["interpretive_vector"],
        ),
        r(
            "mithra",
            "RESONATES_WITH",
            "devil-sixfold-lineage",
            None,
            &["interpretive_vector"],
        ),
        r(
            "prometheus",
            "RESONATES_WITH",
            "devil-sixfold-lineage",
            None,
            &["interpretive_vector"],
        ),
        r(
            "lucifer-venus",
            "RESONATES_WITH",
            "devil-sixfold-lineage",
            None,
            &["interpretive_vector"],
        ),
        r(
            "satan-chronos",
            "RESONATES_WITH",
            "devil-sixfold-lineage",
            None,
            &["interpretive_vector"],
        ),
        r(
            "pan-hen",
            "RESONATES_WITH",
            "devil-sixfold-lineage",
            None,
            &["interpretive_vector"],
        ),
        r(
            "advertising-propaganda",
            "RESONATES_WITH",
            "bull-ox",
            None,
            &["interpretive_vector"],
        ),
        r(
            "mind-control-hypnosis",
            "RESONATES_WITH",
            "dog-sheepdog-wolf",
            None,
            &["interpretive_vector"],
        ),
        r(
            "spectacle-illusion",
            "RESONATES_WITH",
            "eagle-owl",
            None,
            &["interpretive_vector"],
        ),
        r(
            "power-magic",
            "RESONATES_WITH",
            "lion-jaguar-puma",
            None,
            &["interpretive_vector"],
        ),
        r(
            "ebla-opium-residue",
            "ECHOES",
            "chemist-doctor",
            Some("secondary"),
            &["documented", "interpretive_vector"],
        ),
        r(
            "medici-template",
            "INSTANTIATES",
            "bull-ox",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "medici-template",
            "ECHOES",
            "eagle-owl",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "studiolo-image-knowledge",
            "ECHOES",
            "spectacle-illusion",
            Some("secondary"),
            &["documented", "interpretive_vector"],
        ),
        r(
            "voc-eic-corpora",
            "INSTANTIATES",
            "bull-ox",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "banda-genocide",
            "INSTANTIATES",
            "lamb-sheep",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "enlightenment-occultation",
            "INSTANTIATES",
            "eagle-owl",
            Some("dominant"),
            &["interpretive_vector"],
        ),
        r(
            "bank-of-england",
            "INSTANTIATES",
            "bull-ox",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "plassey-eic-sovereignty",
            "INSTANTIATES",
            "bull-ox",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "opium-war",
            "ECHOES",
            "chemist-doctor",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "rhodes-round-table-city",
            "INSTANTIATES",
            "eagle-owl",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "rhodes-round-table-city",
            "ECHOES",
            "lion-jaguar-puma",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "balfour-declaration",
            "SOURCED_FROM",
            "claim-balfour-hidden-hand",
            None,
            &["contested"],
        ),
        r(
            "chatham-cfr",
            "ECHOES",
            "record-keeper",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "ig-farben",
            "ECHOES",
            "chemist-doctor",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "bis",
            "ECHOES",
            "record-keeper",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "nazi-oss-cia-continuum",
            "INSTANTIATES",
            "dog-sheepdog-wolf",
            Some("dominant"),
            &["well_evidenced_inference"],
        ),
        r(
            "mk-ultra-midnight-climax",
            "INSTANTIATES",
            "mind-control-hypnosis",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "in-q-tel",
            "ECHOES",
            "record-keeper",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "dutroux-institutional-failure",
            "SOURCED_FROM",
            "claim-dutroux-extended-network",
            None,
            &["contested"],
        ),
        r(
            "epstein-construct",
            "INSTANTIATES",
            "lion-jaguar-puma",
            Some("dominant"),
            &["documented"],
        ),
        r(
            "epstein-construct",
            "ECHOES",
            "record-keeper",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "epstein-construct",
            "ECHOES",
            "chemist-doctor",
            Some("secondary"),
            &["documented"],
        ),
        r(
            "epstein-construct",
            "SOURCED_FROM",
            "claim-epstein-blackmail-network-extent",
            None,
            &["contested"],
        ),
        r(
            "nygard-complement",
            "INSTANTIATES",
            "frankenstein-failed-experiment",
            Some("dominant"),
            &["documented", "interpretive_vector"],
        ),
        r(
            "nygard-complement",
            "SOURCED_FROM",
            "claim-nygard-symbolic-complement",
            None,
            &["do_not_seed_as_fact"],
        ),
        r(
            "fentanyl-corridor",
            "ECHOES",
            "chemist-doctor",
            Some("secondary"),
            &["documented", "interpretive_vector"],
        ),
        r(
            "rhodes-round-table-city",
            "SOURCED_FROM",
            "claim-society-of-elect-quigley-1891",
            None,
            &["contested"],
        ),
        r(
            "mk-ultra-midnight-climax",
            "SOURCED_FROM",
            "claim-olson-death-contested-causality",
            None,
            &["contested"],
        ),
        r(
            "epstein-construct",
            "SOURCED_FROM",
            "claim-epstein-intelligence-role",
            None,
            &["contested"],
        ),
    ];

    for constellation in constellation_seeds() {
        for member in constellation.members {
            if !relationships.iter().any(|rel| {
                rel.source == *member
                    && rel.target == constellation.slug
                    && rel.rel_type == "RESONATES_WITH"
            }) {
                relationships.push(r(
                    member,
                    "RESONATES_WITH",
                    constellation.slug,
                    None,
                    &["interpretive_vector"],
                ));
            }
        }
    }

    relationships
}

fn r(
    source: &'static str,
    rel_type: &'static str,
    target: &'static str,
    dominance: Option<&'static str>,
    evidence_tags: &'static [&'static str],
) -> RelSeed {
    RelSeed {
        source,
        rel_type,
        target,
        dominance,
        evidence_tags,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        connection::Database,
        repositories::{ConstellationRepository, NodeDocumentMutation, NodeDocumentRepository},
    };

    fn fake_canvas_ids(constellations: &[ConstellationSeed]) -> HashMap<&'static str, String> {
        constellations
            .iter()
            .map(|seed| (seed.slug, format!("canvas:{}", seed.slug)))
            .collect()
    }

    #[test]
    fn real_root_seed_reconciliation_preserves_an_edit_between_seed_runs() {
        let directory = tempfile::tempdir().expect("tempdir");
        let database = Database::open(directory.path().join("seed.sqlite")).expect("database");
        let repo = NodeDocumentRepository::new(database.connection());
        let real_seed = root_archetypal_document_inputs("root")
            .into_iter()
            .next()
            .expect("root seed");
        assert_eq!(
            repo.apply_reconciliation(&real_seed, None).unwrap(),
            NodeDocumentMutation::Created
        );
        assert_eq!(
            repo.apply_user_edit(
                &real_seed.graph_node_id,
                "authored deep reading",
                "authored face",
                1
            )
            .unwrap(),
            NodeDocumentMutation::Updated
        );
        assert_eq!(
            repo.apply_reconciliation(&real_seed, None).unwrap(),
            NodeDocumentMutation::Preserved
        );
        let stored = repo
            .get_node_document(&real_seed.graph_node_id)
            .unwrap()
            .unwrap();
        assert_eq!(stored.body, "authored deep reading");
        assert_eq!(
            stored.content_origin,
            crate::db::repositories::graph::ContentOrigin::UserAuthored
        );
    }

    #[test]
    fn root_seed_materializes_portals_as_real_child_constellations() {
        let directory = tempfile::tempdir().expect("tempdir");
        let database = Database::open(directory.path().join("seed.sqlite")).expect("database");

        let root = ensure_root_archetypal_constellation_workspace(
            database.connection(),
            directory.path().to_str().expect("root path"),
        )
        .expect("root workspace");
        let children = ConstellationRepository::new(database.connection())
            .list_children(&root.constellation_id)
            .expect("child constellations");

        assert_eq!(
            children.len(),
            constellation_seeds().len(),
            "each portal target is a first-class constellation rather than an orphan canvas",
        );
        let devil = children
            .iter()
            .find(|child| child.slug == "devil-sixfold-lineage")
            .expect("devil lineage constellation");
        assert!(devil.primary_canvas_id.is_some());
    }

    fn canvas_sidecar(record: &NodeLayoutRecord) -> serde_json::Value {
        serde_json::from_str::<serde_json::Value>(&record.style_json).expect("style json")
            ["__canvasNode"]
            .clone()
    }

    #[test]
    fn root_ecology_contains_completed_constellations_as_nested_portals() {
        let constellations = constellation_seeds();
        let nodes = node_seeds();
        let canvas_ids = fake_canvas_ids(&constellations);

        let layouts = layout_records("test", "root-canvas", &nodes, &constellations, &canvas_ids);
        let root_ecology_canvas = canvas_ids
            .get("root-ecology")
            .expect("root ecology canvas")
            .as_str();
        let nested = layouts
            .iter()
            .filter(|layout| layout.canvas_id == root_ecology_canvas)
            .collect::<Vec<_>>();

        for (slug, kind) in [
            ("devil-sixfold-lineage", "ql-unit"),
            ("dual-animal-quaternity", "ql-unit"),
            ("conceptual-operations-quaternity", "ql-unit"),
            ("generative-axis", "standard"),
            ("historical-forms", "standard"),
            ("claim-provenance", "standard"),
        ] {
            let layout = nested
                .iter()
                .find(|layout| layout.graph_node_id == format!("test:{slug}"))
                .unwrap_or_else(|| panic!("{slug} appears inside root ecology"));
            let sidecar = canvas_sidecar(layout);
            assert_eq!(sidecar["type"], "portal");
            assert_eq!(sidecar["targetCanvasId"], format!("canvas:{slug}"));
            assert_eq!(sidecar["constellationKind"], kind);
        }
    }

    #[test]
    fn ql_unit_constellations_carry_ql_metadata_without_creating_a_timeline_constellation() {
        let nodes = node_seeds();

        for slug in [
            "ql-position-wheel",
            "ontological-unit",
            "solar-system-unit",
            "social-power-unit",
            "deficiency-unit",
            "devil-sixfold-lineage",
            "christ-sixfold-lineage",
            "double-helix",
            "dual-animal-quaternity",
            "conceptual-operations-quaternity",
        ] {
            let seed = nodes
                .iter()
                .find(|node| node.slug == slug)
                .unwrap_or_else(|| panic!("{slug} seed"));
            assert_eq!(seed.entity_type, "Constellation");
            assert_eq!(seed.source_kind, Some("ql-unit"));
            assert!(seed.evidence_tags.contains(&"ql_unit"));
            assert!(
                seed.source_coordinates
                    .iter()
                    .any(|coord| coord.starts_with('#')),
                "{slug} carries QL position coordinates",
            );
        }

        assert!(
            !nodes.iter().any(|node| {
                node.entity_type == "Constellation"
                    && (node.slug.contains("timeline")
                        || node
                            .source_kind
                            .is_some_and(|kind| kind.eq_ignore_ascii_case("timeline")))
            }),
            "timeline stays a lens over temporal nodes, not a constellation entity",
        );
    }

    #[test]
    fn ql_positioned_seeds_carry_position_markers_and_real_vault_sources() {
        let nodes = node_seeds();
        let ql_positioned = nodes
            .iter()
            .filter(|node| node.evidence_tags.contains(&"ql_positioned"))
            .collect::<Vec<_>>();

        assert!(
            ql_positioned.len() >= 50,
            "source-derived QL layer includes reusable units and leaves",
        );

        for seed in ql_positioned {
            assert!(
                seed.source_coordinates
                    .iter()
                    .any(|coord| coord.starts_with('#')),
                "{} carries a QL position marker",
                seed.slug,
            );
            assert!(
                seed.source_coordinates
                    .iter()
                    .any(|coord| coord.starts_with("antichrist-vault/")),
                "{} cites a real vault source path",
                seed.slug,
            );
        }
    }

    #[test]
    fn root_ecology_contains_the_source_derived_completed_ql_units_as_portals() {
        let constellations = constellation_seeds();
        let nodes = node_seeds();
        let canvas_ids = fake_canvas_ids(&constellations);

        let layouts = layout_records("test", "root-canvas", &nodes, &constellations, &canvas_ids);
        let root_ecology_canvas = canvas_ids
            .get("root-ecology")
            .expect("root ecology canvas")
            .as_str();
        let nested = layouts
            .iter()
            .filter(|layout| layout.canvas_id == root_ecology_canvas)
            .collect::<Vec<_>>();

        for slug in [
            "ql-position-wheel",
            "ontological-unit",
            "solar-system-unit",
            "social-power-unit",
            "deficiency-unit",
            "devil-sixfold-lineage",
            "christ-sixfold-lineage",
            "double-helix",
            "dual-animal-quaternity",
            "conceptual-operations-quaternity",
        ] {
            let layout = nested
                .iter()
                .find(|layout| layout.graph_node_id == format!("test:{slug}"))
                .unwrap_or_else(|| panic!("{slug} appears inside root ecology"));
            let sidecar = canvas_sidecar(layout);
            assert_eq!(sidecar["type"], "portal");
            assert_eq!(sidecar["targetCanvasId"], format!("canvas:{slug}"));
            assert_eq!(sidecar["constellationKind"], "ql-unit");
        }
    }

    #[test]
    fn higher_order_fields_nest_completed_constellations_as_portals() {
        let constellations = constellation_seeds();
        let nodes = node_seeds();
        let canvas_ids = fake_canvas_ids(&constellations);

        let layouts = layout_records("test", "root-canvas", &nodes, &constellations, &canvas_ids);

        for (field_slug, expected_children) in [
            (
                "spectral-lineage-field",
                &[
                    "devil-sixfold-lineage",
                    "christ-sixfold-lineage",
                    "double-helix",
                ][..],
            ),
            (
                "image-system-field",
                &[
                    "generative-axis",
                    "ql-position-wheel",
                    "ontological-unit",
                    "solar-system-unit",
                    "dual-animal-quaternity",
                    "persona-techne-masks",
                ][..],
            ),
            (
                "power-history-field",
                &[
                    "social-power-unit",
                    "deficiency-unit",
                    "conceptual-operations-quaternity",
                    "historical-forms",
                    "claim-provenance",
                ][..],
            ),
        ] {
            let field_canvas = canvas_ids
                .get(field_slug)
                .unwrap_or_else(|| panic!("{field_slug} canvas"))
                .as_str();
            let nested = layouts
                .iter()
                .filter(|layout| layout.canvas_id == field_canvas)
                .collect::<Vec<_>>();

            for child_slug in expected_children {
                let layout = nested
                    .iter()
                    .find(|layout| layout.graph_node_id == format!("test:{child_slug}"))
                    .unwrap_or_else(|| panic!("{child_slug} appears inside {field_slug}"));
                let sidecar = canvas_sidecar(layout);
                assert_eq!(sidecar["type"], "portal");
                assert_eq!(sidecar["targetCanvasId"], format!("canvas:{child_slug}"));
            }
        }
    }

    #[test]
    fn historical_forms_members_are_temporal_and_source_tagged_for_timeline_lens() {
        let constellations = constellation_seeds();
        let nodes = node_seeds();
        let node_by_slug = nodes
            .iter()
            .map(|node| (node.slug, node))
            .collect::<HashMap<_, _>>();
        let historical = constellations
            .iter()
            .find(|seed| seed.slug == "historical-forms")
            .expect("historical forms constellation");

        assert!(
            historical.members.len() >= 20,
            "historical forms carries the source-derived temporal table, not a demo slice",
        );

        for slug in historical.members {
            let node = node_by_slug
                .get(slug)
                .unwrap_or_else(|| panic!("{slug} historical node"));
            assert!(node.is_temporal, "{slug} appears through the timeline lens");
            assert!(node.valid_from.is_some(), "{slug} has a timeline anchor",);
            assert!(
                node.source_coordinates
                    .iter()
                    .any(|coord| coord == &TIMELINE_SOURCE),
                "{slug} cites the Episode 2 timeline source",
            );
        }
    }

    #[test]
    fn claim_nodes_remain_provenance_not_factual_historical_edges() {
        let nodes = node_seeds();
        let relationships = relationship_seeds();

        let claims = nodes
            .iter()
            .filter(|node| node.source_kind == Some("claim"))
            .collect::<Vec<_>>();
        assert!(
            claims.len() >= 12,
            "seed preserves the report's do-not-flatten claims as provenance nodes",
        );

        for seed in claims {
            assert_eq!(seed.entity_type, "Claim");
            assert_eq!(seed.source_kind, Some("claim"));
            assert!(
                seed.evidence_tags
                    .iter()
                    .any(|tag| *tag == "contested" || *tag == "do_not_seed_as_fact"),
                "{} is explicitly evidence-disciplined",
                seed.slug,
            );
        }

        assert!(
            relationships.iter().all(|rel| {
                !rel.source.starts_with("claim-")
                    || !matches!(rel.rel_type, "INSTANTIATES" | "CAUSES" | "INFLUENCES")
            }),
            "claim nodes must not become factual historical operators",
        );
    }
}
