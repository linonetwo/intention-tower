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
            graph.pending_action_request = None;

            // Learned predictors can make a previously unavailable voluntary
            // action eligible. Authored strength, demonstration commands and
            // zero-weight repertoire maps cannot fabricate action execution.
            let learned_drive: Vec<(String, f64)> = graph
                .nodes
                .values()
                .filter(|node| {
                    node.node_type == NodeType::Action
                        && node.action.as_ref().is_some_and(|action| !action.innate)
                })
                .filter_map(|node| {
                    let learned: Vec<_> = graph
                        .edges
                        .values()
                        .filter(|edge| {
                            edge.learnable
                                && edge.evidence.co_occurrence_count > 0
                                && edge.target_instance_id == node.instance_id
                        })
                        .collect();
                    let instructed = node.action.as_ref().is_some_and(|a| {
                        a.instruction_cue.is_some() || a.physical_effect.is_some()
                    });
                    if learned.is_empty() && !instructed {
                        return None;
                    }
                    let drive = learned
                        .iter()
                        .map(|edge| {
                            graph
                                .nodes
                                .get(&edge.source_instance_id)
                                .filter(|source| source.active && source.attended)
                                .map_or(0.0, |source| match edge.polarity {
                                    crate::models::mind_node::Polarity::Excitatory => {
                                        edge.weight * source.value
                                    }
                                    crate::models::mind_node::Polarity::Inhibitory => {
                                        -edge.weight * source.value
                                    }
                                })
                        })
                        .fold(0.0_f64, |total, input| total + input)
                        .clamp(0.0, 1.0);
                    let cue_drive = graph
                        .action_stimulus(&node.instance_id, state.tick)
                        .and_then(|stimulus| graph.nodes.get(&stimulus.observation_instance_id))
                        .map_or(0.0, |cue| cue.value);
                    Some((
                        node.instance_id.clone(),
                        (drive + cue_drive).clamp(0.0, 1.0),
                    ))
                })
                .collect();
            for (action_id, drive) in learned_drive {
                let node = graph.nodes.get_mut(&action_id).unwrap();
                let old_value = node.value;
                let was_active = node.active;
                node.value = drive;
                node.active = drive >= 0.3;
                if (node.value - old_value).abs() > 1e-8 {
                    state.pending_events.push(WorldEvent::NodeValueChanged {
                        character_id: character_id.clone(),
                        instance_id: action_id.clone(),
                        old_value,
                        new_value: node.value,
                    });
                }
                if node.active != was_active {
                    state.pending_events.push(if node.active {
                        WorldEvent::NodeActivated {
                            character_id: character_id.clone(),
                            instance_id: action_id,
                        }
                    } else {
                        WorldEvent::NodeDeactivated {
                            character_id: character_id.clone(),
                            instance_id: action_id,
                        }
                    });
                }
            }

            // Calculate weighted score for each action:
            // score = action.strength + sum(incoming edge weights * source node value)
            let mut action_scores: Vec<(String, f64)> = Vec::new();

            let action_ids: Vec<String> = graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Action
                        && n.active
                        && n.attended
                        && n.action.as_ref().is_some_and(|action| !action.innate)
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in &action_ids {
                let action_node = graph.nodes.get(action_id).unwrap();
                let mut score = action_node.effective_strength();
                if let Some(stimulus) = graph.action_stimulus(action_id, state.tick) {
                    if let Some(cue) = graph.nodes.get(&stimulus.observation_instance_id) {
                        score += cue.value * cue.effective_strength();
                    }
                }

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
            if let Some(action_id) = winner_id {
                if let Some(stimulus) = graph.action_stimulus(action_id, state.tick) {
                    graph.pending_action_request =
                        Some(crate::models::mind_graph::ActionExecutionRequest {
                            action_id: action_id.to_owned(),
                            stimulus: Some(stimulus),
                        });
                } else if graph.nodes.get(action_id).is_some_and(|node| {
                    node.action
                        .as_ref()
                        .is_some_and(|action| action.physical_effect.is_some() && !action.selected)
                }) && graph.learned_action_drive(action_id) >= 0.3
                {
                    graph.pending_action_request =
                        Some(crate::models::mind_graph::ActionExecutionRequest {
                            action_id: action_id.to_owned(),
                            stimulus: None,
                        });
                }
            }
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
