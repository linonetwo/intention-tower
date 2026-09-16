use super::*;
use crate::models::events::WorldEvent;
use crate::models::world_state::WorldState;

/// The simulation runner. Executes all 23 systems in fixed tick order.
pub struct SimulationRunner {
    systems: Vec<Box<dyn System>>,
}

impl SimulationRunner {
    pub fn new() -> Self {
        // All 23 systems in canonical tick execution order
        let systems: Vec<Box<dyn System>> = vec![
            // #1 TimeSystem
            Box::new(time_system::TimeSystem),
            // #2 ResourceRegenSystem
            Box::new(resource_regen::ResourceRegenSystem),
            // #3 BodyStateSystem
            Box::new(body_state::BodyStateSystem),
            // #4 CommandSystem
            Box::new(command_system::CommandSystem),
            // #5 ClassicalConditioningSystem — runs here (before ThresholdSystem)
            // so that newly-created observations can pair with still-active motivations
            // BEFORE feeding/etc causes ThresholdSystem to despawn them.
            Box::new(classical_conditioning::ClassicalConditioningSystem),
            // #6 EnvironmentEventSystem
            Box::new(environment_event::EnvironmentEventSystem),
            // Market demand and asset ledger projection
            Box::new(economy::EconomySystem),
            // #7 PerceptionSystem
            Box::new(perception::PerceptionSystem),
            // #8 NoveltyHabituationSystem
            Box::new(novelty_habituation::NoveltyHabituationSystem),
            // #9 AttentionAllocationSystem
            Box::new(attention_allocation::AttentionAllocationSystem),
            // #10 InstinctUpdateSystem
            Box::new(instinct_update::InstinctUpdateSystem),
            // #11 ThresholdSystem
            Box::new(threshold::ThresholdSystem),
            // #12 MultiLayerPropagationSystem
            Box::new(multi_layer_propagation::MultiLayerPropagationSystem),
            // (ClassicalConditioningSystem moved to #5)
            // #13 OperantConditioningSystem
            Box::new(operant_conditioning::OperantConditioningSystem),
            // #14 ImprintingSystem
            Box::new(imprinting::ImprintingSystem),
            // #15 MemeInfectionSystem
            Box::new(meme_infection::MemeInfectionSystem),
            // Bottom-up crystallization from repeated perceptions
            Box::new(meme_emergence::MemeEmergenceSystem),
            // #16 SocialSignalSystem
            Box::new(social_signal::SocialSignalSystem),
            // Cross-character group aggregation and collective decisions
            Box::new(social_dynamics::SocialDynamicsSystem),
            // #17 BeliefConflictSystem
            Box::new(belief_conflict::BeliefConflictSystem),
            // #18 AttentionFloodSystem
            Box::new(attention_flood::AttentionFloodSystem),
            // #19 ActionSelectionSystem
            Box::new(action_selection::ActionSelectionSystem),
            // #20 ActionExecutionSystem
            Box::new(action_execution::ActionExecutionSystem),
            // #21 MoodCascadeSystem
            Box::new(mood_cascade::MoodCascadeSystem),
            // #22 CleanupSystem
            Box::new(cleanup::CleanupSystem),
            // #23 EventEmissionSystem
            Box::new(event_emission::EventEmissionSystem),
            // Final authoritative level objective/outcome evaluation
            Box::new(level_progress::LevelProgressSystem),
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
        state
            .pending_events
            .push(WorldEvent::TickCompleted { tick: state.tick });

        // Flush and return events
        state.flush_events()
    }
}

impl Default for SimulationRunner {
    fn default() -> Self {
        Self::new()
    }
}
