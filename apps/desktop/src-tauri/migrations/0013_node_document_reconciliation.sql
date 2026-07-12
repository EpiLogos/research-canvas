-- Ownership and optimistic revision for the authoritative local document.
-- Existing rows predate provenance tracking, so they are honestly classified
-- as imported revision zero; their content and timestamps remain untouched.
ALTER TABLE node_document ADD COLUMN content_origin TEXT NOT NULL DEFAULT 'imported'
    CHECK (content_origin IN ('seed','corpus_compiled','user_authored','imported'));
ALTER TABLE node_document ADD COLUMN content_revision INTEGER NOT NULL DEFAULT 0
    CHECK (content_revision BETWEEN 0 AND 9007199254740991);
ALTER TABLE node_document ADD COLUMN body_source_coordinates_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(body_source_coordinates_json) AND json_type(body_source_coordinates_json) = 'array');

CREATE TRIGGER trg_node_document_source_strings_insert
BEFORE INSERT ON node_document
WHEN EXISTS (SELECT 1 FROM json_each(NEW.body_source_coordinates_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'node document source coordinates must be strings');
END;

CREATE TRIGGER trg_node_document_source_strings_update
BEFORE UPDATE OF body_source_coordinates_json ON node_document
WHEN EXISTS (SELECT 1 FROM json_each(NEW.body_source_coordinates_json) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'node document source coordinates must be strings');
END;
