pub mod error;
pub mod images;
pub mod models;
pub mod routes;
pub mod store;

use axum::{extract::FromRef, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use images::ImageStore;
use store::MenuStore;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<dyn MenuStore>,
    /// None when IMAGES_BUCKET isn't configured; image endpoints then 503.
    pub images: Option<Arc<ImageStore>>,
}

// Lets handlers that only need the menu store keep extracting it directly.
impl FromRef<AppState> for Arc<dyn MenuStore> {
    fn from_ref(state: &AppState) -> Self {
        state.store.clone()
    }
}

#[derive(Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
    })
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .merge(routes::menus_router())
        .merge(routes::images_router())
        .with_state(state)
        .layer(CorsLayer::permissive())
}

pub async fn serve(listener: TcpListener, router: Router) {
    axum::serve(listener, router).await.expect("server error");
}
