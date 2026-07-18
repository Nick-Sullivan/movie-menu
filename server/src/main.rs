use std::sync::Arc;
use tasting_shrek_server::{
    app,
    images::ImageStore,
    serve,
    store::{dynamodb::DynamoDbStore, in_memory::InMemoryStore, MenuStore},
    AppState,
};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{port}");

    let use_dynamodb = matches!(std::env::var("STORE").as_deref(), Ok("dynamodb"));
    let images_bucket = std::env::var("IMAGES_BUCKET").ok();
    let config = if use_dynamodb || images_bucket.is_some() {
        Some(aws_config::load_from_env().await)
    } else {
        None
    };

    let store: Arc<dyn MenuStore> = if use_dynamodb {
        let table =
            std::env::var("DYNAMODB_TABLE").expect("DYNAMODB_TABLE required when STORE=dynamodb");
        Arc::new(DynamoDbStore::new(
            aws_sdk_dynamodb::Client::new(config.as_ref().unwrap()),
            table,
        ))
    } else {
        Arc::new(InMemoryStore::new())
    };

    let images = images_bucket.map(|bucket| {
        Arc::new(ImageStore::new(
            aws_sdk_s3::Client::new(config.as_ref().unwrap()),
            bucket,
        ))
    });
    if images.is_none() {
        tracing::info!("IMAGES_BUCKET not set; image endpoints disabled");
    }

    let listener = TcpListener::bind(&addr).await.expect("failed to bind");
    tracing::info!("listening on {addr}");
    serve(listener, app(AppState { store, images })).await;
}
