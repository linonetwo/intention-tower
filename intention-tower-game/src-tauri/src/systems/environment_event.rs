use super::System;
use crate::models::world_state::WorldState;

/// System #5: NPC autonomous actions, environmental changes, group aggregation.
/// Generates WorldEvents for PerceptionSystem to convert into Observations.
/// Relevant for: 人从众、浪潮实验、毁灭虫族主脑
pub struct EnvironmentEventSystem;

impl System for EnvironmentEventSystem {
    fn name(&self) -> &'static str { "EnvironmentEventSystem" }

    fn run(&self, _state: &mut WorldState, _dt: f64) {
        // Phase 2 stub: will iterate NPC characters and run their ActionSelectionSystem output
        // Also handles periodic environmental events (weather, group dynamics)
    }
}
