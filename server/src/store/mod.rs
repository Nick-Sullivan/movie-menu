pub mod dynamodb;
pub mod in_memory;

use std::future::Future;
use std::pin::Pin;
use thiserror::Error;

use crate::models::Menu;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("menu not found: {0}")]
    NotFound(String),
    #[error("menu id already exists: {0}")]
    Conflict(String),
    #[error("internal store error: {0}")]
    Internal(String),
}

pub trait MenuStore: Send + Sync {
    fn save<'a>(
        &'a self,
        menu: Menu,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>>;

    fn get<'a>(
        &'a self,
        id: String,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>>;

    fn update<'a>(
        &'a self,
        menu: Menu,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>>;

    /// Mark the menu started. `start_at` is the screening time in unix seconds
    /// (possibly in the future); `None` means now.
    fn start<'a>(
        &'a self,
        id: String,
        start_at: Option<u64>,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>>;

    fn stop<'a>(
        &'a self,
        id: String,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>>;
}
