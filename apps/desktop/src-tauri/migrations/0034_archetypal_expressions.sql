-- Task 8 (ticket #32): archetypal expressions.
--
-- SQLite holds the lightweight local projection of archetypal expressions so the
-- canvas/timeline surfaces can render the spectral heatmap without opening Neo4j.
-- Full graph substance (provenance, source coordinates, relationships) remains
-- in Neo4j; this table is a read-only bookmark for fast layout queries.

CREATE TABLE IF NOT EXISTS archetypal_expressions (
    id                      TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
    archetype_graph_node_id TEXT NOT NULL REFERENCES graph_node_metadata(graph_node_id) ON DELETE CASCADE,
    place_graph_node_id     TEXT REFERENCES graph_node_metadata(graph_node_id) ON DELETE SET NULL,
    time_window_start       TEXT,
    time_window_end         TEXT,
    time_window_precision   TEXT CHECK (time_window_precision IN ('millennium','century','decade','year','month','day','instant','unspecified')),
    expression_kind         TEXT NOT NULL CHECK (expression_kind IN ('mythic','ritual','literary','theoretical','visual','sonic',' embodied')),
    source_coordinates_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_coordinates_json) AND json_type(source_coordinates_json) = 'array'),
    provenance_json         TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
    origin                  TEXT NOT NULL CHECK (origin IN ('seed','corpus_compiled','user_authored','imported')),
    sync_state              TEXT NOT NULL CHECK (sync_state IN ('pending','synced','conflict')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_archetypal_expressions_archetype
    ON archetypal_expressions(archetype_graph_node_id);

CREATE INDEX IF NOT EXISTS idx_archetypal_expressions_place
    ON archetypal_expressions(place_graph_node_id);

CREATE INDEX IF NOT EXISTS idx_archetypal_expressions_window
    ON archetypal_expressions(time_window_start, time_window_end);
