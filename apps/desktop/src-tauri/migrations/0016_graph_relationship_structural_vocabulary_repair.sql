-- 0015 shipped with a deliberately narrow relationship CHECK constraint.
-- SQLite cannot alter a CHECK constraint in place, so rebuild its local
-- projection atomically. Every existing relationship column is copied
-- verbatim; the only semantic change is the shared vocabulary below.
DROP TRIGGER IF EXISTS trg_graph_relationship_string_arrays_insert;
DROP TRIGGER IF EXISTS trg_graph_relationship_string_arrays_update;
DROP INDEX IF EXISTS idx_graph_relationship_source;
DROP INDEX IF EXISTS idx_graph_relationship_target;
DROP INDEX IF EXISTS idx_graph_relationship_type;
DROP INDEX IF EXISTS idx_graph_relationship_sync;

ALTER TABLE graph_relationship RENAME TO graph_relationship_0015_legacy;

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
    updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO graph_relationship (
    relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
    properties_json, source_coordinates_json, evidence_tags_json, origin,
    sync_state, relationship_revision, remote_revision, created_at, updated_at
)
SELECT
    relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
    properties_json, source_coordinates_json, evidence_tags_json, origin,
    sync_state, relationship_revision, remote_revision, created_at, updated_at
FROM graph_relationship_0015_legacy;

DROP TABLE graph_relationship_0015_legacy;

CREATE INDEX idx_graph_relationship_source ON graph_relationship(source_graph_node_id);
CREATE INDEX idx_graph_relationship_target ON graph_relationship(target_graph_node_id);
CREATE INDEX idx_graph_relationship_type ON graph_relationship(rel_type);
CREATE INDEX idx_graph_relationship_sync ON graph_relationship(sync_state, relationship_revision);

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
