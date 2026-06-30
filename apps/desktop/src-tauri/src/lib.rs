pub mod api;
pub mod commands {
    pub mod export;
    pub mod layout;
    pub mod projects;
    pub mod search;
    pub mod terminal;
}
pub mod db;
pub mod export;
pub mod fs;
pub mod pty;

use std::sync::{Arc, Mutex};

#[derive(Debug, Default, Clone)]
pub struct ApiState {
    pub db_path: Option<String>,
    pub active_project_id: Option<String>,
    pub active_canvas_id: Option<String>,
}

pub type SharedApiState = Arc<Mutex<ApiState>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_state: SharedApiState = Arc::new(Mutex::new(ApiState::default()));
    let api_state_for_server = Arc::clone(&api_state);

    // Channel to pass AppHandle from Tauri setup into the HTTP server thread
    let (handle_tx, handle_rx) = std::sync::mpsc::channel::<tauri::AppHandle>();

    std::thread::spawn(move || {
        // Wait until Tauri is ready and we have the AppHandle
        let app_handle = handle_rx.recv().expect("app handle channel closed");
        api::start_server(api_state_for_server, app_handle);
    });

    tauri::Builder::default()
        .manage(pty::TerminalManager::new())
        .manage(api_state)
        .setup(move |app| {
            // Send the AppHandle to the HTTP server thread
            handle_tx.send(app.handle().clone()).ok();
            Ok(())
        })
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
            commands::terminal::send_terminal_input,
            commands::projects::activate_canvas_command,
            commands::projects::read_workspace_text_file_command,
            commands::projects::list_directories_command,
            commands::projects::list_saved_sequences_command,
            commands::projects::create_saved_sequence_command,
            commands::projects::update_saved_sequence_command,
            commands::projects::delete_saved_sequence_command,
            commands::layout::flush_canvas_layout_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Research Canvas");
}
