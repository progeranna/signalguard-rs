pub mod anomalies;
pub mod error;
pub mod postgres;
pub mod quotes;
pub mod redis;
pub mod trades;

pub(crate) use anomalies::MAX_RECENT_ANOMALY_LIMIT;
pub use anomalies::{get_recent_anomalies, insert_anomaly};
pub use error::StorageError;
pub use quotes::insert_quote;
pub use redis::{CacheError, RedisCache};
pub use trades::insert_trade;
