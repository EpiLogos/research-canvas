-- Authoritative local projection of graph substance. A SQLite database is a
-- workspace boundary, so graph_node_id is intentionally the local primary key:
-- legacy `projects` rows are constellations, not workspaces.
-- Long-form body and face summary remain authoritative in `node_document` and
-- join through graph_node_id. This migration never manufactures document rows.
CREATE TABLE IF NOT EXISTS graph_node_metadata (
    graph_node_id              TEXT PRIMARY KEY NOT NULL,
    entity_type                TEXT NOT NULL CHECK (entity_type IN ('Figure','People','Event','Institution','Source','Claim','Myth','Interpretation','Place','Work','Archetype','Dynamic','Constellation','PsychoidOperator')),
    title                      TEXT NOT NULL,
    archetypal_resonance       TEXT,
    coordinate                 TEXT,
    source_coordinates_json    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_coordinates_json)),
    evidence_tags_json         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_tags_json)),
    source_kind                TEXT,
    content_origin             TEXT NOT NULL CHECK (content_origin IN ('seed','corpus_compiled','user_authored','imported')),
    content_revision           INTEGER NOT NULL CHECK (content_revision BETWEEN 0 AND 9007199254740991),
    seed_schema_version        INTEGER CHECK (seed_schema_version BETWEEN 0 AND 9007199254740991),
    body_source_coordinates_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(body_source_coordinates_json)),
    historicity                TEXT CHECK (historicity IS NULL OR historicity IN ('historical','mythic','literary','theoretical','mixed')),
    claim_kind                 TEXT CHECK (claim_kind IS NULL OR claim_kind IN ('fact','inference','interpretation','allegation','hypothesis','symbolic_parallel')),
    evidence_status            TEXT CHECK (evidence_status IS NULL OR evidence_status IN ('documented','well_evidenced_inference','interpretive','contested','alleged','unverified','disproven')),
    temporal_role              TEXT CHECK (temporal_role IS NULL OR temporal_role IN ('occurred_at','active_during','source_published_at','claim_about_time','myth_located_at')),
    place_coverage             TEXT CHECK (place_coverage IS NULL OR place_coverage IN ('resolved','unknown','not_applicable')),
    ql_form                    TEXT CHECK (ql_form IS NULL OR ql_form IN ('complete_sixfold','partial_positional_map','quaternity','position_wheel','double_helix','other_explicit')),
    ql_unit_id                 TEXT,
    ql_arc                     TEXT CHECK (ql_arc IS NULL OR ql_arc IN ('day','night','braided','not_applicable')),
    ql_topology                TEXT CHECK (ql_topology IS NULL OR ql_topology IN ('torus','klein','lemniscatic','composite','unspecified')),
    ql_schema_version          INTEGER CHECK (ql_schema_version BETWEEN 0 AND 9007199254740991),
    ql_source_coordinates_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ql_source_coordinates_json)),
    ql_completeness_status     TEXT CHECK (ql_completeness_status IS NULL OR ql_completeness_status IN ('complete','partial','incomplete','not_applicable')),
    is_temporal                INTEGER NOT NULL DEFAULT 0 CHECK (is_temporal IN (0,1)),
    valid_from                 TEXT,
    valid_to                   TEXT,
    temporal_precision         TEXT CHECK (temporal_precision IS NULL OR temporal_precision IN ('millennium','century','decade','year','month','day')),
    schema_version             INTEGER NOT NULL CHECK (schema_version BETWEEN 0 AND 9007199254740991),
    sync_state                 TEXT NOT NULL CHECK (sync_state IN ('pending','synced','conflict')),
    remote_revision            INTEGER CHECK (remote_revision BETWEEN 0 AND 9007199254740991),
    created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_graph_node_metadata_temporal ON graph_node_metadata(is_temporal, valid_from);
CREATE INDEX IF NOT EXISTS idx_graph_node_metadata_entity_type ON graph_node_metadata(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_node_metadata_sync_state ON graph_node_metadata(sync_state);
