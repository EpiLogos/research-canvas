pub mod agent;
pub mod api;
pub mod commands {
    pub mod agent_activity;
    pub mod assets;
    pub mod constellations;
    pub mod export;
    pub mod export_graph_bundle;
    pub mod graph;
    pub mod keepsake;
    pub mod layout;
    pub mod node_document;
    pub mod palace;
    pub mod scenes;
    pub mod search;
    pub mod street_view;
    pub mod terminal;
    pub mod timeline;
}
pub mod db;
pub mod export;
pub mod fs;
pub mod pty;
pub mod workspace;

use std::sync::{Arc, Mutex};

#[derive(Debug, Default, Clone)]
pub struct ApiState {
    pub db_path: Option<String>,
    pub active_constellation_id: Option<String>,
    pub active_canvas_id: Option<String>,
    pub active_project_id: Option<String>,
    pub active_profile_scope: Option<String>,
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

    // Long-lived multi-thread runtime that owns the bolt I/O. Kept alive for the
    // whole app via managed state; its Handle is shared into SharedGraphState so
    // the plain :9876 server thread (Task 15) can block_on graph reads.
    let runtime = std::sync::Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime"),
    );

    // Build the shared Neo4j connection on that runtime (best-effort at startup).
    let graph_state: Option<commands::graph::SharedGraphState> = {
        let rt = runtime.clone();
        (|| {
            let config = crate::db::neo4j::config::Neo4jConfig::from_env().ok()?;
            let database = config.database.clone();
            let graph = rt.block_on(crate::db::neo4j::connect(&config)).ok()?;
            // Ensure schema once on startup.
            let repo = crate::db::repositories::graph::GraphRepository::new(
                graph.clone(),
                database.clone(),
            );
            let _ = rt.block_on(repo.ensure_schema());
            Some(commands::graph::SharedGraphState {
                graph,
                database,
                runtime: rt.handle().clone(),
            })
        })()
    };

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(pty::TerminalManager::new())
        .manage(api_state)
        .manage(runtime); // Arc<tokio::runtime::Runtime> — keeps the bolt pool alive
    if let Some(gs) = graph_state {
        builder = builder.manage(gs);
    }
    builder
        .setup(move |app| {
            // Send the AppHandle to the HTTP server thread
            handle_tx.send(app.handle().clone()).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::constellations::bootstrap_workspace_command,
            commands::constellations::resolve_or_create_home_command,
            commands::constellations::create_project_command,
            commands::constellations::attach_constellation_resource_root_command,
            commands::constellations::detach_constellation_resource_root_command,
            commands::export::export_constellation_bundle_command,
            commands::export::resolve_publish_profile_command,
            commands::export_graph_bundle::export_graph_bundle_command,
            commands::constellations::load_constellation_document_command,
            commands::constellations::list_constellation_resource_roots_command,
            commands::constellations::persist_constellation_document_command,
            commands::search::rebuild_constellation_search_index_command,
            commands::search::search_constellation_command,
            commands::terminal::close_terminal_session,
            commands::terminal::create_terminal_session,
            commands::terminal::resize_terminal_session,
            commands::terminal::send_terminal_input,
            commands::constellations::activate_canvas_command,
            commands::constellations::set_active_project_command,
            commands::constellations::read_workspace_text_file_command,
            commands::assets::import_node_image_command,
            commands::assets::attach_node_attachment_command,
            commands::assets::read_node_attachment_presentation_command,
            commands::constellations::list_directories_command,
            commands::constellations::list_saved_sequences_command,
            commands::constellations::create_saved_sequence_command,
            commands::constellations::update_saved_sequence_command,
            commands::constellations::delete_saved_sequence_command,
            commands::layout::flush_canvas_layout_command,
            commands::graph::read_graph_node_command,
            commands::graph::find_graph_node_command,
            commands::graph::create_graph_node_command,
            commands::graph::update_graph_node_command,
            commands::graph::compare_and_swap_graph_node_content_command,
            commands::graph::delete_graph_node_command,
            commands::graph::connect_graph_nodes_command,
            commands::graph::disconnect_graph_nodes_command,
            commands::graph::search_graph_command,
            commands::graph::archetypal_lighting_command,
            commands::graph::resonances_for_instance_command,
            commands::graph::load_canvas_view_command,
            commands::timeline::load_timeline_view_command,
            commands::timeline::load_timeline_relation_field_command,
            commands::timeline::upsert_timeline_layout_command,
            commands::scenes::list_scenes_command,
            commands::scenes::list_scene_sequences_command,
            commands::scenes::get_scene_command,
            commands::scenes::upsert_scene_command,
            commands::scenes::upsert_scene_sequence_command,
            commands::scenes::delete_scene_command,
            commands::scenes::delete_scene_sequence_command,
            commands::street_view::list_street_view_images_command,
            commands::street_view::register_street_view_image_command,
            commands::street_view::stage_street_view_image_command,
            commands::street_view::add_manual_street_view_region_command,
            commands::street_view::apply_street_view_redaction_command,
            commands::street_view::mark_street_view_redaction_none_needed_command,
            commands::keepsake::write_keepsake_bundle_command,
            commands::palace::load_palace_curation_command,
            commands::palace::save_palace_curation_command,
            commands::graph::upsert_node_layout_command,
            commands::graph::upsert_node_layouts_command,
            commands::graph::upsert_edge_layout_command,
            commands::graph::upsert_canvas_app_state_command,
            commands::agent_activity::list_agent_activity_command,
            commands::node_document::read_local_node_document_command,
            commands::node_document::list_pending_node_document_syncs_command,
            commands::node_document::upsert_local_node_document_command,
            commands::node_document::reconcile_local_node_documents_command,
            commands::node_document::acknowledge_local_node_document_sync_command,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Research Canvas");
}
