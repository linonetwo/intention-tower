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
}
