use super::commands::{CommandDTO, CommandDef};
use super::economy::EconomyState;
use super::events::WorldEvent;
use super::mind_graph::MindGraph;
use super::progress::LevelProgress;
use super::social::SocialGroupState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    #[serde(default)]
    pub owner_id: Option<String>,
    #[serde(default)]
    pub quantity: f64,
    #[serde(default = "default_unit_price")]
    pub unit_price: f64,
}

const fn default_unit_price() -> f64 {
    1.0
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
    /// The level directory ID (e.g. "pavlov")
    #[serde(default)]
    pub level_id: String,
    #[serde(default)]
    pub level_label: String,
    #[serde(default)]
    pub level_description: String,
    #[serde(default = "default_ui_mode")]
    pub initial_mode: String,
    #[serde(default)]
    pub default_actor_id: Option<String>,
    #[serde(default)]
    pub default_target_id: Option<String>,
    pub characters: HashMap<String, WorldCharacter>,
    pub items: HashMap<String, WorldItem>,
    pub event_log: Vec<WorldEvent>,
    /// Available command definitions for the current level
    pub command_defs: Vec<CommandDef>,
    /// Tick-local pending events (cleared each tick)
    #[serde(skip)]
    pub pending_events: Vec<WorldEvent>,
    /// Commands queued by player/NPC for this tick.
    /// Visible to frontend so the UI can show "queued" buttons.
    #[serde(default)]
    pub pending_commands: Vec<CommandDTO>,
    /// Whether we are in a virtual context (cyber dream etc)
    pub in_virtual_context: bool,
    /// Serializable nesting stack for dream-within-dream and mixed reality levels.
    #[serde(default)]
    pub virtual_context_stack: Vec<String>,
    /// Derived cross-character identity groups and collective decisions.
    #[serde(default)]
    pub social_groups: HashMap<String, SocialGroupState>,
    /// Serializable accounts, holdings, market assets, and transaction log.
    #[serde(default)]
    pub economy: EconomyState,
    /// Authoritative, serializable objective and outcome state.
    #[serde(default)]
    pub progress: LevelProgress,
}

fn default_ui_mode() -> String {
    "observe".to_string()
}

impl WorldState {
    pub fn new(seed: u64) -> Self {
        Self {
            tick: 0,
            time_speed: 1,
            paused: false,
            seed,
            level_id: String::new(),
            level_label: String::new(),
            level_description: String::new(),
            initial_mode: default_ui_mode(),
            default_actor_id: None,
            default_target_id: None,
            characters: HashMap::new(),
            items: HashMap::new(),
            event_log: Vec::new(),
            command_defs: Vec::new(),
            pending_events: Vec::new(),
            pending_commands: Vec::new(),
            in_virtual_context: false,
            virtual_context_stack: Vec::new(),
            social_groups: HashMap::new(),
            economy: EconomyState::default(),
            progress: LevelProgress::default(),
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
