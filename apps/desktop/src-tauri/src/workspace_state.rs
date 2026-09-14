// apps/desktop/src-tauri/src/workspace_state.rs
//! Workspace-level Tauri state: active project, profile scope, and derivation rules.
//!
//! `WorkspaceState` is intentionally separate from the in-memory `ApiState` so
//! that the rules for resolving an active project namespace can be unit-tested
//! without a Tauri app handle.

use serde::{Deserialize, Serialize};

/// Derive the canonical profile scope from a project slug.
///
/// The surface never falls back to hardcoded strings like `migration` or
/// `bootstrapping`; the active scope is always computed from the active project.
pub fn derive_active_profile_scope(project_slug: &str) -> String {
    format!("project:{project_slug}")
}

/// In-memory workspace state persisted to SQLite via the `projects` table.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub active_project_id: Option<String>,
    pub active_profile_scope: Option<String>,
}

impl WorkspaceState {
    /// Build state from a project id and slug, deriving the profile scope.
    pub fn from_project(project_id: &str, project_slug: &str) -> Self {
        Self {
            active_project_id: Some(project_id.to_string()),
            active_profile_scope: Some(derive_active_profile_scope(project_slug)),
        }
    }

    /// Update to the given project, deriving the profile scope from its slug.
    pub fn set_active_project(&mut self, project_id: &str, project_slug: &str) {
        self.active_project_id = Some(project_id.to_string());
        self.active_profile_scope = Some(derive_active_profile_scope(project_slug));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_scope_from_slug() {
        assert_eq!(
            derive_active_profile_scope("alpha-field"),
            "project:alpha-field"
        );
        assert_eq!(derive_active_profile_scope("root"), "project:root");
    }

    #[test]
    fn workspace_state_derives_from_project() {
        let state = WorkspaceState::from_project("p-1", "alpha-field");
        assert_eq!(state.active_project_id.as_deref(), Some("p-1"));
        assert_eq!(
            state.active_profile_scope.as_deref(),
            Some("project:alpha-field")
        );
    }

    #[test]
    fn workspace_state_updates_active_project() {
        let mut state = WorkspaceState::from_project("p-1", "alpha-field");
        state.set_active_project("p-2", "beta-field");
        assert_eq!(state.active_project_id.as_deref(), Some("p-2"));
        assert_eq!(
            state.active_profile_scope.as_deref(),
            Some("project:beta-field")
        );
    }
}
