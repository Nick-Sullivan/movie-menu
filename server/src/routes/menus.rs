use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{Menu, ScheduleEntry, ViewerSettings},
    store::{MenuStore, StoreError},
};

const CODE_CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn generate_code() -> String {
    let bytes = Uuid::new_v4();
    let bytes = bytes.as_bytes();
    (0..5)
        .map(|i| CODE_CHARS[bytes[i] as usize % CODE_CHARS.len()] as char)
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct CreateMenuRequest {
    pub name: String,
    pub duration_secs: u64,
    pub schedule: Vec<ScheduleEntry>,
    #[serde(default)]
    pub viewer: ViewerSettings,
}

pub async fn create_menu(
    State(store): State<Arc<dyn MenuStore>>,
    Json(req): Json<CreateMenuRequest>,
) -> Result<impl IntoResponse, AppError> {
    let saved = loop {
        let menu = Menu {
            id: generate_code(),
            name: req.name.clone(),
            duration_secs: req.duration_secs,
            schedule: req.schedule.clone(),
            started_at: None,
            viewer: req.viewer.clone(),
        };
        match store.save(menu).await {
            Ok(saved) => break saved,
            Err(StoreError::Conflict(_)) => continue,
            Err(e) => return Err(e.into()),
        }
    };
    Ok((StatusCode::CREATED, Json(saved)))
}

pub async fn get_menu(
    State(store): State<Arc<dyn MenuStore>>,
    Path(id): Path<String>,
) -> Result<Json<Menu>, AppError> {
    let menu = store.get(id).await?;
    Ok(Json(menu))
}

pub async fn update_menu(
    State(store): State<Arc<dyn MenuStore>>,
    Path(id): Path<String>,
    Json(req): Json<CreateMenuRequest>,
) -> Result<Json<Menu>, AppError> {
    let existing = store.get(id.clone()).await?;
    let updated = Menu {
        id,
        name: req.name,
        duration_secs: req.duration_secs,
        schedule: req.schedule,
        started_at: existing.started_at,
        viewer: req.viewer,
    };
    let saved = store.update(updated).await?;
    Ok(Json(saved))
}

#[derive(Debug, Deserialize)]
pub struct StartScreeningRequest {
    /// Unix seconds of the actual screening time; may be in the future.
    /// Omitted (or no body at all) means "start now".
    pub start_at: Option<u64>,
}

pub async fn start_screening(
    State(store): State<Arc<dyn MenuStore>>,
    Path(id): Path<String>,
    body: Option<Json<StartScreeningRequest>>,
) -> Result<Json<Menu>, AppError> {
    let start_at = body.and_then(|Json(b)| b.start_at);
    let menu = store.start(id, start_at).await?;
    Ok(Json(menu))
}

pub async fn stop_screening(
    State(store): State<Arc<dyn MenuStore>>,
    Path(id): Path<String>,
) -> Result<Json<Menu>, AppError> {
    let menu = store.stop(id).await?;
    Ok(Json(menu))
}
