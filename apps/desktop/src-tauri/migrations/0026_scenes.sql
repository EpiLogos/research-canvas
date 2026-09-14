-- Profile-level scene units and scene sequences (vision §3.7/§3.15, locked by
-- ticket #10). Scenes are patterns over substrate nodes and passages, never
-- a new locked category: place frame, time window, people, passages, derived
-- language variants, and curation events are stored as validated JSON so the
-- shared TS zod contract stays the single semantic authority at the boundary.
CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY NOT NULL,
    profile_scope TEXT NOT NULL,
    place_frame_json TEXT NOT NULL CHECK (json_valid(place_frame_json) AND json_type(place_frame_json) = 'object'),
    time_window_json TEXT NOT NULL CHECK (json_valid(time_window_json) AND json_type(time_window_json) = 'object'),
    people_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(people_json) AND json_type(people_json) = 'array'),
    passages_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(passages_json) AND json_type(passages_json) = 'array'),
    language_variants_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(language_variants_json) AND json_type(language_variants_json) = 'array'),
    title TEXT,
    narration TEXT,
    assembled_by TEXT NOT NULL CHECK (assembled_by IN ('agent','human')),
    curation_events_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(curation_events_json) AND json_type(curation_events_json) = 'array'),
    nested_sequence_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(nested_sequence_ids_json) AND json_type(nested_sequence_ids_json) = 'array'),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_scenes_profile_scope ON scenes(profile_scope);

CREATE TABLE IF NOT EXISTS scene_sequences (
    id TEXT PRIMARY KEY NOT NULL,
    profile_scope TEXT NOT NULL,
    name TEXT,
    scene_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scene_ids_json) AND json_type(scene_ids_json) = 'array'),
    sub_timeline_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_scene_sequences_profile_scope ON scene_sequences(profile_scope);

CREATE TRIGGER IF NOT EXISTS trg_scenes_string_arrays_insert
BEFORE INSERT ON scenes
WHEN EXISTS (SELECT 1 FROM json_each(NEW.nested_sequence_ids_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'scene nested sequence ids must be strings');
END;

CREATE TRIGGER IF NOT EXISTS trg_scenes_string_arrays_update
BEFORE UPDATE OF nested_sequence_ids_json ON scenes
WHEN EXISTS (SELECT 1 FROM json_each(NEW.nested_sequence_ids_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'scene nested sequence ids must be strings');
END;

CREATE TRIGGER IF NOT EXISTS trg_scene_sequences_string_arrays_insert
BEFORE INSERT ON scene_sequences
WHEN EXISTS (SELECT 1 FROM json_each(NEW.scene_ids_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'scene sequence scene ids must be strings');
END;

CREATE TRIGGER IF NOT EXISTS trg_scene_sequences_string_arrays_update
BEFORE UPDATE OF scene_ids_json ON scene_sequences
WHEN EXISTS (SELECT 1 FROM json_each(NEW.scene_ids_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'scene sequence scene ids must be strings');
END;
