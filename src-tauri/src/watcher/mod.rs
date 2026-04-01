mod debounce;

use crate::constants::IGNORED;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct FileChangedPayload {
    pub paths: Vec<String>,
    pub kind: String,
}

pub fn spawn_watcher(
    root: PathBuf,
    app: AppHandle,
) -> Result<RecommendedWatcher, notify::Error> {
    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher = RecommendedWatcher::new(tx, Config::default())?;
    watcher.watch(&root, RecursiveMode::Recursive)?;

    std::thread::spawn(move || {
        debounce::debounced_receiver(rx, Duration::from_millis(150), |events| {
            let payload = build_payload(events);
            if !payload.paths.is_empty() {
                let _ = app.emit("file-changed", &payload);
            }
        });
    });

    Ok(watcher)
}

fn build_payload(events: Vec<Event>) -> FileChangedPayload {
    let mut paths = Vec::new();
    let mut kind = "modify".to_string();
    for event in &events {
        let filtered = event
            .paths
            .iter()
            .filter(|p| !is_ignored(p))
            .map(|p| p.to_string_lossy().into_owned());
        paths.extend(filtered);
        kind = classify_kind(&event.kind);
    }
    paths.sort();
    paths.dedup();
    FileChangedPayload { paths, kind }
}

fn is_ignored(path: &std::path::Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        IGNORED.contains(&s.as_ref())
    })
}

fn classify_kind(kind: &notify::EventKind) -> String {
    use notify::EventKind::*;
    match kind {
        Create(_) => "create",
        Modify(_) => "modify",
        Remove(_) => "remove",
        _ => "modify",
    }
    .to_string()
}
