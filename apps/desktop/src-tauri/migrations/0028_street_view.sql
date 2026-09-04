-- Street-view imagery core (vision §3.9/§3.13, research findings §2): own
-- captured/imported fieldwork imagery is the privacy-safe base; Mapillary is
-- an explicit live opt-in, never a default. Artifact paths are portable
-- relative paths inside the media root — absolute paths and traversal are
-- rejected at the repository boundary.
CREATE TABLE IF NOT EXISTS street_view_images (
    id TEXT PRIMARY KEY NOT NULL,
    profile_scope TEXT NOT NULL,
    artifact_path TEXT NOT NULL,
    captured_at TEXT,
    latitude REAL,
    longitude REAL,
    heading_degrees REAL,
    redaction_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (redaction_status IN ('pending','redacted','none_needed')),
    redaction_regions_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(redaction_regions_json) AND json_type(redaction_regions_json) = 'array'),
    redacted_artifact_path TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_street_view_profile_scope ON street_view_images(profile_scope);

CREATE TRIGGER IF NOT EXISTS trg_street_view_regions_insert
BEFORE INSERT ON street_view_images
WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.redaction_regions_json)
    WHERE json_type(value) <> 'object'
)
BEGIN
  SELECT RAISE(ABORT, 'street view redaction regions must be JSON objects');
END;

CREATE TRIGGER IF NOT EXISTS trg_street_view_regions_update
BEFORE UPDATE OF redaction_regions_json ON street_view_images
WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.redaction_regions_json)
    WHERE json_type(value) <> 'object'
)
BEGIN
  SELECT RAISE(ABORT, 'street view redaction regions must be JSON objects');
END;
