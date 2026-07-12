use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::store::StoreError;

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    Internal(String),
}

impl From<StoreError> for AppError {
    fn from(e: StoreError) -> Self {
        match e {
            StoreError::NotFound(id) => AppError::NotFound(format!("menu {id} not found")),
            StoreError::Conflict(id) => AppError::Internal(format!("menu {id} already exists")),
            StoreError::Internal(msg) => AppError::Internal(msg),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
