pub mod resource_regen;
pub mod instinct_update;
pub mod threshold;
pub mod classical_conditioning;
pub mod cleanup;
pub mod runner;

use crate::models::world_state::WorldState;

/// Trait for all simulation systems. Each system runs once per tick in a fixed order.
pub trait System {
    fn name(&self) -> &'static str;
    fn run(&self, state: &mut WorldState, dt: f64);
}
