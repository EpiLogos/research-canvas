-- migrations/0009_agent_activity.sql
-- Durable log of agent-observed graph mutations (presentation side, SQLite).
-- Joins to Neo4j substance via graph_node_id when present.
CREATE TABLE IF NOT EXISTS agent_activity (
    id              TEXT PRIMARY KEY NOT NULL,
    canvas_id       TEXT,
    kind            TEXT NOT NULL,            -- node_created | node_updated | relationship_created | episode_ingested
    graph_node_id   TEXT,
    relationship_id TEXT,
    title           TEXT NOT NULL DEFAULT '',
    entity_type     TEXT,
    detail_json     TEXT NOT NULL DEFAULT '{}',
    reviewed        INTEGER NOT NULL DEFAULT 0,
    placed          INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created_at ON agent_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_activity_graph_node_id ON agent_activity(graph_node_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_reviewed ON agent_activity(reviewed);
