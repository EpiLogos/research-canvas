-- migrations/0010_node_document.sql
-- Local working copy of a node's document body (presentation side, SQLite).
-- Lets the editor mount from local storage instead of gating on a live
-- Neo4j read. Joins to Neo4j substance via graph_node_id.
CREATE TABLE IF NOT EXISTS node_document (
    graph_node_id TEXT PRIMARY KEY NOT NULL,
    body          TEXT NOT NULL DEFAULT '',
    summary       TEXT NOT NULL DEFAULT '',
    updated_at    TEXT NOT NULL,
    neo4j_synced  INTEGER NOT NULL DEFAULT 0
);
