use super::System;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #21: Mood cascade — active mood nodes modify other nodes' thresholds.
/// When a mood (PriorInstinct { isMood: true }) is active, its thresholdModifiers
/// shift the activation/deactivation thresholds of other nodes.
/// Example: 饥饿烦躁 (irritable mood) lowers tolerance thresholds globally.
/// Key for: 崩溃、等死死国可乎
pub struct MoodCascadeSystem;

impl System for MoodCascadeSystem {
    fn name(&self) -> &'static str {
        "MoodCascadeSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            // Collect active mood modifiers
            let modifiers: Vec<(String, f64)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| n.node_type == NodeType::PriorInstinct && n.active && n.is_mood())
                .flat_map(|n| {
                    n.prior_instinct
                        .as_ref()
                        .map(|pi| &pi.threshold_modifiers)
                        .unwrap_or(&Vec::new())
                        .iter()
                        .map(|m| (m.target_schema_id.clone(), m.delta))
                        .collect::<Vec<_>>()
                })
                .collect();

            // Apply modifiers to matching nodes' thresholds
            // Note: these are temporary per-tick adjustments, not permanent changes.
            // We apply by shifting the "effective threshold" via the node value comparison.
            // Implementation: directly adjust threshold values (will be reset if mood deactivates).
            if modifiers.is_empty() {
                return;
            }

            let node_ids: Vec<String> = character.mind_graph.nodes.keys().cloned().collect();
            for node_id in node_ids {
                if let Some(node) = character.mind_graph.nodes.get_mut(&node_id) {
                    for threshold in &mut node.thresholds {
                        for (target_schema, delta) in &modifiers {
                            if threshold.spawn_schema_id == *target_schema {
                                // Mood lowers thresholds (making it easier to trigger)
                                threshold.activate_on_rising_above += delta;
                                threshold.deactivate_on_falling_below += delta;
                            }
                        }
                    }
                }
            }
        }
    }
}
