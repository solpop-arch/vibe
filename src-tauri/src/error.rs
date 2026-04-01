use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Access denied: path escapes project root")]
    AccessDenied,
    #[error("Root not set — open a folder first")]
    NoRootSet,
    #[error("File too large (>1MB)")]
    FileTooLarge,
    #[error("Binary file")]
    BinaryFile,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Action not allowed on root directory")]
    RootNotAllowed,
    #[error("Watcher error: {0}")]
    Watcher(#[from] notify::Error),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
