use super::System;
use crate::models::world_state::WorldState;
use crate::models::events::WorldEvent;

/// System #8: Allocates attention budget across active nodes based on strength priority.
/// Nodes that don't receive attention budget have their updates skipped.
/// Critical for: 克苏鲁 (attention flood), 触发网瘾, 幻境挣扎
pub struct AttentionAllocationSystem;

const ATTENTION_SCHEMA: &str = "it:concept/attention";

impl System for AttentionAllocationSystem {
    fn name(&self) -> &'static str { "AttentionAllocationSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            let attention_budget = character.mind_graph.resource_value(ATTENTION_SCHEMA);

            // Collect all active non-resource nodes and sort by strength (descending)
            let mut active_nodes: Vec<(String, f64)> = character.mind_graph.nodes.values()
                .filter(|n| n.active && !n.is_resource())
                .map(|n| (n.instance_id.clone(), n.strength))
                .collect();
            active_nodes.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            // Allocate: each node "costs" a fraction of attention.
            // Nodes beyond the budget get deactivated this tick.
            let cost_per_node = if active_nodes.is_empty() { 0.0 } else { 0.05 };
            let mut spent = 0.0;

            let mut deactivated = Vec::new();
            for (node_id, strength) in &active_nodes {
                let cost = cost_per_node * (1.0 / strength.max(0.1)); // weaker nodes cost more attention
                spent += cost;
                if spent > attention_budget {
                    deactivated.push(node_id.clone());
                }
            }

            // Deactivate nodes that don't fit in the attention budget
            for node_id in &deactivated {
                if let Some(node) = character.mind_graph.nodes.get_mut(node_id) {
                    if node.active {
                        node.active = false;
                        state.pending_events.push(WorldEvent::NodeDeactivated {
                            character_id: char_id.clone(),
                            instance_id: node_id.clone(),
                        });
                    }
                }
            }
        }
    }
}
