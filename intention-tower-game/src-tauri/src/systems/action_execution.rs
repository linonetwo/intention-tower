use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #20: Executes the selected action's world effects.
/// For innate actions (e.g., salivation), automatic execution when triggered by edges.
/// For voluntary actions, execution when selected by ActionSelectionSystem.
pub struct ActionExecutionSystem;

impl System for ActionExecutionSystem {
    fn name(&self) -> &'static str {
        "ActionExecutionSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find innate actions that should fire based on incoming excitatory edges
            let innate_actions: Vec<String> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Action && n.action.as_ref().is_some_and(|a| a.innate)
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in innate_actions {
                // Calculate total excitatory input
                let total_input: f64 = character
                    .mind_graph
                    .edges
                    .values()
                    .filter(|e| e.target_instance_id == action_id)
                    .map(|e| {
                        let source_val = character
                            .mind_graph
                            .nodes
                            .get(&e.source_instance_id)
                            .filter(|s| s.active && s.attended)
                            .map_or(0.0, |s| s.value);
                        match e.polarity {
                            crate::models::mind_node::Polarity::Excitatory => e.weight * source_val,
                            crate::models::mind_node::Polarity::Inhibitory => {
                                -e.weight * source_val
                            }
                        }
                    })
                    .sum();

                // If total input exceeds firing threshold, activate the action
                let threshold = 0.3;
                if let Some(node) = character.mind_graph.nodes.get_mut(&action_id) {
                    let was_active = node.active;
                    let old_value = node.value;
                    node.value = total_input.clamp(0.0, 1.0);
                    if (node.value - old_value).abs() > 1e-8 {
                        state.pending_events.push(WorldEvent::NodeValueChanged {
                            character_id: char_id.clone(),
                            instance_id: action_id.clone(),
                            old_value,
                            new_value: node.value,
                        });
                    }
                    node.active = total_input >= threshold;
                    if node.active && !was_active {
                        state.pending_events.push(WorldEvent::NodeActivated {
                            character_id: char_id.clone(),
                            instance_id: action_id.clone(),
                        });
                    } else if !node.active && was_active {
                        state.pending_events.push(WorldEvent::NodeDeactivated {
                            character_id: char_id.clone(),
                            instance_id: action_id.clone(),
                        });
                    }
                }
            }

            // Evidence comes from the executed response, never from command
            // counts or an active hunger motivation. Reward-free for the whole
            // eligibility window is checked when the trial settles.
            let reward_present = character.mind_graph.nodes.values().any(|node| {
                node.active
                    && node.attended
                    && node.node_type == NodeType::Observation
                    && super::classical_conditioning::intrinsic_reward(
                        &character.mind_graph,
                        &node.instance_id,
                    ) > 0.0
            });
            for trial in &mut character.mind_graph.conditioning_trials {
                let cue_present = character
                    .mind_graph
                    .nodes
                    .get(&trial.source_id)
                    .is_some_and(|node| {
                        node.active && node.attended && node.created_at == trial.started_at
                    });
                let response = character
                    .mind_graph
                    .nodes
                    .get(&trial.target_id)
                    .is_some_and(|node| node.active && node.attended);
                let association = character.mind_graph.edges.values().any(|edge| {
                    edge.learnable
                        && edge.source_instance_id == trial.source_id
                        && edge.target_instance_id == trial.target_id
                        && edge.weight >= 0.3
                });
                if cue_present && response && association && !reward_present {
                    trial.responded = true;
                }
            }
        }
    }
}
