use super::System;
use crate::models::world_state::WorldState;

/// System #3: Monitors organ/body state and spawns interoceptive Observations.
/// For the Pavlov level this is a no-op; becomes relevant in 毁灭虫族 and 克苏鲁 levels.
pub struct BodyStateSystem;

impl System for BodyStateSystem {
    fn name(&self) -> &'static str { "BodyStateSystem" }

    fn run(&self, _state: &mut WorldState, _dt: f64) {
        // Phase 2 stub: will check health thresholds and spawn Body-source observations
        // e.g., when health drops below 0.3, spawn pain/injury observations
    }
}
