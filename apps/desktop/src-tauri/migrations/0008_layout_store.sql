-- Per-node layout, joined to Neo4j by graph_node_id.
CREATE TABLE IF NOT EXISTS node_layout (
    graph_node_id  TEXT NOT NULL,
    canvas_id      TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    position_x     REAL NOT NULL,
    position_y     REAL NOT NULL,
    width          REAL NOT NULL,
    height         REAL NOT NULL,
    style_json     TEXT NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (canvas_id, graph_node_id)
);
CREATE INDEX IF NOT EXISTS idx_node_layout_graph_node_id ON node_layout(graph_node_id);

-- Per-canvas viewport + app-state (one row per canvas).
CREATE TABLE IF NOT EXISTS canvas_app_state (
    canvas_id      TEXT PRIMARY KEY NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    viewport_json  TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
    app_state_json TEXT NOT NULL DEFAULT '{}',
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Edge layout/relation-mirror rows keyed by graph relation.
CREATE TABLE IF NOT EXISTS edge_layout (
    id                   TEXT PRIMARY KEY NOT NULL,
    canvas_id            TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_graph_node_id TEXT NOT NULL,
    target_graph_node_id TEXT NOT NULL,
    relation_kind        TEXT NOT NULL,
    source_handle_id     TEXT,
    target_handle_id     TEXT,
    style_json           TEXT NOT NULL DEFAULT '{}',
    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_edge_layout_canvas_id ON edge_layout(canvas_id);
