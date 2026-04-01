use std::path::PathBuf;
use std::sync::Mutex;
use notify::RecommendedWatcher;

use crate::error::AppError;

pub struct AppState {
    pub root: Mutex<Option<PathBuf>>,
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            root: Mutex::new(None),
            watcher: Mutex::new(None),
        }
    }

    pub fn get_root(&self) -> Result<PathBuf, AppError> {
        self.root
            .lock()
            .unwrap()
            .clone()
            .ok_or(AppError::NoRootSet)
    }
}
