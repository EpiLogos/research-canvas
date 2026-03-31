pub mod commands {
    pub mod export;
    pub mod projects;
    pub mod search;
    pub mod terminal;
}
pub mod db;
pub mod export;
pub mod fs;
pub mod pty;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pty::TerminalManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::projects::bootstrap_workspace_command,
            commands::projects::attach_project_resource_root_command,
            commands::projects::detach_project_resource_root_command,
            commands::export::export_project_bundle_command,
            commands::export::resolve_publish_profile_command,
            commands::projects::load_project_document_command,
            commands::projects::list_project_resource_roots_command,
            commands::projects::persist_project_document_command,
            commands::search::rebuild_project_search_index_command,
            commands::search::search_project_command,
            commands::terminal::close_terminal_session,
            commands::terminal::create_terminal_session,
            commands::terminal::resize_terminal_session,
            commands::terminal::send_terminal_input
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Research Canvas");
}
