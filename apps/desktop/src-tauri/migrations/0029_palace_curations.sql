-- Mind-palace curation persistence (vision §3.12, ticket #4): authoring is
-- curation, not construction — pin/exclude/rename/reorder live in a separate
-- layer over the derived chamber candidates; the raw graph is never touched.
-- The curation payload is a validated JSON object in the profile store.
CREATE TABLE IF NOT EXISTS palace_curations (
    profile_scope TEXT PRIMARY KEY NOT NULL,
    curation_json TEXT NOT NULL
        CHECK (json_valid(curation_json) AND json_type(curation_json) = 'object'),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
