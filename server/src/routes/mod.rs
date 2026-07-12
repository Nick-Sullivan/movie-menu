pub mod menus;

use axum::{
    routing::{get, post, put},
    Router,
};
use std::sync::Arc;

use crate::store::MenuStore;

pub fn menus_router() -> Router<Arc<dyn MenuStore>> {
    Router::new()
        .route("/menus", post(menus::create_menu))
        .route("/menus/{id}", get(menus::get_menu))
        .route("/menus/{id}", put(menus::update_menu))
        .route("/menus/{id}/start", post(menus::start_screening))
        .route("/menus/{id}/stop", post(menus::stop_screening))
}
