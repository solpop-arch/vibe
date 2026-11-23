use crate::constants::IGNORED;
use crate::error::AppError;
use crate::state::AppState;
use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_IMAGE_SIZE: u64 = 10 * 1024 * 1024;
const MAX_WALK_DEPTH: u32 = 20;

fn is_tmp_file(name: &str) -> bool {
    name.contains(".tmp.")
}

fn is_skipped_name(name: &str) -> bool {
    IGNORED.contains(&name) || name.starts_with('.') || is_tmp_file(name)
}

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

/// Like `validate_path`, but only the parent is canonicalized so a symlink
/// itself (not its target) is the resolved item. The root itself is rejected.
fn validate_link_aware(root: &Path, raw: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(raw);
    let name = path.file_name().ok_or(AppError::AccessDenied)?;
    let parent = path.parent().ok_or(AppError::AccessDenied)?;
    let parent_canonical = parent.canonicalize().map_err(|_| AppError::AccessDenied)?;
    let root_canonical = root.canonicalize().map_err(|_| AppError::AccessDenied)?;
    if !parent_canonical.starts_with(&root_canonical) {
        return Err(AppError::AccessDenied);
    }
    Ok(parent_canonical.join(name))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub modified_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub current_path: String,
    pub items: Vec<FileEntry>,
}

#[tauri::command]
pub fn list_files(
    path: Option<String>,
    include_mtime: Option<bool>,
    state: State<AppState>,
) -> Result<DirListing, AppError> {
    let root = state.get_root()?;
    let target = match &path {
        Some(p) if !p.is_empty() => validate_path(&root, p, true)?,
        _ => root.canonicalize().map_err(|_| AppError::AccessDenied)?,
    };
    let want_mtime = include_mtime.unwrap_or(false);

    let mut entries: Vec<FileEntry> = std::fs::read_dir(&target)?
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            let name_str = name.to_string_lossy();
            !IGNORED.contains(&name_str.as_ref()) && !is_tmp_file(&name_str)
        })
        .map(|e| {
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            // stat syscall only when dashboard asks for mtime — Explorer nav stays cheap
            let modified_ms = if want_mtime {
                e.metadata().ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
            } else {
                None
            };
            FileEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                path: e.path().to_string_lossy().into_owned(),
                is_directory: is_dir,
                modified_ms,
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
    let probe_len = bytes.len().min(8192);
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
    atomic_write(&validated, content.as_bytes())?;
    Ok(())
}

/// Write via a sibling temp file + rename so an interrupted save never leaves a
/// truncated file. The temp name contains `.tmp.`, which the explorer and
/// watcher already skip. Existing permissions are preserved.
fn atomic_write(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let tmp = target.with_file_name(format!(".{}.tmp.{}", name, std::process::id()));
    let result = (|| {
        std::fs::write(&tmp, bytes)?;
        if let Ok(meta) = std::fs::metadata(target) {
            let _ = std::fs::set_permissions(&tmp, meta.permissions());
        }
        std::fs::rename(&tmp, target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
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
    let validated = validate_link_aware(&root, &path)?;
    // symlink_metadata does not follow links: a link is removed itself, never its target.
    let meta = std::fs::symlink_metadata(&validated)?;
    if meta.is_dir() {
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

// ── Recursive file listing for dashboard ─────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllFilesListing {
    pub root_path: String,
    pub files: Vec<FileEntry>,
    pub total_folders: u32,
}

fn walk_dir(
    dir: &Path,
    files: &mut Vec<FileEntry>,
    folder_count: &mut u32,
    depth: u32,
) {
    if depth >= MAX_WALK_DEPTH {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if is_skipped_name(&name_str) {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            *folder_count += 1;
            walk_dir(&entry.path(), files, folder_count, depth + 1);
        } else {
            let modified_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            files.push(FileEntry {
                name: name_str.into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                is_directory: false,
                modified_ms,
            });
        }
    }
}

#[tauri::command]
pub fn list_all_files(state: State<AppState>) -> Result<AllFilesListing, AppError> {
    let root = state.get_root()?;
    let canonical_root = root.canonicalize().map_err(|_| AppError::AccessDenied)?;
    let mut files = Vec::new();
    let mut total_folders: u32 = 0;
    walk_dir(&canonical_root, &mut files, &mut total_folders, 0);
    Ok(AllFilesListing {
        root_path: canonical_root.to_string_lossy().into_owned(),
        files,
        total_folders,
    })
}

// ── Image reading (base64) ──────────────────────────────────────────────────

fn mime_from_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub data_url: String,
}

#[tauri::command]
pub fn read_image(path: String, state: State<AppState>) -> Result<ImageData, AppError> {
    let root = state.get_root()?;
    let validated = validate_path(&root, &path, true)?;
    let meta = std::fs::metadata(&validated)?;
    if meta.len() > MAX_IMAGE_SIZE {
        return Err(AppError::FileTooLarge);
    }
    let ext = validated
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = mime_from_ext(&ext);
    let bytes = std::fs::read(&validated)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(ImageData {
        data_url: format!("data:{};base64,{}", mime, b64),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("vibe-test-{}-{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    #[test]
    fn atomic_write_replaces_and_leaves_no_tmp() {
        let d = tmpdir("aw");
        let f = d.join("a.md");
        std::fs::write(&f, "old").unwrap();
        atomic_write(&f, b"new").unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "new");
        let n = std::fs::read_dir(&d).unwrap().count();
        assert_eq!(n, 1);
        let _ = std::fs::remove_dir_all(&d);
    }

    #[cfg(unix)]
    #[test]
    fn link_aware_removes_link_not_target() {
        let d = tmpdir("ln");
        let target = d.join("real.md");
        std::fs::write(&target, "x").unwrap();
        let link = d.join("link.md");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let v = validate_link_aware(&d, link.to_str().unwrap()).unwrap();
        assert_eq!(v, link);
        assert!(std::fs::symlink_metadata(&v).unwrap().file_type().is_symlink());
        std::fs::remove_file(&v).unwrap();
        assert!(target.exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn link_aware_rejects_outside_root() {
        let d = tmpdir("out");
        let root = d.join("root");
        std::fs::create_dir_all(&root).unwrap();
        let outside = d.join("x.md");
        std::fs::write(&outside, "x").unwrap();
        assert!(validate_link_aware(&root, outside.to_str().unwrap()).is_err());
        let _ = std::fs::remove_dir_all(&d);
    }
}
