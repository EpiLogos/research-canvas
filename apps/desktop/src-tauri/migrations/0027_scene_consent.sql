-- Passage-level consent and redaction artifacts (vision §3.13, ticket #8):
-- derived objects scoped to passages, stored as validated JSON arrays so the
-- shared TS zod contract stays the semantic authority at the boundary.
ALTER TABLE scenes
  ADD COLUMN consents_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(consents_json) AND json_type(consents_json) = 'array');
ALTER TABLE scenes
  ADD COLUMN redactions_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(redactions_json) AND json_type(redactions_json) = 'array');
