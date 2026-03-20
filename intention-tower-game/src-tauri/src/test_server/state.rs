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
    eval_chunks: Mutex<HashMap<String, EvalChunkBuffer>>,
}

struct EvalChunkBuffer {
    total: usize,
    parts: Vec<Option<String>>,
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
            eval_chunks: Mutex::new(HashMap::new()),
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
            eval_chunks: Mutex::new(HashMap::new()),
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

    pub fn push_eval_chunk(&self, id: &str, part: usize, total: usize, chunk: String) -> Option<serde_json::Value> {
        let mut chunks = self.eval_chunks.lock().ok()?;
        let entry = chunks.entry(id.to_string()).or_insert_with(|| EvalChunkBuffer {
            total,
            parts: vec![None; total],
        });

        if entry.total != total {
            entry.total = total;
            entry.parts = vec![None; total];
        }

        if part >= entry.total {
            return Some(serde_json::json!({ "error": "invalid_chunk_index" }));
        }

        entry.parts[part] = Some(chunk);
        let complete = entry.parts.iter().all(|p| p.is_some());
        if !complete {
            return None;
        }

        let mut merged = String::new();
        for p in &entry.parts {
            merged.push_str(p.as_deref().unwrap_or(""));
        }
        chunks.remove(id);

        let callback: Result<serde_json::Value, _> = serde_json::from_str(&merged);
        match callback {
            Ok(v) => Some(v),
            Err(e) => Some(serde_json::json!({ "error": format!("chunk_parse_failed: {}", e) })),
        }
    }
}
