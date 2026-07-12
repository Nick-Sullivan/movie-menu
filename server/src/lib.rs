pub mod error;
pub mod models;
pub mod routes;
pub mod store;

use axum::{routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use store::MenuStore;

#[derive(Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
    })
}

pub fn app(store: Arc<dyn MenuStore>) -> Router {
    Router::new()
        .route("/health", get(health))
        .merge(routes::menus_router())
        .with_state(store)
        .layer(CorsLayer::permissive())
}

pub async fn serve(listener: TcpListener, router: Router) {
    axum::serve(listener, router)
        .await
        .expect("server error");
}
