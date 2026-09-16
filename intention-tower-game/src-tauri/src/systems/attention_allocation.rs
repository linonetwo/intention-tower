use super::System;
use crate::models::events::WorldEvent;
use crate::models::world_state::WorldState;
use std::collections::HashSet;

/// System #8: Allocates attention budget across active nodes based on strength priority.
/// Nodes that don't receive attention budget have their updates skipped.
/// Critical for: 克苏鲁 (attention flood), 触发网瘾, 幻境挣扎
pub struct AttentionAllocationSystem;

const ATTENTION_SCHEMA: &str = "it:concept/attention";

impl System for AttentionAllocationSystem {
    fn name(&self) -> &'static str {
        "AttentionAllocationSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            let attention_budget = character.mind_graph.resource_value(ATTENTION_SCHEMA);

            // Collect all active non-resource nodes and sort by strength (descending)
            let mut active_nodes: Vec<(String, f64)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| n.active && !n.is_resource())
                .map(|n| (n.instance_id.clone(), n.effective_strength()))
                .collect();
            active_nodes.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            // Allocate: each node "costs" a fraction of attention.
            // Nodes beyond the budget get deactivated this tick.
            let cost_per_node = if active_nodes.is_empty() { 0.0 } else { 0.05 };
            let mut spent = 0.0;
            let mut attended = HashSet::new();
            for (node_id, strength) in &active_nodes {
                let cost = cost_per_node * (1.0 / strength.max(0.1)); // weaker nodes cost more attention
                if spent + cost <= attention_budget {
                    spent += cost;
                    attended.insert(node_id.clone());
                }
            }

            // Attention is a recoverable per-tick allocation, not node
            // lifecycle. Keep `active` untouched so replenishing attention can
            // bring a node back into working memory on the next tick.
            for node in character.mind_graph.nodes.values_mut() {
                let next =
                    node.is_resource() || (node.active && attended.contains(&node.instance_id));
                if node.attended != next {
                    node.attended = next;
                    state.pending_events.push(WorldEvent::NodeAttentionChanged {
                        character_id: char_id.clone(),
                        instance_id: node.instance_id.clone(),
                        attended: next,
                    });
                }
            }
        }
    }
}
