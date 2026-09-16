#[cfg(feature = "desktop")]
pub mod api;
pub mod command_rules;
pub mod level_loader;
pub mod movement;
pub mod models;
pub mod save_slots;
pub mod systems;
#[cfg(feature = "test-server")]
pub mod test_server;

#[cfg(feature = "desktop")]
use api::SimulationState;

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 检查是否为测试模式
    #[cfg(feature = "test-server")]
    let test_mode = std::env::args().any(|arg| arg == "--test-mode");
    #[cfg(feature = "test-server")]
    if test_mode {
        eprintln!("[intention-tower] 测试模式已启用");
        start_test_server_embedded();
    }

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
            api::cancel_pending_command,
            api::get_mind_graph,
            api::set_paused,
            api::step_tick,
            api::move_character,
            api::save_game,
            api::load_save,
            api::list_saves,
            api::delete_save,
        ])
        .setup(move |_app| {
            // 在嵌入测试模式下，轮询 test channel 并转发给 webview
            #[cfg(feature = "test-server")]
            if test_mode {
                let app_handle = _app.handle().clone();
                std::thread::spawn(move || {
                    if let Some(rx) = test_server::get_test_receiver() {
                        loop {
                            match rx.recv() {
                                Ok(test_server::TestMessage::EvaluateScript {
                                    script,
                                    response,
                                }) => {
                                    use tauri::Manager;
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let result = window.eval(&script);
                                        let _ = response.send(
                                            result
                                                .map(|_| "{\"success\":true}".to_string())
                                                .unwrap_or_else(|e| {
                                                    format!("{{\"error\":\"{}\"}}", e)
                                                }),
                                        );
                                    } else {
                                        let _ = response
                                            .send("{\"error\":\"webview not found\"}".to_string());
                                    }
                                }
                                Err(_) => break, // channel closed
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 启动嵌入式 MCP 测试服务器（运行在独立线程中）
#[cfg(all(feature = "desktop", feature = "test-server"))]
fn start_test_server_embedded() {
    let tx = test_server::init_test_channel();
    let port: u16 = std::env::var("TEST_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(9222);
    let state = std::sync::Arc::new(test_server::TestServerState::with_channel(tx, port));

    std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(test_server::run_test_server(state, port));
    });
}
