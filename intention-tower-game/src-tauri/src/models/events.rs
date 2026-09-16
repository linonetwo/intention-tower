use serde::{Deserialize, Serialize};

/// All events that can occur in the simulation, forming the StateDiff event stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorldEvent {
    // ── Node lifecycle ──
    NodeSpawned {
        character_id: String,
        instance_id: String,
        schema_id: String,
        node_type: String,
    },
    NodeDespawned {
        character_id: String,
        instance_id: String,
    },
    NodeValueChanged {
        character_id: String,
        instance_id: String,
        old_value: f64,
        new_value: f64,
    },
    NodeActivated {
        character_id: String,
        instance_id: String,
    },
    NodeDeactivated {
        character_id: String,
        instance_id: String,
    },
    NodeAttentionChanged {
        character_id: String,
        instance_id: String,
        attended: bool,
    },
    NodeSuppressionChanged {
        character_id: String,
        instance_id: String,
        suppression: f64,
    },
    ActionSelected {
        character_id: String,
        instance_id: String,
    },
    CharacterMoved {
        character_id: String,
        from_x: f64,
        from_y: f64,
        to_x: f64,
        to_y: f64,
    },
    SocialGroupUpdated {
        group_id: String,
        member_count: u32,
        cohesion: f64,
        consensus_action: Option<String>,
    },
    AssetPriceChanged {
        item_id: String,
        old_price: f64,
        new_price: f64,
    },
    AssetTraded {
        item_id: String,
        seller_id: String,
        buyer_id: String,
        quantity: f64,
        total_price: f64,
    },
    AssetTradeRejected {
        item_id: String,
        buyer_id: String,
        reason: String,
    },

    // ── Edge lifecycle ──
    EdgeCreated {
        character_id: String,
        edge_id: String,
        source_id: String,
        target_id: String,
        weight: f64,
    },
    EdgeWeightChanged {
        character_id: String,
        edge_id: String,
        old_weight: f64,
        new_weight: f64,
    },
    EdgeRemoved {
        character_id: String,
        edge_id: String,
    },

    // ── Resource ──
    ResourceConsumed {
        character_id: String,
        resource_schema_id: String,
        amount: f64,
        remaining: f64,
    },

    // ── Commands ──
    CommandExecuted {
        actor_id: String,
        command_id: String,
        target_id: Option<String>,
    },
    NodeDeletionResisted {
        character_id: String,
        instance_id: String,
        remaining_resilience: f64,
    },

    // ── Sensory ──
    SoundEmitted {
        source_entity_id: String,
        about: String,
        modality: String,
    },
    FoodPresented {
        source_entity_id: String,
        about: String,
    },

    // ── Threshold ──
    ThresholdCrossed {
        character_id: String,
        instance_id: String,
        trigger_id: String,
        direction: String, // "rising" or "falling"
    },

    // ── Tick marker ──
    TickCompleted {
        tick: u64,
    },
    VirtualContextChanged {
        value: bool,
        depth: u8,
    },
    ObjectiveCompleted {
        objective_id: String,
        label: String,
    },
    LevelWon {
        level_id: String,
        tick: u64,
    },
    LevelLost {
        level_id: String,
        tick: u64,
        reason: String,
    },
}
