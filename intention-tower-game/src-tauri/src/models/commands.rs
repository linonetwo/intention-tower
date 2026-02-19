use serde::{Deserialize, Serialize};
use super::mind_node::Modality;
use super::events::WorldEvent;

/// A command submitted by the player (or NPC AI) to be executed by CommandSystem.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDTO {
    pub command_id: String,
    pub actor_id: String,
    pub target_id: Option<String>,
    pub effects: Vec<CommandEffect>,
}

/// Declarative command effects — no closures, fully serializable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CommandEffect {
    SpawnObservation {
        schema_id: String,
        modality: Modality,
        about: String,
        ttl: u64,
        strength: f64,
        target_character_id: Option<String>,
    },
    ModifyNodeValue {
        schema_id: String,
        delta: f64,
        target_character_id: Option<String>,
    },
    ConsumeResource {
        resource_schema_id: String,
        amount: f64,
        target_character_id: Option<String>,
    },
    ReinforceEdge {
        source_schema_id: String,
        target_schema_id: String,
        delta: f64,
        character_id: Option<String>,
    },
    WeakenEdge {
        source_schema_id: String,
        target_schema_id: String,
        delta: f64,
        character_id: Option<String>,
    },
    InjectMeme {
        meme_schema_id: String,
        target_character_id: Option<String>,
    },
    DeleteNode {
        schema_id: String,
        target_character_id: Option<String>,
    },
    ModifyResourceRegen {
        resource_schema_id: String,
        new_regen_rate: f64,
        target_character_id: Option<String>,
    },
    EmitWorldEvent {
        event: WorldEvent,
    },
}

/// Static definition of a command available in a level, loaded from JSON-LD.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDef {
    pub command_id: String,
    pub label: String, // i18n key
    pub hotkey: Option<String>,
    pub targeting: TargetingMode,
    pub preconditions: Vec<Precondition>,
    pub effect_templates: Vec<CommandEffect>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TargetingMode {
    RequiresTarget,
    NoTarget,
    OptionalTarget,
}

/// Atomic precondition — all must be satisfied (AND).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Precondition {
    EnvHasItem { item_schema_id: String },
    TargetHasNode { schema_id: String },
    TargetNodeActive { schema_id: String },
    TargetNodeValue { schema_id: String, op: CompareOp, threshold: f64 },
    ActorResource { resource_schema_id: String, op: CompareOp, threshold: f64 },
    IsVirtualContext { value: bool },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompareOp {
    GT,
    LT,
    GTE,
    LTE,
    EQ,
}

impl CompareOp {
    pub fn evaluate(&self, left: f64, right: f64) -> bool {
        match self {
            CompareOp::GT => left > right,
            CompareOp::LT => left < right,
            CompareOp::GTE => left >= right,
            CompareOp::LTE => left <= right,
            CompareOp::EQ => (left - right).abs() < f64::EPSILON,
        }
    }
}
