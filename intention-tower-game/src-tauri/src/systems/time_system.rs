use super::System;
use crate::models::world_state::WorldState;

/// System #1: Advances time, applies timeSpeed multiplier.
/// When paused, dt effectively becomes 0 (handled in runner).
pub struct TimeSystem;

impl System for TimeSystem {
    fn name(&self) -> &'static str {
        "TimeSystem"
    }

    fn run(&self, _state: &mut WorldState, _dt: f64) {
        // Time advancement is handled by the runner incrementing state.tick.
        // This system applies time_speed scaling to velocity-based systems
        // by setting an effective dt factor that other systems can read.
        // For now, time_speed is stored in state and consumed by the runner.
    }
}
