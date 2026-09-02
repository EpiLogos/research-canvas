-- T17: durable workspace selection.
-- Tabs and per-surface state already live in app_tabs/app_active_tab. This
-- singleton stores the one missing startup coordinate: which project was
-- active when the workspace was last used.
CREATE TABLE IF NOT EXISTS workspace_state (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    active_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL
);
