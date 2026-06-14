use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("storage operation `{operation}` failed: {source}")]
    Database {
        operation: &'static str,
        #[source]
        source: sqlx::Error,
    },
    #[error("invalid storage argument `{name}`: {message}")]
    InvalidArgument { name: &'static str, message: String },
    #[error("failed to map storage row for `{operation}`: {message}")]
    Mapping {
        operation: &'static str,
        message: String,
    },
}

impl StorageError {
    pub fn database(operation: &'static str, source: sqlx::Error) -> Self {
        Self::Database { operation, source }
    }

    pub fn invalid_argument(name: &'static str, message: impl Into<String>) -> Self {
        Self::InvalidArgument {
            name,
            message: message.into(),
        }
    }

    pub fn mapping(operation: &'static str, message: impl Into<String>) -> Self {
        Self::Mapping {
            operation,
            message: message.into(),
        }
    }
}
