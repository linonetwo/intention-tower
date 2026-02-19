pub mod models;
pub mod systems;
pub mod api;
pub mod level_loader;

use api::SimulationState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SimulationState::new())
        .invoke_handler(tauri::generate_handler![
            api::load_level,
            api::snapshot,
            api::tick,
            api::set_time_speed,
            api::list_commands,
            api::execute_command,
            api::get_mind_graph,
            api::set_paused,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
