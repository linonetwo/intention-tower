use serde::{Deserialize, Serialize};

// ── Enums ──

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeType {
    Observation,
    PriorInstinct,
    Motivation,
    Action,
    Meme,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Modality {
    Visual,
    Auditory,
    Olfactory,
    Gustatory,
    Tactile,
    Interoceptive,
    Chemical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ObservationSource {
    Environment,
    Body,
    Virtual,
    Implant,
    Chemical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BrainRegion {
    Brainstem,
    Hypothalamus,
    Limbic,
    #[serde(rename = "PFC")]
    Pfc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Valence {
    Positive,
    Negative,
    Neutral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpreadVector {
    Language,
    Visual,
    Auditory,
    DirectInjection,
    Chemical,
    Magic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConflictResolution {
    BeliefWins,
    InstinctWins,
    StressDependent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Polarity {
    Excitatory,
    Inhibitory,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LearnType {
    Classical,
    Operant,
    Imprinting,
    Social,
    DirectInjection,
    MemeInfection,
    InnerCut,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SignalType {
    Status,
    Belonging,
    Threat,
    Approval,
    Rejection,
    Chemical,
}

// ── Threshold ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdTrigger {
    pub trigger_id: String,
    pub spawn_schema_id: String,
    pub spawn_node_type: NodeType,
    pub activate_on_rising_above: f64,
    pub deactivate_on_falling_below: f64,
    /// Runtime: ID of the spawned instance, if currently active.
    pub managed_instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThresholdModifier {
    pub target_schema_id: String,
    pub affects_field: String, // "activateOnRisingAbove" | "deactivateOnFallingBelow"
    pub delta: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceCost {
    pub resource_schema_id: String,
    pub amount: f64,
}

// ── Observation fields ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ObservationData {
    pub modality: Option<Modality>,
    pub about: Option<String>,
    pub novelty_key: Option<String>,
    pub credibility: f64,
    pub satisfaction: f64,
    pub source: Option<ObservationSource>,
    pub is_signal: bool,
    pub signal_type: Option<SignalType>,
    pub emitter_id: Option<String>,
    pub group_context: Option<String>,
    pub replica_of: Option<String>,
}

// ── PriorInstinct fields ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PriorInstinctData {
    pub set_point: f64,
    pub satisfied_by_about: Vec<String>,
    pub brain_region: Option<BrainRegion>,
    pub overridable_by_meme: bool,
    pub threshold_modifiers: Vec<ThresholdModifier>,
    pub is_mood: bool,
    pub valence: Option<Valence>,
    pub arousal: Option<f64>,
    pub is_resource: bool,
}

// ── Motivation fields ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MotivationData {
    pub spawned_by: Option<String>,
    pub lookback_window_sec: f64,
    pub goal: Option<String>,
    pub is_chained: bool,
    pub chain_target: Option<String>,
    pub target_entity: Option<String>,
    pub critical_period_end: Option<u64>,
    pub is_persistent: bool,
    pub suppressed_by: Vec<String>,
}

// ── Action fields ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ActionData {
    pub innate: bool,
    pub goap: bool,
    pub sub_action_schemas: Vec<String>,
    pub proficiency_level: f64,
}

// ── Meme fields ──

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MemeData {
    pub constituent_schemas: Vec<String>,
    pub binding_sites: Vec<String>,
    pub spread_vector: Option<SpreadVector>,
    pub is_magic: bool,
    pub is_belief: bool,
    pub overrides_instinct: Vec<String>,
    pub conflict_resolution: Option<ConflictResolution>,
    pub is_identity: bool,
    pub group_id: Option<String>,
    pub reinforced_by: Vec<String>,
    pub is_attention_flood: bool,
    pub flood_node_count: Option<u32>,
    pub flood_drain_rate_per_tick: Option<f64>,
    pub is_anti_meme: bool,
    pub anti_meme_target_pattern: Option<String>,
    /// How hard it is to remove this meme once installed (0.0 = trivial, 1.0 = thought-seal)
    /// Key for: 水是有毒的（思想钢印）, 信仰与意识形态
    pub resilience: f64,
}

// ── MindNode ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindNode {
    pub instance_id: String,
    pub schema_id: String,
    pub label: String, // i18n key
    pub node_type: NodeType,
    pub value: f64,
    pub value_velocity: f64,
    pub strength: f64,
    pub active: bool,
    pub created_at: u64,
    pub ttl: Option<u64>,
    pub hidden_by_default: bool,
    pub thresholds: Vec<ThresholdTrigger>,
    pub costs: Vec<ResourceCost>,

    // Type-specific data (only one should be populated)
    pub observation: Option<ObservationData>,
    pub prior_instinct: Option<PriorInstinctData>,
    pub motivation: Option<MotivationData>,
    pub action: Option<ActionData>,
    pub meme: Option<MemeData>,

    // Runtime tracking
    /// Previous tick's value, for threshold crossing detection
    pub prev_value: f64,
    /// 0 = base reality, 1+ = nested virtual context depth.
    /// Key for: 触发网瘾, 赛博梦中梦, 网瘾少年, 幻境挣扎
    pub reality_layer: u8,
    /// If true, this node was spawned in a virtual context (visual distinction)
    pub is_virtual: bool,
}

impl MindNode {
    pub fn is_resource(&self) -> bool {
        self.prior_instinct.as_ref().map_or(false, |pi| pi.is_resource)
    }

    pub fn is_mood(&self) -> bool {
        self.prior_instinct.as_ref().map_or(false, |pi| pi.is_mood)
    }
}

// ── AssociationEdge ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub co_occurrence_count: u32,
    pub last_co_occurred_at: u64,
    pub window_sec: f64,
}

impl Default for Evidence {
    fn default() -> Self {
        Self {
            co_occurrence_count: 0,
            last_co_occurred_at: 0,
            window_sec: 10.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssociationEdge {
    pub edge_id: String,
    pub source_instance_id: String,
    pub target_instance_id: String,
    pub polarity: Polarity,
    pub weight: f64,
    pub learnable: bool,
    pub decay_rate_per_tick: f64,
    pub learn_type: LearnType,
    pub evidence: Evidence,
}
