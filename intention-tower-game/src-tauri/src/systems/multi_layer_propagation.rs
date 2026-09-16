use super::System;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #11: Multi-layer motivation propagation.
/// When isChained motivations are active, their value flows upward along chainTarget.
/// This implements the dopamine prediction error chain (多层动机).
/// Key for: 爱与付出、等死死国可乎、交易市场
pub struct MultiLayerPropagationSystem;

impl System for MultiLayerPropagationSystem {
    fn name(&self) -> &'static str {
        "MultiLayerPropagationSystem"
    }

    fn run(&self, state: &mut WorldState, dt: f64) {
        for character in state.characters.values_mut() {
            // Collect chained motivations
            let chained: Vec<(String, f64)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Motivation
                        && n.active
                        && n.attended
                        && n.motivation.as_ref().is_some_and(|m| m.is_chained)
                })
                .filter_map(|n| {
                    let chain_target = n.motivation.as_ref()?.chain_target.as_ref()?;
                    Some((chain_target.clone(), n.value))
                })
                .collect();

            // Propagate value upstream
            for (target_schema, source_value) in chained {
                if let Some(target_node) = character.mind_graph.find_by_schema_mut(&target_schema) {
                    // Transfer a fraction of value upstream (like dopamine prediction error)
                    let transfer = source_value * 0.1 * dt;
                    target_node.value = (target_node.value + transfer).min(1.0);
                }
            }
        }
    }
}
