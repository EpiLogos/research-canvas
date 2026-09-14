-- Global tab state. Each row is one open application tab; the shell owns the
-- ordering (sort_order). Active tab is tracked separately so closing all tabs
-- is representable.
CREATE TABLE IF NOT EXISTS app_tabs (
    tab_id TEXT PRIMARY KEY NOT NULL,
    surface_id TEXT NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_tabs_surface ON app_tabs(surface_id);

CREATE TABLE IF NOT EXISTS app_active_tab (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    tab_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
