-- A presentation row depends on the selected attachment retaining a `cover`
-- usage. Guard mutations of that dependent relation as well as writes to the
-- presentation table itself; otherwise direct SQLite callers could leave a
-- canonical cover pointing at an attachment with no valid cover role.
CREATE TRIGGER IF NOT EXISTS node_attachment_usage_selected_cover_delete_guard
BEFORE DELETE ON node_attachment_usage
WHEN OLD.role = 'cover'
  AND EXISTS (
      SELECT 1
      FROM node_attachment_presentation
      WHERE cover_attachment_id = OLD.attachment_id
  )
BEGIN
    SELECT RAISE(ABORT, 'selected presentation cover usage cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS node_attachment_usage_selected_cover_update_guard
BEFORE UPDATE OF attachment_id, role ON node_attachment_usage
WHEN EXISTS (
      SELECT 1
      FROM node_attachment_presentation
      WHERE cover_attachment_id = OLD.attachment_id
  )
  AND (NEW.attachment_id <> OLD.attachment_id OR NEW.role <> 'cover')
BEGIN
    SELECT RAISE(ABORT, 'selected presentation cover usage must remain on its attachment with cover role');
END;

-- The selected attachment itself must retain the graph-node ownership named
-- by its presentation row. Unselected attachments remain freely movable.
CREATE TRIGGER IF NOT EXISTS node_attachment_selected_cover_owner_update_guard
BEFORE UPDATE OF graph_node_id ON node_attachment
WHEN NEW.graph_node_id <> OLD.graph_node_id
  AND EXISTS (
      SELECT 1
      FROM node_attachment_presentation
      WHERE cover_attachment_id = OLD.id
  )
BEGIN
    SELECT RAISE(ABORT, 'selected presentation cover cannot move to another graph node');
END;
