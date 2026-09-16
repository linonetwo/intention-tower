use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #19: Competitive action selection.
/// Among all active Action nodes, picks the one with highest weighted score.
/// Only one action can be selected per tick per character.
/// Key for: 聪明猫 (competing button-pressing actions)
pub struct ActionSelectionSystem;

impl System for ActionSelectionSystem {
    fn name(&self) -> &'static str {
        "ActionSelectionSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let character_id = character.id.clone();
            let graph = &mut character.mind_graph;

            // Calculate weighted score for each action:
            // score = action.strength + sum(incoming edge weights * source node value)
            let mut action_scores: Vec<(String, f64)> = Vec::new();

            let action_ids: Vec<String> = graph
                .nodes
                .values()
                .filter(|n| n.node_type == NodeType::Action && n.active && n.attended)
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in &action_ids {
                let action_node = graph.nodes.get(action_id).unwrap();
                let mut score = action_node.effective_strength();

                // Sum up incoming edge contributions
                for edge in graph.edges.values() {
                    if edge.target_instance_id == *action_id {
                        if let Some(source) = graph.nodes.get(&edge.source_instance_id) {
                            if source.active && source.attended {
                                let contribution = match edge.polarity {
                                    crate::models::mind_node::Polarity::Excitatory => {
                                        edge.weight * source.value * source.effective_strength()
                                    }
                                    crate::models::mind_node::Polarity::Inhibitory => {
                                        -edge.weight * source.value * source.effective_strength()
                                    }
                                };
                                score += contribution;
                            }
                        }
                    }
                }

                action_scores.push((action_id.clone(), score));
            }

            // Sort by score descending
            action_scores
                .sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

            // Selection is a transient result; it must never mutate the
            // action's persistent eligibility (`active`).
            let winner_id = action_scores.first().map(|(id, _)| id.as_str());
            for node in graph
                .nodes
                .values_mut()
                .filter(|node| node.node_type == NodeType::Action)
            {
                if let Some(action) = node.action.as_mut() {
                    if action.innate {
                        continue;
                    }
                    let next = winner_id == Some(node.instance_id.as_str());
                    if next && !action.selected {
                        state.pending_events.push(WorldEvent::ActionSelected {
                            character_id: character_id.clone(),
                            instance_id: node.instance_id.clone(),
                        });
                    }
                    action.selected = next;
                }
            }
        }
    }
}
