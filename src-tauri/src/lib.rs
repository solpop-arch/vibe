mod commands;
pub mod constants;
mod error;
mod state;
pub mod watcher;

use commands::{dialog, file_ops, watcher_cmd};
use state::AppState;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .manage(AppState::new())
        .setup(|app| {
            // Handle CLI argument: `vibe /path/to/project`
            if let Ok(matches) = app.cli().matches() {
                if let Some(arg) = matches.args.get("path") {
                    if let serde_json::Value::String(val) = &arg.value {
                        if !val.is_empty() {
                            let state = app.state::<AppState>();
                            let handle = app.handle().clone();
                            let _ = watcher_cmd::set_root_internal(
                                val.to_string(),
                                &state,
                                handle,
                            );
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_ops::list_files,
            file_ops::read_file,
            file_ops::write_file,
            file_ops::create_item,
            file_ops::delete_item,
            file_ops::rename_item,
            watcher_cmd::set_root,
            watcher_cmd::get_root,
            dialog::pick_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
