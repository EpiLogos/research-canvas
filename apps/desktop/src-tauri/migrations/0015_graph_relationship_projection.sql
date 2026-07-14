-- Durable local projection of semantic graph relationships. This lets the
-- timeline and desktop bridge retain meaningful links when Neo4j is offline,
-- without treating the timeline as a constellation canvas.
CREATE TABLE IF NOT EXISTS graph_relationship (
    relationship_id          TEXT PRIMARY KEY NOT NULL CHECK (length(trim(relationship_id)) > 0),
    source_graph_node_id     TEXT NOT NULL REFERENCES graph_node_metadata(graph_node_id) ON DELETE CASCADE,
    target_graph_node_id     TEXT NOT NULL REFERENCES graph_node_metadata(graph_node_id) ON DELETE CASCADE,
    rel_type                 TEXT NOT NULL CHECK (rel_type IN (
        'INSTANTIATES','ECHOES','CAUSES','INFLUENCES','OPPOSES','INHERITS',
        'TRANSFORMS_INTO','LOCATED_AT','SOURCED_FROM','RESONATES_WITH'
    )),
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

CREATE INDEX IF NOT EXISTS idx_graph_relationship_source ON graph_relationship(source_graph_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_relationship_target ON graph_relationship(target_graph_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_relationship_type ON graph_relationship(rel_type);
CREATE INDEX IF NOT EXISTS idx_graph_relationship_sync ON graph_relationship(sync_state, relationship_revision);

CREATE TRIGGER IF NOT EXISTS trg_graph_relationship_string_arrays_insert
BEFORE INSERT ON graph_relationship
WHEN EXISTS (SELECT 1 FROM json_each(NEW.source_coordinates_json) WHERE type <> 'text')
  OR EXISTS (SELECT 1 FROM json_each(NEW.evidence_tags_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'graph relationship vector JSON elements must be strings');
END;

CREATE TRIGGER IF NOT EXISTS trg_graph_relationship_string_arrays_update
BEFORE UPDATE OF source_coordinates_json, evidence_tags_json ON graph_relationship
WHEN EXISTS (SELECT 1 FROM json_each(NEW.source_coordinates_json) WHERE type <> 'text')
  OR EXISTS (SELECT 1 FROM json_each(NEW.evidence_tags_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'graph relationship vector JSON elements must be strings');
END;
