mod common;

use serde_json::{json, Value};

async fn spawn_server() -> String {
    common::spawn_server(None).await
}

#[tokio::test]
async fn create_menu_returns_201_with_id() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let resp = client
        .post(format!("{base}/menus"))
        .json(&json!({
            "name": "My Film",
            "duration_secs": 7200,
            "schedule": [
                {
                    "ready_at_secs": 3600,
                    "recipe": {
                        "name": "Garlic bread",
                        "steps": [
                            { "duration_secs": 300, "note": "Preheat oven" },
                            { "duration_secs": 600, "note": "Bake bread" }
                        ]
                    }
                }
            ]
        }))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 201);
    let menu: Value = resp.json().await.expect("failed to deserialise");
    let id = menu["id"].as_str().expect("id must be a string");
    assert_eq!(id.len(), 5, "id must be exactly 5 characters");
    assert!(
        id.chars().all(|c| c.is_alphanumeric()),
        "id must be alphanumeric"
    );
    assert_eq!(menu["name"], "My Film");
    assert_eq!(menu["duration_secs"], 7200);
    assert_eq!(menu["schedule"].as_array().unwrap().len(), 1);
    assert_eq!(menu["schedule"][0]["ready_at_secs"], 3600);
    assert_eq!(menu["schedule"][0]["recipe"]["name"], "Garlic bread");
    assert_eq!(
        menu["schedule"][0]["recipe"]["steps"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(
        menu["started_at"].is_null(),
        "started_at must be null on creation"
    );
    // viewer settings default when not supplied
    assert_eq!(menu["viewer"]["upcoming_count"], 1);
    assert_eq!(menu["viewer"]["show_dish_names"], true);
}

#[tokio::test]
async fn viewer_settings_round_trip() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let created: Value = client
        .post(format!("{base}/menus"))
        .json(&json!({
            "name": "Surprise Menu",
            "duration_secs": 3600,
            "schedule": [],
            "viewer": { "upcoming_count": 2, "show_dish_names": false }
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(created["viewer"]["upcoming_count"], 2);
    assert_eq!(created["viewer"]["show_dish_names"], false);

    let id = created["id"].as_str().unwrap();
    let retrieved: Value = client
        .get(format!("{base}/menus/{id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(retrieved["viewer"]["upcoming_count"], 2);
    assert_eq!(retrieved["viewer"]["show_dish_names"], false);
}

#[tokio::test]
async fn get_menu_returns_created_menu() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let created: Value = client
        .post(format!("{base}/menus"))
        .json(&json!({
            "name": "Round Trip",
            "duration_secs": 3600,
            "schedule": []
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let id = created["id"].as_str().unwrap();

    let retrieved: Value = client
        .get(format!("{base}/menus/{id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(retrieved["id"], created["id"]);
    assert_eq!(retrieved["name"], "Round Trip");
    assert_eq!(retrieved["duration_secs"], 3600);
}

#[tokio::test]
async fn get_menu_returns_404_for_unknown_id() {
    let base = spawn_server().await;

    let resp = reqwest::get(format!("{base}/menus/ZZZZZ"))
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 404);
    let body: Value = resp.json().await.expect("failed to deserialise");
    assert!(body["error"].is_string(), "error field must be present");
}

#[tokio::test]
async fn update_menu_saves_schedule() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let created: Value = client
        .post(format!("{base}/menus"))
        .json(&json!({ "name": "Edit Me", "duration_secs": 600, "schedule": [] }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let id = created["id"].as_str().unwrap();

    let updated: Value = client
        .put(format!("{base}/menus/{id}"))
        .json(&json!({
            "name": "Edit Me",
            "duration_secs": 600,
            "schedule": [{
                "ready_at_secs": 300,
                "recipe": {
                    "name": "Popcorn",
                    "steps": [{ "duration_secs": 180, "note": "Microwave" }]
                }
            }]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(updated["schedule"].as_array().unwrap().len(), 1);
    assert_eq!(updated["schedule"][0]["recipe"]["name"], "Popcorn");
    assert_eq!(
        updated["schedule"][0]["recipe"]["steps"][0]["note"],
        "Microwave"
    );

    let retrieved: Value = client
        .get(format!("{base}/menus/{id}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(retrieved["schedule"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn update_menu_returns_404_for_unknown_id() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let resp = client
        .put(format!("{base}/menus/ZZZZZ"))
        .json(&json!({ "name": "Ghost", "duration_secs": 60, "schedule": [] }))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn start_screening_sets_started_at() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let created: Value = client
        .post(format!("{base}/menus"))
        .json(&json!({ "name": "Start Test", "duration_secs": 120, "schedule": [] }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let id = created["id"].as_str().unwrap();
    assert!(created["started_at"].is_null());

    let started: Value = client
        .post(format!("{base}/menus/{id}/start"))
        .send()
        .await
        .expect("request failed")
        .json()
        .await
        .unwrap();

    assert!(
        started["started_at"].is_number(),
        "started_at must be a timestamp after start"
    );
    assert_eq!(started["id"], created["id"]);
}

#[tokio::test]
async fn start_screening_accepts_future_screening_time() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let created: Value = client
        .post(format!("{base}/menus"))
        .json(&json!({ "name": "Late Show", "duration_secs": 120, "schedule": [] }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let id = created["id"].as_str().unwrap();

    let started: Value = client
        .post(format!("{base}/menus/{id}/start"))
        .json(&json!({ "start_at": 4102444800u64 }))
        .send()
        .await
        .expect("request failed")
        .json()
        .await
        .unwrap();

    assert_eq!(started["started_at"], 4102444800u64);
}

#[tokio::test]
async fn start_screening_returns_404_for_unknown_id() {
    let base = spawn_server().await;
    let client = reqwest::Client::new();

    let resp = client
        .post(format!("{base}/menus/ZZZZZ/start"))
        .send()
        .await
        .expect("request failed");

    assert_eq!(resp.status(), 404);
}
