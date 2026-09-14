-- T6: Project and namespace persistence.
-- Add the active project namespace fields that WorkspaceState derives from the
-- active project row. profile_scope remains the canonical per-project namespace
-- (project:<slug>); active_profile_scope stores the resolved value for the row.
ALTER TABLE projects ADD COLUMN active_constellation_id TEXT REFERENCES canvases(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN active_profile_scope TEXT;

-- Back-fill existing projects so every row has a real namespace. Legacy rows
-- keep their real slug; the old 'migration' profile_scope is only a fallback
-- when a slug is missing (which should never happen for new projects).
UPDATE projects
SET active_profile_scope = CASE
    WHEN slug IS NOT NULL AND slug <> '' THEN 'project:' || slug
    ELSE 'migration'
END,
    active_constellation_id = primary_canvas_id
WHERE active_profile_scope IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_active_profile_scope
    ON projects(active_profile_scope);
