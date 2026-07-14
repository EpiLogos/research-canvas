-- The attachment's primary role is its byte class, not an incidental first
-- presentation usage. Inline/cover/file remain independently durable rows in
-- node_attachment_usage. Rebuild the three small attachment tables so SQLite
-- itself can require image/image and file/file primary records.
DROP TRIGGER IF EXISTS node_attachment_kind_role_insert_guard;
DROP TRIGGER IF EXISTS node_attachment_kind_role_update_guard;
DROP TRIGGER IF EXISTS node_attachment_usage_kind_insert_guard;
DROP TRIGGER IF EXISTS node_attachment_usage_kind_update_guard;
DROP TRIGGER IF EXISTS node_attachment_presentation_insert_guard;
DROP TRIGGER IF EXISTS node_attachment_presentation_update_guard;
DROP TRIGGER IF EXISTS node_attachment_usage_selected_cover_delete_guard;
DROP TRIGGER IF EXISTS node_attachment_usage_selected_cover_update_guard;
DROP TRIGGER IF EXISTS node_attachment_selected_cover_owner_update_guard;
DROP TRIGGER IF EXISTS node_attachment_primary_kind_usage_update_guard;

CREATE TABLE node_attachment_rebuilt (
    id                     TEXT PRIMARY KEY NOT NULL,
    graph_node_id          TEXT NOT NULL,
    managed_path           TEXT NOT NULL UNIQUE,
    original_filename      TEXT NOT NULL,
    mime_type              TEXT NOT NULL,
    kind                   TEXT NOT NULL CHECK (kind IN ('image','file')),
    content_hash           TEXT NOT NULL,
    caption                TEXT NOT NULL DEFAULT '',
    role                   TEXT NOT NULL CHECK (role IN ('image','file')),
    provenance_source_path TEXT NOT NULL,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    UNIQUE(graph_node_id, content_hash)
);

-- Repair every historic image/inline, image/cover, and image/file primary
-- value. Usage rows retain their actual presentation semantics below.
INSERT INTO node_attachment_rebuilt(
    id,graph_node_id,managed_path,original_filename,mime_type,kind,content_hash,
    caption,role,provenance_source_path,created_at,updated_at
)
SELECT id,graph_node_id,managed_path,original_filename,mime_type,kind,content_hash,
       caption,
       CASE kind WHEN 'image' THEN 'image' ELSE 'file' END,
       provenance_source_path,created_at,updated_at
FROM node_attachment;

CREATE TABLE node_attachment_usage_stage (
    attachment_id TEXT NOT NULL,
    role          TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
INSERT INTO node_attachment_usage_stage(attachment_id,role,created_at)
SELECT attachment_id,role,created_at FROM node_attachment_usage;

CREATE TABLE node_attachment_presentation_stage (
    graph_node_id       TEXT PRIMARY KEY NOT NULL,
    cover_attachment_id TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
INSERT INTO node_attachment_presentation_stage(graph_node_id,cover_attachment_id,updated_at)
SELECT graph_node_id,cover_attachment_id,updated_at FROM node_attachment_presentation;

DROP TABLE node_attachment_presentation;
DROP TABLE node_attachment_usage;
DROP TABLE node_attachment;
ALTER TABLE node_attachment_rebuilt RENAME TO node_attachment;

CREATE TABLE node_attachment_usage (
    attachment_id TEXT NOT NULL REFERENCES node_attachment(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('inline','cover','file')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (attachment_id, role)
);
INSERT INTO node_attachment_usage(attachment_id,role,created_at)
SELECT attachment_id,role,created_at FROM node_attachment_usage_stage;
DROP TABLE node_attachment_usage_stage;

CREATE TABLE node_attachment_presentation (
    graph_node_id       TEXT PRIMARY KEY NOT NULL,
    cover_attachment_id TEXT NOT NULL REFERENCES node_attachment(id) ON DELETE RESTRICT,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO node_attachment_presentation(graph_node_id,cover_attachment_id,updated_at)
SELECT graph_node_id,cover_attachment_id,updated_at FROM node_attachment_presentation_stage;
DROP TABLE node_attachment_presentation_stage;

CREATE INDEX idx_node_attachment_graph_node
    ON node_attachment(graph_node_id, created_at);
CREATE INDEX idx_node_attachment_presentation_cover
    ON node_attachment_presentation(cover_attachment_id);

-- Primary records are byte identities. A mutable presentation role belongs in
-- node_attachment_usage, never in node_attachment.role.
CREATE TRIGGER node_attachment_primary_kind_role_insert_guard
BEFORE INSERT ON node_attachment
WHEN (NEW.kind = 'image' AND NEW.role <> 'image')
  OR (NEW.kind = 'file' AND NEW.role <> 'file')
BEGIN
    SELECT RAISE(ABORT, 'attachment primary role must match attachment kind');
END;

CREATE TRIGGER node_attachment_primary_kind_role_update_guard
BEFORE UPDATE OF kind, role ON node_attachment
WHEN (NEW.kind = 'image' AND NEW.role <> 'image')
  OR (NEW.kind = 'file' AND NEW.role <> 'file')
BEGIN
    SELECT RAISE(ABORT, 'attachment primary role must match attachment kind');
END;

CREATE TRIGGER node_attachment_primary_kind_usage_update_guard
BEFORE UPDATE OF kind, role ON node_attachment
WHEN EXISTS (
    SELECT 1
    FROM node_attachment_usage AS usage
    WHERE usage.attachment_id = NEW.id
      AND (
          (NEW.kind = 'image' AND usage.role = 'file')
          OR (NEW.kind = 'file' AND usage.role IN ('inline', 'cover'))
      )
)
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and durable usage role are incompatible');
END;

CREATE TRIGGER node_attachment_usage_kind_insert_guard
BEFORE INSERT ON node_attachment_usage
WHEN (NEW.role = 'file' AND NOT EXISTS (
        SELECT 1 FROM node_attachment
        WHERE id = NEW.attachment_id AND kind = 'file' AND role = 'file'
    ))
  OR (NEW.role IN ('inline', 'cover') AND NOT EXISTS (
        SELECT 1 FROM node_attachment
        WHERE id = NEW.attachment_id AND kind = 'image' AND role = 'image'
    ))
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and usage role are incompatible');
END;

CREATE TRIGGER node_attachment_usage_kind_update_guard
BEFORE UPDATE OF attachment_id, role ON node_attachment_usage
WHEN (NEW.role = 'file' AND NOT EXISTS (
        SELECT 1 FROM node_attachment
        WHERE id = NEW.attachment_id AND kind = 'file' AND role = 'file'
    ))
  OR (NEW.role IN ('inline', 'cover') AND NOT EXISTS (
        SELECT 1 FROM node_attachment
        WHERE id = NEW.attachment_id AND kind = 'image' AND role = 'image'
    ))
BEGIN
    SELECT RAISE(ABORT, 'attachment kind and usage role are incompatible');
END;

CREATE TRIGGER node_attachment_presentation_insert_guard
BEFORE INSERT ON node_attachment_presentation
WHEN NOT EXISTS (
      SELECT 1 FROM node_attachment
      WHERE id = NEW.cover_attachment_id
        AND graph_node_id = NEW.graph_node_id
        AND kind = 'image'
        AND role = 'image'
  )
  OR NOT EXISTS (
      SELECT 1 FROM node_attachment_usage
      WHERE attachment_id = NEW.cover_attachment_id
        AND role = 'cover'
  )
BEGIN
    SELECT RAISE(ABORT, 'presentation cover must belong to its graph node and be an image cover');
END;

CREATE TRIGGER node_attachment_presentation_update_guard
BEFORE UPDATE OF graph_node_id, cover_attachment_id ON node_attachment_presentation
WHEN NOT EXISTS (
      SELECT 1 FROM node_attachment
      WHERE id = NEW.cover_attachment_id
        AND graph_node_id = NEW.graph_node_id
        AND kind = 'image'
        AND role = 'image'
  )
  OR NOT EXISTS (
      SELECT 1 FROM node_attachment_usage
      WHERE attachment_id = NEW.cover_attachment_id
        AND role = 'cover'
  )
BEGIN
    SELECT RAISE(ABORT, 'presentation cover must belong to its graph node and be an image cover');
END;

CREATE TRIGGER node_attachment_usage_selected_cover_delete_guard
BEFORE DELETE ON node_attachment_usage
WHEN OLD.role = 'cover'
  AND EXISTS (
      SELECT 1 FROM node_attachment_presentation
      WHERE cover_attachment_id = OLD.attachment_id
  )
BEGIN
    SELECT RAISE(ABORT, 'selected presentation cover usage cannot be deleted');
END;

CREATE TRIGGER node_attachment_usage_selected_cover_update_guard
BEFORE UPDATE OF attachment_id, role ON node_attachment_usage
WHEN EXISTS (
      SELECT 1 FROM node_attachment_presentation
      WHERE cover_attachment_id = OLD.attachment_id
  )
  AND (NEW.attachment_id <> OLD.attachment_id OR NEW.role <> 'cover')
BEGIN
    SELECT RAISE(ABORT, 'selected presentation cover usage must remain on its attachment with cover role');
END;

CREATE TRIGGER node_attachment_selected_cover_owner_update_guard
BEFORE UPDATE OF graph_node_id ON node_attachment
WHEN NEW.graph_node_id <> OLD.graph_node_id
  AND EXISTS (
      SELECT 1 FROM node_attachment_presentation
      WHERE cover_attachment_id = OLD.id
  )
BEGIN
    SELECT RAISE(ABORT, 'selected presentation cover cannot move to another graph node');
END;
