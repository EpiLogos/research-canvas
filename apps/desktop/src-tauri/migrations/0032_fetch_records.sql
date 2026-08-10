-- Fetch records (refinement-2 D3, ticket #20): the deterministic provenance
-- record written by `rc-asset ingest`, the app-side gate for agent-gathered
-- imagery. One row per ingest attempt (accepted OR rejected); accepted rows
-- link to the street-view image they registered through `street_view_image_id`
-- and carry the place / walk / scene association the agent supplied.
-- Artifact paths are portable relative paths inside the media root; an empty
-- `artifact_path` marks a rejected attempt whose bytes were never imported.
CREATE TABLE IF NOT EXISTS fetch_records (
    id TEXT PRIMARY KEY NOT NULL,
    profile_scope TEXT NOT NULL,
    agent_session_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    license TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    validation_json TEXT NOT NULL
        CHECK (json_valid(validation_json) AND json_type(validation_json) = 'object'),
    content_hash TEXT NOT NULL,
    artifact_path TEXT NOT NULL DEFAULT '',
    redaction_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (redaction_status IN ('pending','redacted','none_needed')),
    street_view_image_id TEXT,
    place_id TEXT,
    walk_id TEXT,
    scene_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_fetch_records_profile_scope
    ON fetch_records(profile_scope);
CREATE INDEX IF NOT EXISTS idx_fetch_records_agent_session
    ON fetch_records(agent_session_id);
CREATE INDEX IF NOT EXISTS idx_fetch_records_place
    ON fetch_records(place_id);
-- Idempotent re-ingest for ACCEPTED records: the same agent session ingesting
-- the same source bytes under the same URL never writes a second row or a
-- second street-view image. Rejected attempts (`artifact_path = ''`) stay
-- unique-per-retry so a corrected re-ingest can still land.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fetch_records_accepted_dedup
    ON fetch_records(agent_session_id, source_url, content_hash)
    WHERE artifact_path <> '';
