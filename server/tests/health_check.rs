mod common;

use the_movie_menu_server::HealthResponse;

async fn spawn_server() -> String {
    common::spawn_server(None).await
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
