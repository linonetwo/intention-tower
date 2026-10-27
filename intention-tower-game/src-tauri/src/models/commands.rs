use super::events::WorldEvent;
use super::mind_node::{MemeData, Modality, SignalType};
use serde::{Deserialize, Serialize};

/// Opt-in causal social consequence. Each entry pairs one cue with its motor outcome.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionCreditConfig {
    pub actions: Vec<ActionCreditAction>,
    #[serde(alias = "emitterId")]
    pub emitter_id: String,
    #[serde(alias = "groupContext")]
    pub group_context: String,
    #[serde(alias = "maxAgeTicks")]
    pub max_age_ticks: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActionCreditAction {
    #[serde(alias = "actionSchemaId")]
    pub action_schema_id: String,
    #[serde(alias = "stimulusSchemaId")]
    pub stimulus_schema_id: String,
    pub posture: super::scene::CharacterPosture,
}

impl ActionCreditConfig {
    pub fn valid(&self) -> bool {
        !self.actions.is_empty()
            && !self.emitter_id.trim().is_empty()
            && !self.group_context.trim().is_empty()
            && (1..=1000).contains(&self.max_age_ticks)
            && self.actions.iter().all(|action| {
                !action.action_schema_id.trim().is_empty()
                    && !action.stimulus_schema_id.trim().is_empty()
            })
    }
}

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
    EnterLayer,
    ExitLayer,
    ObserveLayer,
    CompareLayers,
    EarnLayerReward,
    SatisfyLayerNeed,
    ApplyMemoryDrug,
    AnchorCurrentRoom,
    RecallRoomWithWitness,
    ObserveCurrentRoom,
    MoveCharacter {
        delta_x: f64,
        delta_y: f64,
        target_character_id: Option<String>,
    },
    SpawnObservation {
        schema_id: String,
        modality: Modality,
        about: String,
        ttl: u64,
        strength: f64,
        #[serde(
            default = "super::mind_node::default_social_reward_scale",
            alias = "socialRewardScale"
        )]
        social_reward_scale: f64,
        #[serde(default)]
        signal_type: Option<SignalType>,
        #[serde(default)]
        group_context: Option<String>,
        #[serde(default, alias = "actionCredit")]
        action_credit: Option<ActionCreditConfig>,
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
        #[serde(default)]
        meme: MemeData,
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
    SetVirtualContext {
        value: bool,
    },
    SetAssetPrice {
        item_id: String,
        unit_price: f64,
    },
    TradeAsset {
        item_id: String,
        buyer_id: String,
        seller_id: String,
        quantity: f64,
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
    ActorIs {
        character_ids: Vec<String>,
    },
    TargetIs {
        character_ids: Vec<String>,
    },
    TargetIsNotActor,
    EnvHasItem {
        item_schema_id: String,
    },
    TargetHasNode {
        schema_id: String,
    },
    TargetNodeActive {
        schema_id: String,
    },
    TargetActionSelected {
        schema_id: String,
    },
    /// A real motor response is still eligible for a subsequent reward.
    TargetActionExecuted {
        schema_id: String,
    },
    TargetNodeValue {
        schema_id: String,
        op: CompareOp,
        threshold: f64,
    },
    ActorResource {
        resource_schema_id: String,
        op: CompareOp,
        threshold: f64,
    },
    IsVirtualContext {
        value: bool,
    },
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
