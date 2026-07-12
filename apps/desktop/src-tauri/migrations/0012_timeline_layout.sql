-- Timeline is a first-class projection of graph nodes, separate from canvas
-- constellations. Horizontal position is derived from temporal substance and is
-- deliberately absent; only the user's lane and vertical/card presentation live here.
CREATE TABLE IF NOT EXISTS timeline_layout (
    graph_node_id TEXT PRIMARY KEY NOT NULL REFERENCES graph_node_metadata(graph_node_id) ON DELETE CASCADE,
    lane          TEXT NOT NULL,
    offset_y      REAL NOT NULL,
    width         REAL NOT NULL CHECK (width > 0),
    height        REAL NOT NULL CHECK (height > 0),
    style_json    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(style_json) AND json_type(style_json) = 'object'),
    layout_revision INTEGER NOT NULL DEFAULT 0 CHECK (layout_revision BETWEEN 0 AND 9007199254740991),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_timeline_layout_lane ON timeline_layout(lane);
