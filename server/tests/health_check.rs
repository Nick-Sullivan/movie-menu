use std::sync::Arc;
use tasting_shrek_server::{app, serve, store::in_memory::InMemoryStore, HealthResponse};
use tokio::net::TcpListener;

async fn spawn_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind");
    let addr = listener.local_addr().expect("no local addr");
    tokio::spawn(serve(listener, app(Arc::new(InMemoryStore::new()))));
    format!("http://{addr}")
}

#[tokio::test]
async fn health_returns_200() {
    let base = spawn_server().await;
    let response = reqwest::get(format!("{base}/health"))
        .await
        .expect("request failed");

    assert_eq!(response.status(), 200);
}

#[tokio::test]
async fn health_returns_json_body() {
    let base = spawn_server().await;
    let body: HealthResponse = reqwest::get(format!("{base}/health"))
        .await
        .expect("request failed")
        .json()
        .await
        .expect("failed to deserialise");

    assert_eq!(body.status, "ok");
}
