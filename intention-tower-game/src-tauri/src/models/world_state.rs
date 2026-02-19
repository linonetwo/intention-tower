use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use super::mind_graph::MindGraph;
use super::events::WorldEvent;
use super::commands::{CommandDTO, CommandDef};

/// Position in the 2D world
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

/// An item in the world
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldItem {
    pub id: String,
    pub schema_type: String, // schema.org type
    pub label: String,
    pub position: Position,
    pub abstract_type: Option<String>,
}

/// A character in the world
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldCharacter {
    pub id: String,
    pub label: String,
    pub position: Position,
    pub mind_graph: MindGraph,
}

/// The complete world state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldState {
    pub tick: u64,
    pub time_speed: u8, // 0-4
    pub paused: bool,
    pub seed: u64,
    pub characters: HashMap<String, WorldCharacter>,
    pub items: HashMap<String, WorldItem>,
    pub event_log: Vec<WorldEvent>,
    /// Available command definitions for the current level
    pub command_defs: Vec<CommandDef>,
    /// Tick-local pending events (cleared each tick)
    #[serde(skip)]
    pub pending_events: Vec<WorldEvent>,
    /// Commands queued by player/NPC for this tick
    #[serde(skip)]
    pub pending_commands: Vec<CommandDTO>,
    /// Whether we are in a virtual context (cyber dream etc)
    pub in_virtual_context: bool,
}

impl WorldState {
    pub fn new(seed: u64) -> Self {
        Self {
            tick: 0,
            time_speed: 1,
            paused: false,
            seed,
            characters: HashMap::new(),
            items: HashMap::new(),
            event_log: Vec::new(),
            command_defs: Vec::new(),
            pending_events: Vec::new(),
            pending_commands: Vec::new(),
            in_virtual_context: false,
        }
    }

    pub fn emit_event(&mut self, event: WorldEvent) {
        self.pending_events.push(event);
    }

    /// Flush pending events to the log and return them as StateDiff
    pub fn flush_events(&mut self) -> Vec<WorldEvent> {
        let events: Vec<WorldEvent> = self.pending_events.drain(..).collect();
        self.event_log.extend(events.clone());
        events
    }
}
