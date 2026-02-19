use super::{System, resource_regen, instinct_update, threshold, classical_conditioning, cleanup};
use crate::models::world_state::WorldState;
use crate::models::events::WorldEvent;

/// The simulation runner. Executes all systems in fixed tick order.
pub struct SimulationRunner {
    systems: Vec<Box<dyn System>>,
}

impl SimulationRunner {
    pub fn new() -> Self {
        // Systems in tick execution order (subset for phase 1)
        let systems: Vec<Box<dyn System>> = vec![
            // #2 ResourceRegenSystem
            Box::new(resource_regen::ResourceRegenSystem),
            // #9 InstinctUpdateSystem
            Box::new(instinct_update::InstinctUpdateSystem),
            // #10 ThresholdSystem
            Box::new(threshold::ThresholdSystem),
            // #12 ClassicalConditioningSystem
            Box::new(classical_conditioning::ClassicalConditioningSystem),
            // #22 CleanupSystem
            Box::new(cleanup::CleanupSystem),
        ];

        Self { systems }
    }

    /// Run a single simulation tick. Returns the events generated during this tick.
    pub fn tick(&self, state: &mut WorldState, dt: f64) -> Vec<WorldEvent> {
        if state.paused {
            return Vec::new();
        }

        state.tick += 1;

        for system in &self.systems {
            system.run(state, dt);
        }

        // Add tick completion marker
        state.pending_events.push(WorldEvent::TickCompleted {
            tick: state.tick,
        });

        // Flush and return events
        state.flush_events()
    }
}

impl Default for SimulationRunner {
    fn default() -> Self {
        Self::new()
    }
}
