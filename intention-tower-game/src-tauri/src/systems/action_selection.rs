use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::NodeType;

/// System #19: Competitive action selection.
/// Among all active Action nodes, picks the one with highest weighted score.
/// Only one action can be selected per tick per character.
/// Key for: 聪明猫 (competing button-pressing actions)
pub struct ActionSelectionSystem;

impl System for ActionSelectionSystem {
    fn name(&self) -> &'static str { "ActionSelectionSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let graph = &mut character.mind_graph;

            // Calculate weighted score for each action:
            // score = action.strength + sum(incoming edge weights * source node value)
            let mut action_scores: Vec<(String, f64)> = Vec::new();

            let action_ids: Vec<String> = graph.nodes.values()
                .filter(|n| n.node_type == NodeType::Action && n.active)
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in &action_ids {
                let action_node = graph.nodes.get(action_id).unwrap();
                let mut score = action_node.strength;

                // Sum up incoming edge contributions
                for edge in graph.edges.values() {
                    if edge.target_instance_id == *action_id {
                        if let Some(source) = graph.nodes.get(&edge.source_instance_id) {
                            if source.active {
                                let contribution = match edge.polarity {
                                    crate::models::mind_node::Polarity::Excitatory => edge.weight * source.value,
                                    crate::models::mind_node::Polarity::Inhibitory => -edge.weight * source.value,
                                };
                                score += contribution;
                            }
                        }
                    }
                }

                action_scores.push((action_id.clone(), score));
            }

            // Sort by score descending
            action_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            // The winner gets activated, others get deactivated for this tick
            // (only if not innate — innate actions are always available)
            if let Some((winner_id, _)) = action_scores.first() {
                for (action_id, _) in &action_scores[1..] {
                    if let Some(node) = graph.nodes.get_mut(action_id) {
                        if !node.action.as_ref().map_or(false, |a| a.innate) {
                            node.active = false;
                        }
                    }
                }
            }
        }
    }
}
