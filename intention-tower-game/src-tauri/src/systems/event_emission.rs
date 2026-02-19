use super::System;
use crate::models::world_state::WorldState;
use crate::models::events::WorldEvent;

/// System #23: Collects all changes from this tick and emits the StateDiff event stream.
/// This is the final system in the tick — it packages pending_events for the frontend.
pub struct EventEmissionSystem;

impl System for EventEmissionSystem {
    fn name(&self) -> &'static str { "EventEmissionSystem" }

    fn run(&self, _state: &mut WorldState, _dt: f64) {
        // The actual emission is handled by SimulationRunner::tick() via flush_events().
        // This system exists as a placeholder for any final aggregation/dedup logic.
        // Future: batch NodeValueChanged events for the same node, aggregate edge changes, etc.
    }
}
