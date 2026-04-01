use crate::error::AppError;
use crate::state::AppState;
use crate::watcher;
use std::path::PathBuf;
use tauri::{AppHandle, State};

pub fn set_root_internal(
    path: String,
    state: &AppState,
    app: AppHandle,
) -> Result<String, AppError> {
    let root = PathBuf::from(&path);
    if !root.exists() || !root.is_dir() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Directory not found",
        )));
    }
    let canonical = root.canonicalize()?;

    // Hold watcher lock for the full transition to avoid inconsistent state
    let mut w = state.watcher.lock().unwrap();
    *w = None; // stop existing watcher

    {
        let mut r = state.root.lock().unwrap();
        *r = Some(canonical.clone());
    }

    *w = Some(watcher::spawn_watcher(canonical.clone(), app)?);

    Ok(canonical.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn set_root(
    path: String,
    state: State<AppState>,
    app: AppHandle,
) -> Result<String, AppError> {
    set_root_internal(path, &state, app)
}

#[tauri::command]
pub fn get_root(state: State<AppState>) -> Result<String, AppError> {
    state
        .get_root()
        .map(|p| p.to_string_lossy().into_owned())
}
