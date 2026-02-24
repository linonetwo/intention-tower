use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use crate::models::world_state::WorldState;
use crate::systems::runner::SimulationRunner;

use super::channel::TestMessage;

pub struct TestServerState {
    pub world: Mutex<WorldState>,
    pub runner: SimulationRunner,
    pub webview_tx: Option<crossbeam_channel::Sender<TestMessage>>,
    callback_port: u16,
    eval_seq: AtomicU64,
    eval_results: Mutex<HashMap<String, serde_json::Value>>,
}

impl TestServerState {
    pub fn new() -> Self {
        Self {
            world: Mutex::new(WorldState::new(42)),
            runner: SimulationRunner::new(),
            webview_tx: None,
            callback_port: 0,
            eval_seq: AtomicU64::new(1),
            eval_results: Mutex::new(HashMap::new()),
        }
    }

    pub fn with_channel(tx: crossbeam_channel::Sender<TestMessage>, port: u16) -> Self {
        Self {
            world: Mutex::new(WorldState::new(42)),
            runner: SimulationRunner::new(),
            webview_tx: Some(tx),
            callback_port: port,
            eval_seq: AtomicU64::new(1),
            eval_results: Mutex::new(HashMap::new()),
        }
    }

    pub fn callback_port(&self) -> u16 {
        self.callback_port
    }

    pub fn next_eval_id(&self) -> String {
        let id = self.eval_seq.fetch_add(1, Ordering::Relaxed);
        format!("eval-{}", id)
    }

    pub fn store_eval_result(&self, id: String, value: serde_json::Value) {
        if let Ok(mut map) = self.eval_results.lock() {
            map.insert(id, value);
        }
    }

    pub fn take_eval_result(&self, id: &str) -> Option<serde_json::Value> {
        self.eval_results.lock().ok().and_then(|mut map| map.remove(id))
    }
}
