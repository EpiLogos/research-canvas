CREATE TABLE IF NOT EXISTS project_resource_roots (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    root_path TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, root_path)
);

CREATE INDEX IF NOT EXISTS idx_project_resource_roots_project_id
    ON project_resource_roots(project_id);
