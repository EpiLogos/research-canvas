CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    root_path TEXT NOT NULL,
    primary_canvas_id TEXT UNIQUE REFERENCES canvases(id) ON DELETE SET NULL,
    summary TEXT,
    cover_asset TEXT,
    publish_settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_parent_project_id
    ON projects(parent_project_id);

CREATE TABLE IF NOT EXISTS canvases (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'primary',
    summary TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_canvases_project_id
    ON canvases(project_id);

CREATE TABLE IF NOT EXISTS canvas_nodes (
    id TEXT PRIMARY KEY NOT NULL,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    position_x REAL NOT NULL,
    position_y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    content TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    resource_kind TEXT,
    absolute_path TEXT,
    relative_path TEXT,
    mime_type TEXT,
    file_fingerprint TEXT,
    url TEXT,
    color TEXT,
    child_node_ids TEXT NOT NULL DEFAULT '[]',
    target_canvas_id TEXT REFERENCES canvases(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_id
    ON canvas_nodes(canvas_id);

CREATE TABLE IF NOT EXISTS canvas_edges (
    id TEXT PRIMARY KEY NOT NULL,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    relation_kind TEXT NOT NULL,
    directionality TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    style_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_canvas_id
    ON canvas_edges(canvas_id);

CREATE TABLE IF NOT EXISTS canvas_annotations (
    id TEXT PRIMARY KEY NOT NULL,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    annotation_type TEXT NOT NULL,
    points_json TEXT NOT NULL,
    style_color TEXT NOT NULL,
    style_width REAL NOT NULL,
    style_opacity REAL NOT NULL,
    text TEXT,
    bounds_x REAL NOT NULL,
    bounds_y REAL NOT NULL,
    bounds_width REAL NOT NULL,
    bounds_height REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_canvas_annotations_canvas_id
    ON canvas_annotations(canvas_id);

CREATE TABLE IF NOT EXISTS sequences (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sequences_canvas_id
    ON sequences(canvas_id);

CREATE TABLE IF NOT EXISTS sequence_steps (
    id TEXT PRIMARY KEY NOT NULL,
    sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    viewport_json TEXT NOT NULL,
    transition_hint TEXT NOT NULL DEFAULT 'ease',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_steps_sequence_position
    ON sequence_steps(sequence_id, position);
