-- Task 6 (ticket #27): constellation ingestion + the ONE deliberate substrate
-- relation ENCAPSULATES (refinement-2 D12).
--
-- Two changes land together so a workspace migrates atomically:
--
-- 1. The local graph_relationship projection gains ENCAPSULATES. The shared
--    relationship vocabulary (relationship_vocabulary.rs) is the authority;
--    SQLite cannot alter a CHECK constraint in place, so rebuild the table
--    exactly as 0016 did, with the placeholder substituted at migration time
--    from the canonical vocabulary so the three boundaries cannot drift.
--
-- 2. A `constellations` metadata table. Projects ARE constellations (task #24,
--    D7) — the `projects` row is the ingestion context and this table augments
--    it with the constellation's substance: kind, flexible QL shape, time /
--    place / file metadata, assembly provenance, and curation events.

DROP TRIGGER IF EXISTS trg_graph_relationship_string_arrays_insert;
DROP TRIGGER IF EXISTS trg_graph_relationship_string_arrays_update;
DROP INDEX IF EXISTS idx_graph_relationship_source;
DROP INDEX IF EXISTS idx_graph_relationship_target;
DROP INDEX IF EXISTS idx_graph_relationship_type;
DROP INDEX IF EXISTS idx_graph_relationship_sync;

ALTER TABLE graph_relationship RENAME TO graph_relationship_0032_legacy;

CREATE TABLE graph_relationship (
    relationship_id          TEXT PRIMARY KEY NOT NULL CHECK (length(trim(relationship_id)) > 0),
    source_graph_node_id     TEXT NOT NULL REFERENCES graph_node_metadata(graph_node_id) ON DELETE CASCADE,
    target_graph_node_id     TEXT NOT NULL REFERENCES graph_node_metadata(graph_node_id) ON DELETE CASCADE,
    rel_type                 TEXT NOT NULL CHECK (rel_type IN (__RELATIONSHIP_TYPES__)),
    properties_json          TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(properties_json) AND json_type(properties_json) = 'object'),
    source_coordinates_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_coordinates_json) AND json_type(source_coordinates_json) = 'array'),
    evidence_tags_json       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_tags_json) AND json_type(evidence_tags_json) = 'array'),
    origin                   TEXT NOT NULL CHECK (origin IN ('seed','corpus_compiled','user_authored','imported')),
    sync_state               TEXT NOT NULL CHECK (sync_state IN ('pending','synced','conflict')),
    relationship_revision    INTEGER NOT NULL CHECK (relationship_revision BETWEEN 0 AND 9007199254740991),
    remote_revision          INTEGER CHECK (remote_revision BETWEEN 0 AND 9007199254740991),
    created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    is_tombstone             INTEGER NOT NULL DEFAULT 0 CHECK (is_tombstone IN (0, 1))
);

INSERT INTO graph_relationship (
    relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
    properties_json, source_coordinates_json, evidence_tags_json, origin,
    sync_state, relationship_revision, remote_revision, created_at, updated_at,
    is_tombstone
)
SELECT
    relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
    properties_json, source_coordinates_json, evidence_tags_json, origin,
    sync_state, relationship_revision, remote_revision, created_at, updated_at,
    is_tombstone
FROM graph_relationship_0032_legacy;

DROP TABLE graph_relationship_0032_legacy;

CREATE INDEX idx_graph_relationship_source ON graph_relationship(source_graph_node_id);
CREATE INDEX idx_graph_relationship_target ON graph_relationship(target_graph_node_id);
CREATE INDEX idx_graph_relationship_type ON graph_relationship(rel_type);
CREATE INDEX idx_graph_relationship_sync ON graph_relationship(sync_state, relationship_revision);
CREATE INDEX idx_graph_relationship_tombstone
    ON graph_relationship(is_tombstone, sync_state, relationship_revision);

CREATE TRIGGER trg_graph_relationship_string_arrays_insert
BEFORE INSERT ON graph_relationship
WHEN EXISTS (SELECT 1 FROM json_each(NEW.source_coordinates_json) WHERE type <> 'text')
  OR EXISTS (SELECT 1 FROM json_each(NEW.evidence_tags_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'graph relationship vector JSON elements must be strings');
END;

CREATE TRIGGER trg_graph_relationship_string_arrays_update
BEFORE UPDATE OF source_coordinates_json, evidence_tags_json ON graph_relationship
WHEN EXISTS (SELECT 1 FROM json_each(NEW.source_coordinates_json) WHERE type <> 'text')
  OR EXISTS (SELECT 1 FROM json_each(NEW.evidence_tags_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'graph relationship vector JSON elements must be strings');
END;

-- Constellation substance (task #27). The id IS the project/constellation row
-- id (projects are constellations). Flexible parts (metadata, assembly,
-- curation) are JSON so living partial QL shapes never force a rigid mod-6
-- schema.
CREATE TABLE IF NOT EXISTS constellations (
    id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    profile_scope TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('episode','document','conceptual')),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_constellation_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
    assembly_json TEXT NOT NULL CHECK (json_valid(assembly_json) AND json_type(assembly_json) = 'object'),
    curation_events_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(curation_events_json) AND json_type(curation_events_json) = 'array'),
    seed_key TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_constellations_profile_scope
    ON constellations(profile_scope);

CREATE UNIQUE INDEX IF NOT EXISTS idx_constellations_profile_seed_key
    ON constellations(profile_scope, seed_key)
    WHERE seed_key IS NOT NULL;
