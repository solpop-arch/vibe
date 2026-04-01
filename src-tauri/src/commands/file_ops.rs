use crate::constants::IGNORED;
use crate::error::AppError;
use crate::state::AppState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

const MAX_FILE_SIZE: u64 = 1024 * 1024;

fn validate_path(root: &Path, raw: &str, allow_root: bool) -> Result<PathBuf, AppError> {
    let resolved = if raw.is_empty() {
        root.to_path_buf()
    } else {
        PathBuf::from(raw)
    };

    let canonical = resolved.canonicalize().map_err(|_| AppError::AccessDenied)?;
    let canonical_root = root.canonicalize().map_err(|_| AppError::AccessDenied)?;

    if canonical == canonical_root {
        if !allow_root {
            return Err(AppError::RootNotAllowed);
        }
        return Ok(canonical);
    }

    if !canonical.starts_with(&canonical_root) {
        return Err(AppError::AccessDenied);
    }
    Ok(canonical)
}

fn validate_new_path(root: &Path, raw: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(raw);
    let parent = path
        .parent()
        .ok_or(AppError::AccessDenied)?;
    let parent_canonical = parent.canonicalize().map_err(|_| AppError::AccessDenied)?;
    let root_canonical = root.canonicalize().map_err(|_| AppError::AccessDenied)?;
    if !parent_canonical.starts_with(&root_canonical) {
        return Err(AppError::AccessDenied);
    }
    let filename = path
        .file_name()
        .ok_or(AppError::AccessDenied)?;
    Ok(parent_canonical.join(filename))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub current_path: String,
    pub items: Vec<FileEntry>,
}

#[tauri::command]
pub fn list_files(path: Option<String>, state: State<AppState>) -> Result<DirListing, AppError> {
    let root = state.get_root()?;
    let target = match &path {
        Some(p) if !p.is_empty() => validate_path(&root, p, true)?,
        _ => root.canonicalize().map_err(|_| AppError::AccessDenied)?,
    };

    let mut entries: Vec<FileEntry> = std::fs::read_dir(&target)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name_str = name.to_string_lossy();
            !IGNORED.contains(&name_str.as_ref())
        })
        .map(|e| {
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            FileEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path().to_string_lossy().into_owned(),
                is_directory: is_dir,
            }
        })
        .collect();

    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(DirListing {
        current_path: target.to_string_lossy().into_owned(),
        items: entries,
    })
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
}

#[tauri::command]
pub fn read_file(path: String, state: State<AppState>) -> Result<FileContent, AppError> {
    let root = state.get_root()?;
    let validated = validate_path(&root, &path, true)?;
    let meta = std::fs::metadata(&validated)?;
    if meta.len() > MAX_FILE_SIZE {
        return Err(AppError::FileTooLarge);
    }
    let bytes = std::fs::read(&validated)?;
    let probe_len = bytes.len().min(100);
    if bytes[..probe_len].contains(&0u8) {
        return Err(AppError::BinaryFile);
    }
    let content = String::from_utf8(bytes).map_err(|_| AppError::BinaryFile)?;
    Ok(FileContent { content })
}

#[tauri::command]
pub fn write_file(path: String, content: String, state: State<AppState>) -> Result<(), AppError> {
    let root = state.get_root()?;
    let validated = validate_path(&root, &path, false)?;
    std::fs::write(validated, content)?;
    Ok(())
}

#[tauri::command]
pub fn create_item(
    path: String,
    is_directory: bool,
    state: State<AppState>,
) -> Result<(), AppError> {
    let root = state.get_root()?;
    let validated = validate_new_path(&root, &path)?;
    if is_directory {
        std::fs::create_dir_all(validated)?;
    } else {
        std::fs::write(validated, "")?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_item(path: String, state: State<AppState>) -> Result<(), AppError> {
    let root = state.get_root()?;
    let validated = validate_path(&root, &path, false)?;
    if validated.is_dir() {
        std::fs::remove_dir_all(validated)?;
    } else {
        std::fs::remove_file(validated)?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_item(
    old_path: String,
    new_path: String,
    state: State<AppState>,
) -> Result<(), AppError> {
    let root = state.get_root()?;
    let validated_old = validate_path(&root, &old_path, false)?;
    let validated_new = validate_new_path(&root, &new_path)?;
    std::fs::rename(validated_old, validated_new)?;
    Ok(())
}
