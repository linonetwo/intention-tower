use std::sync::Arc;

use intention_tower_game_lib::test_server::{run_test_server, TestServerState};

#[tokio::main]
async fn main() {
    let port = std::env::var("TEST_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(9222);
    run_test_server(Arc::new(TestServerState::new()), port).await;
}
