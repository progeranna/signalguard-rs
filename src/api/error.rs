use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use tracing::warn;

use crate::storage::{CacheError, StorageError};

#[derive(Debug)]
pub enum ApiError {
    InvalidSymbol(String),
    InvalidRequest(String),
    NotFound(String),
    CacheUnavailable,
    Internal(String),
}

#[derive(Serialize)]
struct ApiErrorResponse {
    error: &'static str,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error, message) = match self {
            Self::InvalidSymbol(message) => (StatusCode::BAD_REQUEST, "invalid_symbol", message),
            Self::InvalidRequest(message) => (StatusCode::BAD_REQUEST, "invalid_request", message),
            Self::NotFound(message) => (StatusCode::NOT_FOUND, "not_found", message),
            Self::CacheUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "cache_unavailable",
                String::from("latest market state cache is unavailable"),
            ),
            Self::Internal(message) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", message)
            }
        };

        (status, Json(ApiErrorResponse { error, message })).into_response()
    }
}

impl From<StorageError> for ApiError {
    fn from(error: StorageError) -> Self {
        match error {
            StorageError::InvalidArgument { message, .. } => Self::InvalidRequest(message),
            StorageError::Database { operation, source } => {
                warn!(%operation, %source, "storage operation failed");
                Self::Internal(String::from("failed to complete storage operation"))
            }
            StorageError::Mapping { operation, message } => {
                warn!(%operation, %message, "storage returned invalid data");
                Self::Internal(String::from("stored data is invalid"))
            }
        }
    }
}

impl From<CacheError> for ApiError {
    fn from(error: CacheError) -> Self {
        match error {
            CacheError::Unavailable => Self::CacheUnavailable,
            CacheError::Redis { operation, source } => {
                warn!(%operation, %source, "Redis cache operation failed");
                Self::CacheUnavailable
            }
            CacheError::InMemoryLock { operation } => {
                warn!(%operation, "in-memory cache lock failed");
                Self::CacheUnavailable
            }
            CacheError::Serialization { operation, source } => {
                warn!(%operation, %source, "Redis cache payload could not be decoded");
                Self::Internal(String::from(
                    "latest market state cache contains invalid data",
                ))
            }
            CacheError::InvalidData { operation, message } => {
                warn!(%operation, %message, "Redis cache data is invalid");
                Self::Internal(String::from(
                    "latest market state cache contains invalid data",
                ))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::{http::StatusCode, response::IntoResponse};

    use super::ApiError;

    #[test]
    fn cache_unavailable_maps_to_service_unavailable() {
        let response = ApiError::CacheUnavailable.into_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn not_found_maps_to_not_found() {
        let response = ApiError::NotFound(String::from("market state not found")).into_response();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn invalid_request_maps_to_bad_request() {
        let response = ApiError::InvalidRequest(String::from("invalid limit")).into_response();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
