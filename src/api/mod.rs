mod dto;
mod error;
mod handlers;
mod routes;
mod state;

use axum::Router;

pub use self::state::AppState;
pub use dto::{PublicDataMode, PublicDataModeQuery};

pub fn router(state: AppState) -> Router {
    routes::router().with_state(state)
}
