use std::sync::Arc;
use tasting_shrek_server::{
    app, serve,
    store::{dynamodb::DynamoDbStore, in_memory::InMemoryStore, MenuStore},
};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{port}");

    let store: Arc<dyn MenuStore> = match std::env::var("STORE").as_deref() {
        Ok("dynamodb") => {
            let table = std::env::var("DYNAMODB_TABLE")
                .expect("DYNAMODB_TABLE required when STORE=dynamodb");
            let config = aws_config::load_from_env().await;
            Arc::new(DynamoDbStore::new(
                aws_sdk_dynamodb::Client::new(&config),
                table,
            ))
        }
        _ => Arc::new(InMemoryStore::new()),
    };

    let listener = TcpListener::bind(&addr).await.expect("failed to bind");
    tracing::info!("listening on {addr}");
    serve(listener, app(store)).await;
}
