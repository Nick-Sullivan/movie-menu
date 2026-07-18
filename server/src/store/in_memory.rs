use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{MenuStore, StoreError};
use crate::models::Menu;

#[derive(Clone, Default)]
pub struct InMemoryStore {
    inner: Arc<Mutex<HashMap<String, Menu>>>,
}

impl InMemoryStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl MenuStore for InMemoryStore {
    fn save<'a>(
        &'a self,
        menu: Menu,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let mut map = inner
                .lock()
                .map_err(|e| StoreError::Internal(e.to_string()))?;
            if map.contains_key(&menu.id) {
                return Err(StoreError::Conflict(menu.id));
            }
            map.insert(menu.id.clone(), menu.clone());
            Ok(menu)
        })
    }

    fn get<'a>(
        &'a self,
        id: String,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let map = inner
                .lock()
                .map_err(|e| StoreError::Internal(e.to_string()))?;
            map.get(&id).cloned().ok_or(StoreError::NotFound(id))
        })
    }

    fn update<'a>(
        &'a self,
        menu: Menu,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let mut map = inner
                .lock()
                .map_err(|e| StoreError::Internal(e.to_string()))?;
            if !map.contains_key(&menu.id) {
                return Err(StoreError::NotFound(menu.id));
            }
            map.insert(menu.id.clone(), menu.clone());
            Ok(menu)
        })
    }

    fn start<'a>(
        &'a self,
        id: String,
        start_at: Option<u64>,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| StoreError::Internal(e.to_string()))?
                .as_secs();
            let mut map = inner
                .lock()
                .map_err(|e| StoreError::Internal(e.to_string()))?;
            let menu = map.get_mut(&id).ok_or(StoreError::NotFound(id))?;
            if menu.started_at.is_none() {
                menu.started_at = Some(start_at.unwrap_or(now));
            }
            Ok(menu.clone())
        })
    }

    fn stop<'a>(
        &'a self,
        id: String,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        let inner = Arc::clone(&self.inner);
        Box::pin(async move {
            let mut map = inner
                .lock()
                .map_err(|e| StoreError::Internal(e.to_string()))?;
            let menu = map.get_mut(&id).ok_or(StoreError::NotFound(id))?;
            menu.started_at = None;
            Ok(menu.clone())
        })
    }
}
