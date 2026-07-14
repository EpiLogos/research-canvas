-- Durable media and file attachments. `node_attachment` is content identity
-- within a graph record; `node_attachment_usage` lets one identity be both an
-- inline image and a card cover without duplicating bytes or references.
CREATE TABLE IF NOT EXISTS node_attachment (
    id                     TEXT PRIMARY KEY NOT NULL,
    graph_node_id          TEXT NOT NULL,
    managed_path           TEXT NOT NULL UNIQUE,
    original_filename      TEXT NOT NULL,
    mime_type              TEXT NOT NULL,
    kind                   TEXT NOT NULL CHECK (kind IN ('image','file')),
    content_hash           TEXT NOT NULL,
    caption                TEXT NOT NULL DEFAULT '',
    role                   TEXT NOT NULL CHECK (role IN ('inline','cover','file')),
    provenance_source_path TEXT NOT NULL,
    created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(graph_node_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_node_attachment_graph_node
    ON node_attachment(graph_node_id, created_at);

CREATE TABLE IF NOT EXISTS node_attachment_usage (
    attachment_id TEXT NOT NULL REFERENCES node_attachment(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('inline','cover','file')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (attachment_id, role)
);
