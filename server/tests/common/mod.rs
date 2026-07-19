use std::sync::Arc;

use the_movie_menu_server::{
    app, images::ImageStore, serve, store::in_memory::InMemoryStore, AppState,
};
use tokio::net::TcpListener;

/// Spawn the app on an ephemeral port against a fresh in-memory store,
/// returning its base URL.
pub async fn spawn_server(images: Option<Arc<ImageStore>>) -> String {
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
