use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomVariant {
    pub id: String,
    pub background_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryRoom {
    pub room_id: String,
    pub variants: Vec<RoomVariant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoomMemoryConfig {
    pub observer_ids: Vec<String>,
    pub witness_ids: Vec<String>,
    pub rooms: Vec<MemoryRoom>,
    #[serde(default = "default_fade")]
    pub fade_after_ticks: u64,
    #[serde(default = "default_forget")]
    pub forget_after_ticks: u64,
    #[serde(default = "default_drug_duration")]
    pub drug_duration_ticks: u64,
    pub drug_item_id: String,
    pub observation_schema_id: String,
    /// Optional authored node identity for one room; all others use room-memory:<room>.
    #[serde(default)]
    pub observation_node_ids: HashMap<String, String>,
}

fn default_fade() -> u64 {
    3
}
fn default_forget() -> u64 {
    6
}
fn default_drug_duration() -> u64 {
    40
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomMemoryPhase {
    Visible,
    Remembered,
    Fading,
    Forgotten,
    Anchored,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgottenRevisit {
    pub left_at_tick: u64,
    pub forgotten_at_tick: u64,
    pub revisited_at_tick: u64,
    pub generation: u64,
    pub previous_variant_id: String,
    pub variant_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchoredRevisit {
    pub left_at_tick: u64,
    pub returned_at_tick: u64,
    pub anchored_at_tick: u64,
    pub drug_used_at_tick: u64,
    pub drug_until_tick: u64,
    pub generation: u64,
    pub variant_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WitnessRecall {
    pub witness_id: String,
    pub meeting_room_id: String,
    pub recalled_at_tick: u64,
    pub revisited_at_tick: u64,
    pub generation: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomMemoryEntry {
    pub phase: RoomMemoryPhase,
    pub generation: u64,
    pub variant_id: String,
    pub background_key: String,
    pub visit_count: u64,
    pub entered_at_tick: u64,
    pub last_seen_tick: u64,
    pub left_at_tick: Option<u64>,
    pub forgotten_at_tick: Option<u64>,
    pub forgotten_count: u64,
    pub revisit_count: u64,
    pub anchored_at_tick: Option<u64>,
    pub anchor_drug_used_at_tick: Option<u64>,
    pub anchor_drug_until_tick: Option<u64>,
    pub anchored_revisit_count: u64,
    #[serde(default)]
    pub forgotten_revisits: Vec<ForgottenRevisit>,
    #[serde(default)]
    pub anchored_revisits: Vec<AnchoredRevisit>,
    #[serde(default)]
    pub witness_recalls: Vec<WitnessRecall>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ObserverRoomMemory {
    #[serde(default)]
    pub rooms: HashMap<String, RoomMemoryEntry>,
    #[serde(default)]
    pub drug_until_tick: Option<u64>,
    #[serde(default)]
    pub drug_used_at_tick: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RoomMemoryEvidence {
    ForgottenRevisit,
    WitnessRecall,
    AnchoredRevisit,
}
