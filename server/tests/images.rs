use std::sync::Arc;

use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use serde_json::{json, Value};
use tasting_shrek_server::{
    app, images::ImageStore, serve, store::in_memory::InMemoryStore, AppState,
};
use tokio::net::TcpListener;

const BUCKET: &str = "test-images-bucket";

// Presigning is offline URL signing, so static dummy credentials are enough
// to exercise the endpoints without AWS.
fn test_image_store() -> Arc<ImageStore> {
    let config = aws_sdk_s3::Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new("ap-southeast-2"))
        .credentials_provider(Credentials::new("test", "test", None, None, "test"))
        .build();
    Arc::new(ImageStore::new(
        aws_sdk_s3::Client::from_conf(config),
        BUCKET.to_string(),
    ))
}

async fn spawn_server(images: Option<Arc<ImageStore>>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind");
    let addr = listener.local_addr().expect("no local addr");
    let state = AppState {
        store: Arc::new(InMemoryStore::new()),
        images,
    };
    tokio::spawn(serve(listener, app(state)));
    format!("http://{addr}")
}

// Redirects must not be followed: the presigned URL points at a bucket that
// doesn't exist, and the 302 itself is what's under test.
fn no_redirect_client() -> reqwest::Client {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client")
}

#[tokio::test]
async fn presign_returns_keys_and_upload_urls() {
    let base = spawn_server(Some(test_image_store())).await;

    let resp = reqwest::Client::new()
        .post(format!("{base}/images/presign"))
        .json(&json!({ "images": [
            { "content_type": "image/jpeg" },
            { "content_type": "image/webp" }
        ]}))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 200);
    let body: Value = resp.json().await.expect("json");
    let uploads = body["uploads"].as_array().expect("uploads array");
    assert_eq!(uploads.len(), 2);
    for upload in uploads {
        let key = upload["key"].as_str().expect("key");
        assert_eq!(key.len(), 32);
        assert!(key.bytes().all(|b| b.is_ascii_hexdigit()));
        let url = upload["url"].as_str().expect("url");
        assert!(url.contains(BUCKET));
        assert!(url.contains("X-Amz-Signature="));
    }
}

#[tokio::test]
async fn presign_rejects_unsupported_content_type() {
    let base = spawn_server(Some(test_image_store())).await;

    let resp = reqwest::Client::new()
        .post(format!("{base}/images/presign"))
        .json(&json!({ "images": [{ "content_type": "application/pdf" }] }))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn presign_rejects_empty_request() {
    let base = spawn_server(Some(test_image_store())).await;

    let resp = reqwest::Client::new()
        .post(format!("{base}/images/presign"))
        .json(&json!({ "images": [] }))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn view_image_redirects_to_presigned_url() {
    let base = spawn_server(Some(test_image_store())).await;
    let key = "0123456789abcdef0123456789abcdef";

    let resp = no_redirect_client()
        .get(format!("{base}/images/{key}"))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 307);
    let location = resp
        .headers()
        .get("location")
        .expect("location header")
        .to_str()
        .expect("utf8");
    assert!(location.contains(BUCKET));
    assert!(location.contains(key));
    assert!(location.contains("X-Amz-Signature="));
}

#[tokio::test]
async fn view_image_rejects_malformed_key() {
    let base = spawn_server(Some(test_image_store())).await;

    let resp = no_redirect_client()
        .get(format!("{base}/images/not-a-real-key"))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn image_endpoints_are_503_when_unconfigured() {
    let base = spawn_server(None).await;
    let client = no_redirect_client();

    let presign = client
        .post(format!("{base}/images/presign"))
        .json(&json!({ "images": [{ "content_type": "image/jpeg" }] }))
        .send()
        .await
        .expect("request failed");
    assert_eq!(presign.status(), 503);

    let view = client
        .get(format!("{base}/images/0123456789abcdef0123456789abcdef"))
        .send()
        .await
        .expect("request failed");
    assert_eq!(view.status(), 503);
}

#[tokio::test]
async fn menus_round_trip_recipe_image_keys() {
    let base = spawn_server(Some(test_image_store())).await;
    let client = reqwest::Client::new();

    let created: Value = client
        .post(format!("{base}/menus"))
        .json(&json!({
            "name": "Film night",
            "duration_secs": 5400,
            "schedule": [{
                "ready_at_secs": 1800,
                "recipe": {
                    "name": "Onion soup",
                    "image_key": "0123456789abcdef0123456789abcdef",
                    "steps": [{ "duration_secs": 600, "note": "Caramelise" }]
                }
            }]
        }))
        .send()
        .await
        .expect("create failed")
        .json()
        .await
        .expect("json");

    let id = created["id"].as_str().expect("id");
    let fetched: Value = client
        .get(format!("{base}/menus/{id}"))
        .send()
        .await
        .expect("get failed")
        .json()
        .await
        .expect("json");

    assert_eq!(
        fetched["schedule"][0]["recipe"]["image_key"],
        "0123456789abcdef0123456789abcdef"
    );
    // Recipes without an image serialise without the field at all.
    assert!(created["schedule"][0]["recipe"]
        .as_object()
        .expect("recipe")
        .contains_key("image_key"));
}
