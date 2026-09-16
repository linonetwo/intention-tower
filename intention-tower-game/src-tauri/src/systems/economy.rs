use super::System;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// Recomputes market demand from active desire memes. Prices and actual trades
/// remain explicit command effects, so simulation stays deterministic and
/// authored levels can choose fixed, negotiated, or algorithmic pricing.
pub struct EconomySystem;

impl System for EconomySystem {
    fn name(&self) -> &'static str {
        "EconomySystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for asset in state.economy.assets.values_mut() {
            let mut demand = 0.0;
            for character in state.characters.values() {
                demand += character
                    .mind_graph
                    .nodes
                    .values()
                    .filter(|node| {
                        node.node_type == NodeType::Meme
                            && node.active
                            && node.schema_id.contains("desire")
                            && node.schema_id.contains(&asset.item_id)
                    })
                    .map(|node| node.value * node.effective_strength())
                    .sum::<f64>();
            }
            asset.demand = demand.max(0.0);
        }
    }
}
