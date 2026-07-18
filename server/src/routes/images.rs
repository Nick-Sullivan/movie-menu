use axum::{
    extract::{Path, State},
    response::Redirect,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{error::AppError, images::is_valid_key, images::ImageStore, AppState};

/// More images than any menu's schedule could plausibly hold.
const MAX_UPLOADS_PER_REQUEST: usize = 20;
const ALLOWED_CONTENT_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp"];

#[derive(Debug, Deserialize)]
pub struct PresignRequest {
    pub images: Vec<PresignRequestItem>,
}

#[derive(Debug, Deserialize)]
pub struct PresignRequestItem {
    pub content_type: String,
}

#[derive(Debug, Serialize)]
pub struct PresignResponse {
    pub uploads: Vec<PresignedUploadResponse>,
}

#[derive(Debug, Serialize)]
pub struct PresignedUploadResponse {
    pub key: String,
    pub url: String,
}

fn image_store(state: &AppState) -> Result<&Arc<ImageStore>, AppError> {
    state
        .images
        .as_ref()
        .ok_or_else(|| AppError::Unconfigured("image storage is not configured".to_string()))
}

pub async fn presign_uploads(
    State(state): State<AppState>,
    Json(req): Json<PresignRequest>,
) -> Result<Json<PresignResponse>, AppError> {
    let images = image_store(&state)?;

    if req.images.is_empty() {
        return Err(AppError::BadRequest("no images requested".to_string()));
    }
    if req.images.len() > MAX_UPLOADS_PER_REQUEST {
        return Err(AppError::BadRequest(format!(
            "at most {MAX_UPLOADS_PER_REQUEST} images per request"
        )));
    }

    let mut uploads = Vec::with_capacity(req.images.len());
    for item in &req.images {
        if !ALLOWED_CONTENT_TYPES.contains(&item.content_type.as_str()) {
            return Err(AppError::BadRequest(format!(
                "unsupported content type: {}",
                item.content_type
            )));
        }
        let upload = images
            .presign_put(&item.content_type)
            .await
            .map_err(AppError::Internal)?;
        uploads.push(PresignedUploadResponse {
            key: upload.key,
            url: upload.url,
        });
    }

    Ok(Json(PresignResponse { uploads }))
}

/// Images are served by redirect to a freshly presigned S3 URL rather than
/// by URLs embedded in menu responses: viewers keep a screening open for
/// hours, and presigned URLs die with the Lambda's rotating role credentials.
pub async fn view_image(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Redirect, AppError> {
    let images = image_store(&state)?;

    if !is_valid_key(&key) {
        return Err(AppError::NotFound("image not found".to_string()));
    }

    let url = images.presign_get(&key).await.map_err(AppError::Internal)?;
    Ok(Redirect::temporary(&url))
}
