use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::time::{SystemTime, UNIX_EPOCH};

use aws_sdk_dynamodb::error::SdkError;
use aws_sdk_dynamodb::operation::put_item::PutItemError;
use aws_sdk_dynamodb::operation::update_item::UpdateItemError;
use aws_sdk_dynamodb::types::{AttributeValue, ReturnValue};

use crate::models::{Menu, ScheduleEntry, ViewerSettings};
use super::{MenuStore, StoreError};

pub struct DynamoDbStore {
    client: aws_sdk_dynamodb::Client,
    table_name: String,
}

impl DynamoDbStore {
    pub fn new(client: aws_sdk_dynamodb::Client, table_name: String) -> Self {
        Self { client, table_name }
    }
}

const TTL_SECS: u64 = 7 * 24 * 60 * 60;

fn menu_to_item(menu: &Menu) -> Result<HashMap<String, AttributeValue>, StoreError> {
    let schedule_json = serde_json::to_string(&menu.schedule)
        .map_err(|e| StoreError::Internal(e.to_string()))?;
    let viewer_json = serde_json::to_string(&menu.viewer)
        .map_err(|e| StoreError::Internal(e.to_string()))?;

    let mut item = HashMap::from([
        ("id".to_string(), AttributeValue::S(menu.id.clone())),
        ("name".to_string(), AttributeValue::S(menu.name.clone())),
        ("duration_secs".to_string(), AttributeValue::N(menu.duration_secs.to_string())),
        ("schedule".to_string(), AttributeValue::S(schedule_json)),
        ("viewer".to_string(), AttributeValue::S(viewer_json)),
    ]);

    if let Some(ts) = menu.started_at {
        item.insert("started_at".to_string(), AttributeValue::N(ts.to_string()));
    }

    Ok(item)
}

fn item_to_menu(item: &HashMap<String, AttributeValue>) -> Result<Menu, StoreError> {
    let id = get_s(item, "id")?;
    let name = get_s(item, "name")?;
    let duration_secs = get_n(item, "duration_secs")?;
    let schedule: Vec<ScheduleEntry> = serde_json::from_str(&get_s(item, "schedule")?)
        .map_err(|e| StoreError::Internal(e.to_string()))?;
    let started_at = item
        .get("started_at")
        .and_then(|v| v.as_n().ok())
        .and_then(|s| s.parse::<u64>().ok());
    // Older items have no viewer attribute; fall back to defaults.
    let viewer: ViewerSettings = item
        .get("viewer")
        .and_then(|v| v.as_s().ok())
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    Ok(Menu { id, name, duration_secs, schedule, started_at, viewer })
}

fn get_s(item: &HashMap<String, AttributeValue>, key: &str) -> Result<String, StoreError> {
    item.get(key)
        .and_then(|v| v.as_s().ok())
        .map(|s| s.clone())
        .ok_or_else(|| StoreError::Internal(format!("missing or invalid attribute: {key}")))
}

fn get_n(item: &HashMap<String, AttributeValue>, key: &str) -> Result<u64, StoreError> {
    item.get(key)
        .and_then(|v| v.as_n().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or_else(|| StoreError::Internal(format!("missing or invalid attribute: {key}")))
}

fn is_conditional_check_failed_put(err: &SdkError<PutItemError>) -> bool {
    matches!(
        err,
        SdkError::ServiceError(e) if e.err().is_conditional_check_failed_exception()
    )
}

fn is_conditional_check_failed_update(err: &SdkError<UpdateItemError>) -> bool {
    matches!(
        err,
        SdkError::ServiceError(e) if e.err().is_conditional_check_failed_exception()
    )
}

impl MenuStore for DynamoDbStore {
    fn save<'a>(
        &'a self,
        menu: Menu,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        Box::pin(async move {
            let expires_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| StoreError::Internal(e.to_string()))?
                .as_secs()
                + TTL_SECS;

            let mut item = menu_to_item(&menu)?;
            item.insert("expires_at".to_string(), AttributeValue::N(expires_at.to_string()));

            self.client
                .put_item()
                .table_name(&self.table_name)
                .set_item(Some(item))
                .condition_expression("attribute_not_exists(id)")
                .send()
                .await
                .map_err(|e| {
                    if is_conditional_check_failed_put(&e) {
                        StoreError::Conflict(menu.id.clone())
                    } else {
                        StoreError::Internal(e.to_string())
                    }
                })?;
            Ok(menu)
        })
    }

    fn get<'a>(
        &'a self,
        id: String,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        Box::pin(async move {
            let result = self.client
                .get_item()
                .table_name(&self.table_name)
                .key("id", AttributeValue::S(id.clone()))
                .send()
                .await
                .map_err(|e| StoreError::Internal(e.to_string()))?;

            let item = result.item().ok_or_else(|| StoreError::NotFound(id))?;
            item_to_menu(item)
        })
    }

    fn update<'a>(
        &'a self,
        menu: Menu,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        Box::pin(async move {
            let item = menu_to_item(&menu)?;
            self.client
                .put_item()
                .table_name(&self.table_name)
                .set_item(Some(item))
                .condition_expression("attribute_exists(id)")
                .send()
                .await
                .map_err(|e| {
                    if is_conditional_check_failed_put(&e) {
                        StoreError::NotFound(menu.id.clone())
                    } else {
                        StoreError::Internal(e.to_string())
                    }
                })?;
            Ok(menu)
        })
    }

    fn start<'a>(
        &'a self,
        id: String,
        start_at: Option<u64>,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        Box::pin(async move {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| StoreError::Internal(e.to_string()))?
                .as_secs();
            let ts = start_at.unwrap_or(now);

            let result = self.client
                .update_item()
                .table_name(&self.table_name)
                .key("id", AttributeValue::S(id.clone()))
                .update_expression("SET started_at = if_not_exists(started_at, :ts)")
                .expression_attribute_values(":ts", AttributeValue::N(ts.to_string()))
                .condition_expression("attribute_exists(id)")
                .return_values(ReturnValue::AllNew)
                .send()
                .await
                .map_err(|e| {
                    if is_conditional_check_failed_update(&e) {
                        StoreError::NotFound(id.clone())
                    } else {
                        StoreError::Internal(e.to_string())
                    }
                })?;

            let attributes = result.attributes().ok_or_else(|| {
                StoreError::Internal("update_item returned no attributes".to_string())
            })?;
            item_to_menu(attributes)
        })
    }

    fn stop<'a>(
        &'a self,
        id: String,
    ) -> Pin<Box<dyn Future<Output = Result<Menu, StoreError>> + Send + 'a>> {
        Box::pin(async move {
            let result = self.client
                .update_item()
                .table_name(&self.table_name)
                .key("id", AttributeValue::S(id.clone()))
                .update_expression("REMOVE started_at")
                .condition_expression("attribute_exists(id)")
                .return_values(ReturnValue::AllNew)
                .send()
                .await
                .map_err(|e| {
                    if is_conditional_check_failed_update(&e) {
                        StoreError::NotFound(id.clone())
                    } else {
                        StoreError::Internal(e.to_string())
                    }
                })?;

            let attributes = result.attributes().ok_or_else(|| {
                StoreError::Internal("update_item returned no attributes".to_string())
            })?;
            item_to_menu(attributes)
        })
    }
}
