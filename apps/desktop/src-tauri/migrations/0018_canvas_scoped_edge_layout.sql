-- A semantic relationship can be presented on several constellation canvases.
-- The old global edge id made `graph:<relationship-id>` move between canvases
-- on each upsert. Rebuild with presentation identity scoped to its canvas.
CREATE TABLE edge_layout_rebuilt (
    id                   TEXT NOT NULL,
    canvas_id            TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_graph_node_id TEXT NOT NULL,
    target_graph_node_id TEXT NOT NULL,
    relation_kind        TEXT NOT NULL,
    source_handle_id     TEXT,
    target_handle_id     TEXT,
    style_json           TEXT NOT NULL DEFAULT '{}',
    created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (canvas_id, id)
);

INSERT INTO edge_layout_rebuilt (
    id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
    source_handle_id, target_handle_id, style_json, created_at, updated_at
)
SELECT
    id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind,
    source_handle_id, target_handle_id, style_json, created_at, updated_at
FROM edge_layout;

DROP TABLE edge_layout;
ALTER TABLE edge_layout_rebuilt RENAME TO edge_layout;
CREATE INDEX idx_edge_layout_canvas_id ON edge_layout(canvas_id);
