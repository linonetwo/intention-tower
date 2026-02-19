pub mod time_system;
pub mod resource_regen;
pub mod body_state;
pub mod command_system;
pub mod environment_event;
pub mod perception;
pub mod novelty_habituation;
pub mod attention_allocation;
pub mod instinct_update;
pub mod threshold;
pub mod multi_layer_propagation;
pub mod classical_conditioning;
pub mod operant_conditioning;
pub mod imprinting;
pub mod meme_infection;
pub mod social_signal;
pub mod belief_conflict;
pub mod attention_flood;
pub mod action_selection;
pub mod action_execution;
pub mod mood_cascade;
pub mod cleanup;
pub mod event_emission;
pub mod runner;

use crate::models::world_state::WorldState;

/// Trait for all simulation systems. Each system runs once per tick in a fixed order.
pub trait System: Send + Sync {
    fn name(&self) -> &'static str;
    fn run(&self, state: &mut WorldState, dt: f64);
}
