-- Projects become profile-scoped entry points (refinement-2 task #1).
-- profileScope binds a project to its surface data; rootType distinguishes
-- directory projects (skeleton workspace) from file projects (lightweight,
-- derived data stored in the app-managed workspace store).
-- Defaults keep existing rows valid: legacy projects are treated as directory
-- projects under the internal "migration" profile-scope key, which stays
-- untouched for data compatibility per the task constraints.
ALTER TABLE projects ADD COLUMN profile_scope TEXT NOT NULL DEFAULT 'migration';
ALTER TABLE projects ADD COLUMN root_type TEXT NOT NULL DEFAULT 'directory';

CREATE INDEX IF NOT EXISTS idx_projects_profile_scope
    ON projects(profile_scope);
