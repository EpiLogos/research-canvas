-- Attachment usage is an independently mutable relation, so protect it on
-- UPDATE as well as INSERT. This keeps direct SQLite callers from turning an
-- image identity into a file usage after it has been created.
CREATE TRIGGER IF NOT EXISTS node_attachment_usage_kind_update_guard
BEFORE UPDATE OF attachment_id, role ON node_attachment_usage
WHEN (NEW.role = 'file' AND (SELECT kind FROM node_attachment WHERE id = NEW.attachment_id) <> 'file')
  OR (NEW.role IN ('inline', 'cover') AND (SELECT kind FROM node_attachment WHERE id = NEW.attachment_id) <> 'image')
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and usage role are incompatible');
END;

-- A canonical cover is only valid for its owning graph node and only after
-- that image has explicitly been declared usable as a cover. Keeping this
-- invariant in SQLite prevents repository-bypassing writes from making the
-- reader and canvas disagree about presentation state.
CREATE TRIGGER IF NOT EXISTS node_attachment_presentation_insert_guard
BEFORE INSERT ON node_attachment_presentation
WHEN (SELECT graph_node_id FROM node_attachment WHERE id = NEW.cover_attachment_id) <> NEW.graph_node_id
  OR NOT EXISTS (
      SELECT 1
      FROM node_attachment_usage
      WHERE attachment_id = NEW.cover_attachment_id
        AND role = 'cover'
  )
BEGIN
    SELECT RAISE(ABORT, 'presentation cover must belong to its graph node and have cover usage');
END;

CREATE TRIGGER IF NOT EXISTS node_attachment_presentation_update_guard
BEFORE UPDATE OF graph_node_id, cover_attachment_id ON node_attachment_presentation
WHEN (SELECT graph_node_id FROM node_attachment WHERE id = NEW.cover_attachment_id) <> NEW.graph_node_id
  OR NOT EXISTS (
      SELECT 1
      FROM node_attachment_usage
      WHERE attachment_id = NEW.cover_attachment_id
        AND role = 'cover'
  )
BEGIN
    SELECT RAISE(ABORT, 'presentation cover must belong to its graph node and have cover usage');
END;
