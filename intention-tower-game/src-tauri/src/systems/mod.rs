pub mod action_execution;
pub mod action_selection;
pub mod attention_allocation;
pub mod attention_flood;
pub mod belief_conflict;
pub mod body_state;
pub mod classical_conditioning;
pub mod cleanup;
pub mod command_system;
pub mod economy;
pub mod environment_event;
pub mod event_emission;
pub mod imprinting;
pub mod instinct_update;
pub mod level_progress;
pub mod meme_infection;
pub mod meme_emergence;
pub mod mood_cascade;
pub mod multi_layer_propagation;
pub mod novelty_habituation;
pub mod operant_conditioning;
pub mod perception;
pub mod resource_regen;
pub mod runner;
pub mod social_signal;
pub mod social_dynamics;
pub mod threshold;
pub mod time_system;

use crate::models::world_state::WorldState;

/// Trait for all simulation systems. Each system runs once per tick in a fixed order.
pub trait System: Send + Sync {
    fn name(&self) -> &'static str;
    fn run(&self, state: &mut WorldState, dt: f64);
}
