-- Surface-layer movement streams (refinement-2 D2, ticket #19): derived
-- geography edges between Temporal Place graph nodes (VOC Amsterdam→Banda,
-- Rhodes's Oxford↔Kimberley journeys, Rudolf II's Vienna→Prague court move,
-- the Cult of Reason's intra-Paris events). Geography edges are NOT new
-- substrate relationship types or node categories — they are profile-scoped
-- surface records next to scenes and street-view imagery, seeded from the
-- corpus with passage-level provenance.
CREATE TABLE IF NOT EXISTS geography_edges (
    id TEXT PRIMARY KEY NOT NULL,
    profile_scope TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('flight','shipping','overland','inland_water')),
    source_place_id TEXT NOT NULL,
    target_place_id TEXT NOT NULL,
    label TEXT NOT NULL,
    time_window_json TEXT NOT NULL CHECK (json_valid(time_window_json) AND json_type(time_window_json) = 'object'),
    geometry_json TEXT NOT NULL CHECK (json_valid(geometry_json) AND json_type(geometry_json) = 'object'),
    provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json) AND json_type(provenance_json) = 'object'),
    seed_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_geography_edges_profile_scope
    ON geography_edges(profile_scope);
-- Idempotent corpus seeding: seedKey is stable per lane, so the same seed run
-- can never write the same lane twice for a profile.
CREATE UNIQUE INDEX IF NOT EXISTS idx_geography_edges_profile_seed_key
    ON geography_edges(profile_scope, seed_key);
