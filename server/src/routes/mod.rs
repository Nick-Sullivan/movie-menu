pub mod images;
pub mod menus;

use axum::{
    routing::{get, post, put},
    Router,
};

use crate::AppState;

pub fn menus_router() -> Router<AppState> {
    Router::new()
        .route("/menus", post(menus::create_menu))
        .route("/menus/{id}", get(menus::get_menu))
        .route("/menus/{id}", put(menus::update_menu))
        .route("/menus/{id}/start", post(menus::start_screening))
        .route("/menus/{id}/stop", post(menus::stop_screening))
}

pub fn images_router() -> Router<AppState> {
    Router::new()
        .route("/images/presign", post(images::presign_uploads))
        .route("/images/{key}", get(images::view_image))
}
