use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ReplayError {
    #[error("failed to read replay fixture `{path}`: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("replay fixture `{path}` line {line}: {kind}")]
    Parse {
        path: PathBuf,
        line: usize,
        kind: ReplayParseError,
    },
    #[error("replay event channel receiver was dropped before replay completed")]
    ReceiverDropped,
}

#[derive(Debug, Error)]
pub enum ReplayParseError {
    #[error("malformed JSON: {source}")]
    MalformedJson {
        #[source]
        source: serde_json::Error,
    },
    #[error("missing required field `{field}`")]
    MissingField { field: &'static str },
    #[error("field `type` must be `trade` or `quote`: {value}")]
    UnknownEventType { value: String },
    #[error("invalid symbol `{value}`: {message}")]
    InvalidSymbol { value: String, message: String },
    #[error("invalid exchange `{value}`: {message}")]
    InvalidExchange { value: String, message: String },
    #[error("field `{field}` must be a string")]
    InvalidStringField { field: &'static str },
    #[error("field `{field}` must be a valid decimal value: {value}")]
    InvalidDecimal { field: &'static str, value: String },
    #[error("field `{field}` must be a valid RFC3339 timestamp: {value}")]
    InvalidTimestamp { field: &'static str, value: String },
    #[error("field `{field}` must be a valid unsigned integer: {value}")]
    InvalidUnsignedInteger { field: &'static str, value: String },
    #[error("{message}")]
    InvalidEvent { message: String },
}
