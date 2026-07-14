-- One durable, canonical cover selection per graph node. A layout thumbnail
-- is merely presentation state; this table survives canvas changes and lets
-- the reader and every canvas resolve the same cover after a restart.
CREATE TABLE IF NOT EXISTS node_attachment_presentation (
    graph_node_id      TEXT PRIMARY KEY NOT NULL,
    cover_attachment_id TEXT NOT NULL REFERENCES node_attachment(id) ON DELETE RESTRICT,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_node_attachment_presentation_cover
    ON node_attachment_presentation(cover_attachment_id);

-- `kind` describes the bytes and `role` describes their permitted surface.
-- Keep this in SQLite as well as the command validation so a future direct
-- repository caller cannot turn image identity into an arbitrary file link.
CREATE TRIGGER IF NOT EXISTS node_attachment_kind_role_insert_guard
BEFORE INSERT ON node_attachment
WHEN (NEW.kind = 'image' AND NEW.role = 'file')
  OR (NEW.kind = 'file' AND NEW.role <> 'file')
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and primary role are incompatible');
END;

CREATE TRIGGER IF NOT EXISTS node_attachment_kind_role_update_guard
BEFORE UPDATE OF kind, role ON node_attachment
WHEN (NEW.kind = 'image' AND NEW.role = 'file')
  OR (NEW.kind = 'file' AND NEW.role <> 'file')
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and primary role are incompatible');
END;

CREATE TRIGGER IF NOT EXISTS node_attachment_usage_kind_insert_guard
BEFORE INSERT ON node_attachment_usage
WHEN (NEW.role = 'file' AND (SELECT kind FROM node_attachment WHERE id = NEW.attachment_id) <> 'file')
  OR (NEW.role IN ('inline', 'cover') AND (SELECT kind FROM node_attachment WHERE id = NEW.attachment_id) <> 'image')
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and usage role are incompatible');
END;

-- Preserve already-intended covers from the first attachment schema. New
-- writes always use the repository selector below; this one-time upgrade
-- chooses the oldest declared cover deterministically when legacy rows have
-- more than one cover usage.
INSERT INTO node_attachment_presentation(graph_node_id, cover_attachment_id)
SELECT DISTINCT candidate.graph_node_id,
       (
           SELECT selected.id
           FROM node_attachment AS selected
           JOIN node_attachment_usage AS selected_usage
             ON selected_usage.attachment_id = selected.id
           WHERE selected.graph_node_id = candidate.graph_node_id
             AND selected.kind = 'image'
             AND selected_usage.role = 'cover'
           ORDER BY selected.created_at ASC, selected.id ASC
           LIMIT 1
       )
FROM node_attachment AS candidate
JOIN node_attachment_usage AS usage
  ON usage.attachment_id = candidate.id
WHERE candidate.kind = 'image'
  AND usage.role = 'cover'
ON CONFLICT(graph_node_id) DO NOTHING;
