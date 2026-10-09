use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_graph::{
    ActionContext, ActionEpisode, ActionPhysicalOutcome, ConsumedActionStimulus,
};
use crate::models::mind_node::{ActionPhysicalEffect, Modality, NodeType, ObservationData};
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
        // Execute against the authoritative world before borrowing individual graphs.
        // A selected flag (including one restored from disk) is never a motor request.
        let mut motor_results = std::collections::BTreeMap::new();
        let mut character_ids: Vec<_> = state.characters.keys().cloned().collect();
        character_ids.sort();
        for char_id in character_ids {
            let request = state
                .characters
                .get_mut(&char_id)
                .unwrap()
                .mind_graph
                .pending_action_request
                .take();
            let Some(request) = request else {
                continue;
            };
            let stimulus = request.stimulus;
            let graph = &state.characters[&char_id].mind_graph;
            let Some(action) = graph.nodes.get(&request.action_id).filter(|node| {
                node.active
                    && node.attended
                    && node
                        .action
                        .as_ref()
                        .is_some_and(|a| !a.innate && a.selected)
            }) else {
                continue;
            };
            let valid_request = match stimulus.as_ref() {
                Some(stimulus) => {
                    graph
                        .action_stimulus(&request.action_id, state.tick)
                        .as_ref()
                        == Some(stimulus)
                }
                None => graph.learned_action_drive(&request.action_id) >= 0.3,
            };
            if !valid_request {
                continue;
            }
            let effect = action.action.as_ref().unwrap().physical_effect.clone();
            // Every validated attempt, even an already-satisfied posture, consumes this presentation.
            if let Some(stimulus) = stimulus.as_ref() {
                state
                    .characters
                    .get_mut(&char_id)
                    .unwrap()
                    .mind_graph
                    .consumed_action_stimuli
                    .push(ConsumedActionStimulus {
                        action_id: request.action_id.clone(),
                        stimulus: stimulus.clone(),
                    });
            }
            let Some(ActionPhysicalEffect::ActorPosture { posture }) = effect else {
                continue;
            };
            let from = state
                .character_postures
                .get(&char_id)
                .copied()
                .unwrap_or_default();
            if crate::movement::set_character_posture(state, &char_id, posture).is_err() {
                continue;
            }
            let to = state
                .character_postures
                .get(&char_id)
                .copied()
                .unwrap_or_default();
            if from == to || to != posture {
                continue;
            }
            motor_results.insert(
                char_id,
                (
                    request.action_id,
                    stimulus,
                    ActionPhysicalOutcome::ActorPosture { from, to },
                ),
            );
        }
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            let graph = &mut character.mind_graph;
            if let Some(tick) = graph
                .nodes
                .values()
                .filter(|node| {
                    node.node_type == NodeType::Observation
                        && !node.observation.as_ref().is_some_and(|observation| {
                            observation.emitter_id.as_ref() == Some(&char_id)
                        })
                })
                .map(|node| node.created_at)
                .max()
            {
                graph.last_external_observation_at = Some(
                    graph
                        .last_external_observation_at
                        .map_or(tick, |previous| previous.max(tick)),
                );
            }
            let mut executed: Vec<_> = state
                .pending_events
                .iter()
                .filter_map(|event| match event {
                    WorldEvent::ActionSelected {
                        character_id,
                        instance_id,
                    } if character_id == &char_id => Some(instance_id.clone()),
                    _ => None,
                })
                .collect();
            if let Some((action_id, _, _)) = motor_results.get(&char_id) {
                if !executed.contains(action_id) {
                    executed.push(action_id.clone());
                }
            }
            for action_id in executed {
                let Some(action) = graph.nodes.get(&action_id).filter(|node| {
                    node.active
                        && node.attended
                        && node
                            .action
                            .as_ref()
                            .is_some_and(|a| !a.innate && a.selected)
                }) else {
                    continue;
                };
                let motor_result = motor_results
                    .get(&char_id)
                    .filter(|(id, _, _)| id == &action_id);
                if action
                    .action
                    .as_ref()
                    .is_some_and(|a| a.instruction_cue.is_some() || a.physical_effect.is_some())
                    && motor_result.is_none()
                {
                    continue;
                }
                let action_schema_id = action.schema_id.clone();
                let output_schemas = action
                    .action
                    .as_ref()
                    .unwrap()
                    .emitted_observation_schemas
                    .clone();
                let output_template = action.clone();
                let need_schemas = action
                    .action
                    .as_ref()
                    .unwrap()
                    .autonomous_need_schema_ids
                    .clone();
                let need_minimum = action
                    .action
                    .as_ref()
                    .unwrap()
                    .autonomous_need_min_value
                    .unwrap_or(0.6)
                    .clamp(0.0, 1.0);
                let mut contexts: Vec<_> = graph
                    .nodes
                    .values()
                    .filter(|node| {
                        node.active
                            && node.attended
                            && (node.node_type == NodeType::Motivation
                                || node.prior_instinct.as_ref().is_some_and(|data| {
                                    !data.is_resource && !data.satisfied_by_about.is_empty()
                                })
                                || (node.node_type == NodeType::Observation
                                    && node.created_at >= state.tick.saturating_sub(10)
                                    && super::classical_conditioning::intrinsic_reward(
                                        graph,
                                        &node.instance_id,
                                    ) == 0.0
                                    && !node
                                        .observation
                                        .as_ref()
                                        .is_some_and(|o| o.emitter_id.as_ref() == Some(&char_id))
                                    && graph.edges.values().any(|edge| {
                                        edge.source_instance_id == node.instance_id
                                            && edge.target_instance_id == action_id
                                    })))
                    })
                    .map(|node| ActionContext {
                        instance_id: node.instance_id.clone(),
                        schema_id: node.schema_id.clone(),
                        value: node.value,
                    })
                    .collect();
                contexts.sort_by(|a, b| a.instance_id.cmp(&b.instance_id));
                let recent_prompt = graph
                    .last_external_observation_at
                    .is_some_and(|tick| state.tick.saturating_sub(tick) <= 10);
                let learned_need = contexts.iter().any(|context| {
                    graph.nodes.get(&context.instance_id).is_some_and(|node| {
                        context.value >= need_minimum
                            && (need_schemas.is_empty()
                                || need_schemas.contains(&context.schema_id))
                            && node.prior_instinct.as_ref().is_some_and(|data| {
                                !data.is_resource && !data.satisfied_by_about.is_empty()
                            })
                    }) && graph.edges.values().any(|edge| {
                        edge.source_instance_id == context.instance_id
                            && edge.target_instance_id == action_id
                            && edge.learnable
                            && edge.learn_type == crate::models::mind_node::LearnType::Operant
                            && edge.polarity == crate::models::mind_node::Polarity::Excitatory
                            && edge.weight > 0.0
                            && edge.evidence.co_occurrence_count > 0
                    })
                });
                let autonomous = learned_need && !recent_prompt;
                graph.action_episodes.push(ActionEpisode {
                    stimulus: motor_result.and_then(|(_, stimulus, _)| stimulus.clone()),
                    physical_outcome: motor_result.map(|(_, _, outcome)| outcome.clone()),
                    action_id: action_id.clone(),
                    action_schema_id,
                    executed_at: state.tick,
                    contexts,
                    autonomous,
                    reward_consumed_at: None,
                    reinforcement_dopamine_spent: 0.0,
                    rewarded_at: None,
                });
                state.pending_events.push(WorldEvent::ActionExecuted {
                    character_id: char_id.clone(),
                    instance_id: action_id,
                    executed_at: state.tick,
                    autonomous,
                });
                for schema_id in output_schemas {
                    // Public motor feedback is observable but never acts as
                    // the actor's own demonstration/reward predictor.
                    let mut output = output_template.clone();
                    output.instance_id = format!("action-output:{}:{}", char_id, schema_id);
                    output.schema_id = schema_id.clone();
                    output.label = schema_id.clone();
                    output.node_type = NodeType::Observation;
                    output.value = 1.0;
                    output.strength = 0.8;
                    output.active = true;
                    output.created_at = state.tick;
                    output.ttl = Some(10);
                    output.action = None;
                    output.costs.clear();
                    output.thresholds.clear();
                    output.observation = Some(ObservationData {
                        modality: Some(Modality::Auditory),
                        credibility: 1.0,
                        is_signal: true,
                        emitter_id: Some(char_id.clone()),
                        presentation_count: 1,
                        ..Default::default()
                    });
                    state.pending_events.push(WorldEvent::NodeSpawned {
                        character_id: char_id.clone(),
                        instance_id: output.instance_id.clone(),
                        schema_id,
                        node_type: "Observation".into(),
                    });
                    graph.add_node(output);
                }
            }

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
                    .fold(0.0_f64, |total, input| total + input);

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
                    .is_some_and(|node| {
                        node.active
                            && node.attended
                            && node.action.as_ref().is_some_and(|action| {
                                action.innate
                                    || character.mind_graph.action_episodes.iter().any(|episode| {
                                        episode.action_id == trial.target_id
                                            && episode.executed_at >= trial.started_at
                                            && episode.executed_at <= trial.deadline
                                    })
                            })
                    });
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
