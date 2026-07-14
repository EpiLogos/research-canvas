use rusqlite::{ffi::ErrorCode, Error};

#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("repository validation failed: {0}")]
    Validation(String),
    #[error("repository data could not be decoded: {0}")]
    CorruptData(String),
    #[error("repository storage is busy")]
    Busy,
    #[error("repository optimistic concurrency conflict: {0}")]
    Conflict(String),
    #[error("repository storage failed: {0}")]
    Storage(#[source] Error),
}

pub type RepositoryResult<T> = Result<T, RepositoryError>;

impl From<Error> for RepositoryError {
    fn from(error: Error) -> Self {
        match &error {
            Error::SqliteFailure(inner, _)
                if matches!(
                    inner.code,
                    ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked
                ) =>
            {
                Self::Busy
            }
            Error::FromSqlConversionFailure(..)
            | Error::Utf8Error(..)
            | Error::IntegralValueOutOfRange(..)
            | Error::InvalidColumnType(..) => Self::CorruptData(error.to_string()),
            _ => Self::Storage(error),
        }
    }
}
