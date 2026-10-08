use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_graph::{ConditioningTrial, MindGraph};
use crate::models::mind_node::{AssociationEdge, Evidence, LearnType, NodeType, Polarity};
use crate::models::world_state::WorldState;

/// Trial-based prediction-error learning: delta = alpha * (reward - prediction).
/// Only a later, attended reward presentation counts; hunger and the conditioned
/// response itself are NOT rewards. Missing reward weakens the association.
pub struct ClassicalConditioningSystem;
const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";
const LEARNING_RATE: f64 = 0.2;
const COST_PER_WEIGHT: f64 = 0.25;
const FORGET_THRESHOLD: f64 = 0.005;
// A learning presentation is measured in canonical 10 Hz simulation ticks,
// not physiological dt (MCP commands also run a causal tick with dt=0).
const WINDOW_TICKS: u64 = 10;

pub(crate) fn intrinsic_reward(graph: &MindGraph, id: &str) -> f64 {
    let Some(node) = graph.nodes.get(id) else {
        return 0.0;
    };
    let Some(observation) = &node.observation else {
        return 0.0;
    };
    let recognized = observation.about.as_ref().is_some_and(|about| {
        graph.nodes.values().any(|instinct| {
            instinct
                .prior_instinct
                .as_ref()
                .is_some_and(|data| !data.is_resource && data.satisfied_by_about.contains(about))
        })
    });
    if recognized {
        1.0
    } else {
        observation.satisfaction.clamp(0.0, 1.0)
    }
}

impl System for ClassicalConditioningSystem {
    fn name(&self) -> &'static str {
        "ClassicalConditioningSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;
        for character in state.characters.values_mut() {
            let graph = &mut character.mind_graph;
            let character_id = &character.id;
            // Authored unconditioned stimulus -> response pathways determine
            // eligible targets. No character, food, bell or level ID is special.
            let mut targets: Vec<String> = graph
                .edges
                .values()
                .filter(|edge| !edge.learnable && edge.polarity == Polarity::Excitatory)
                .filter(|edge| intrinsic_reward(graph, &edge.source_instance_id) > 0.0)
                .filter_map(|edge| {
                    graph
                        .nodes
                        .get(&edge.target_instance_id)
                        .filter(|node| node.node_type == NodeType::Action)
                        .map(|node| node.instance_id.clone())
                })
                .collect();
            targets.sort();
            targets.dedup();
            let reflex_targets = targets.clone();
            let mut cues: Vec<String> = graph
                .nodes
                .values()
                .filter(|node| {
                    node.node_type == NodeType::Observation
                        && node.active
                        && node.attended
                        && node.created_at == state.tick
                        // Public feedback about our own response is not an
                        // independent external predictor of its reward.
                        && !node.observation.as_ref().is_some_and(|observation|
                            observation.is_signal && observation.emitter_id.as_ref() == Some(character_id))
                        && intrinsic_reward(graph, &node.instance_id) == 0.0
                })
                .map(|node| node.instance_id.clone())
                .collect();
            cues.sort();
            for source_id in cues {
                // A zero-weight authored demonstration map identifies an
                // observed action in the character's repertoire. It cannot
                // drive behavior itself: only later reward creates a learned
                // association. This also supports voluntary observational
                // learning without pretending the observer already acted.
                let mut cue_targets = reflex_targets.clone();
                cue_targets.extend(
                    graph
                        .edges
                        .values()
                        .filter(|edge| {
                            !edge.learnable
                                && edge.weight == 0.0
                                && edge.polarity == Polarity::Excitatory
                                && edge.source_instance_id == source_id
                        })
                        .filter_map(|edge| {
                            graph
                                .nodes
                                .get(&edge.target_instance_id)
                                .filter(|node| {
                                    node.node_type == NodeType::Action
                                        && node.action.as_ref().is_some_and(|action| !action.innate)
                                })
                                .map(|node| node.instance_id.clone())
                        }),
                );
                cue_targets.sort();
                cue_targets.dedup();
                targets.extend(cue_targets.iter().cloned());
                for target_id in &cue_targets {
                    if graph
                        .conditioning_trials
                        .iter()
                        .any(|trial| trial.source_id == source_id && trial.target_id == *target_id)
                    {
                        continue;
                    }
                    // Compound stimuli share ONE predicted outcome. Giving
                    // every simultaneously present cue its own full reward
                    // would let total expectation grow without bound.
                    // f64::sum uses -0.0 as its empty identity. A missing
                    // prediction is positive zero, including at JS JSON boundaries.
                    let prediction: f64 = graph
                        .edges
                        .values()
                        .filter(|edge| {
                            edge.learnable
                                && matches!(
                                    edge.learn_type,
                                    LearnType::Classical | LearnType::Operant
                                )
                                && edge.target_instance_id == *target_id
                                && graph
                                    .nodes
                                    .get(&edge.source_instance_id)
                                    .is_some_and(|node| node.active && node.attended)
                        })
                        .map(|edge| edge.weight)
                        .fold(0.0_f64, |total, weight| total + weight);
                    graph.conditioning_trials.push(ConditioningTrial {
                        source_id: source_id.clone(),
                        target_id: target_id.clone(),
                        started_at: state.tick,
                        deadline: state.tick + WINDOW_TICKS,
                        prediction,
                        reward: 0.0,
                        responded: false,
                    });
                }
            }
            targets.extend(
                graph
                    .conditioning_trials
                    .iter()
                    .map(|trial| trial.target_id.clone()),
            );
            targets.sort();
            targets.dedup();
            let rewards: std::collections::HashMap<String, f64> = targets
                .iter()
                .map(|target| {
                    let has_unconditioned_path = graph.edges.values().any(|edge| {
                        !edge.learnable
                            && edge.target_instance_id == *target
                            && intrinsic_reward(graph, &edge.source_instance_id) > 0.0
                    });
                    let reward = if has_unconditioned_path {
                        graph
                            .edges
                            .values()
                            .filter(|edge| !edge.learnable && edge.target_instance_id == *target)
                            .filter_map(|edge| graph.nodes.get(&edge.source_instance_id))
                            .filter_map(|node| node.observation.as_ref()?.about.as_ref())
                            .flat_map(|about| {
                                graph.nodes.values().filter(move |node| {
                                    node.active
                                        && node.attended
                                        && node.created_at == current_tick
                                        && node
                                            .observation
                                            .as_ref()
                                            .and_then(|obs| obs.about.as_ref())
                                            == Some(about)
                                })
                            })
                            .map(|node| intrinsic_reward(graph, &node.instance_id))
                            .fold(0.0_f64, f64::max)
                    } else {
                        graph
                            .nodes
                            .values()
                            .filter(|node| {
                                node.active && node.attended && node.created_at == current_tick
                            })
                            .map(|node| intrinsic_reward(graph, &node.instance_id))
                            .fold(0.0_f64, f64::max)
                    };
                    (target.clone(), reward)
                })
                .collect();
            for trial in &mut graph.conditioning_trials {
                if state.tick > trial.started_at && state.tick <= trial.deadline {
                    trial.reward = trial
                        .reward
                        .max(rewards.get(&trial.target_id).copied().unwrap_or(0.0));
                }
            }
            let trials = std::mem::take(&mut graph.conditioning_trials);
            for trial in trials {
                // Reward gives immediate visible learning feedback. Omission
                // needs the complete window, or a forthcoming reward would be
                // mistaken for extinction / an independent test.
                if state.tick < trial.deadline && trial.reward <= 0.0 {
                    graph.conditioning_trials.push(trial);
                    continue;
                }
                let edge_id = graph
                    .edges
                    .values()
                    .find(|edge| {
                        edge.learnable
                            && edge.learn_type == LearnType::Classical
                            && edge.source_instance_id == trial.source_id
                            && edge.target_instance_id == trial.target_id
                    })
                    .map(|edge| edge.edge_id.clone())
                    .unwrap_or_else(|| format!("learned_{}_{}", trial.source_id, trial.target_id));
                let stats = graph.conditioning_stats.entry(edge_id.clone()).or_default();
                if trial.reward > 0.0 {
                    stats.paired_trials += 1;
                } else {
                    stats.omitted_rewards += 1;
                    if trial.responded {
                        stats.independent_responses += 1;
                    }
                }
                let error = trial.reward - trial.prediction;
                let delta = LEARNING_RATE * error;
                let old_weight = graph.edges.get(&edge_id).map_or(0.0, |edge| edge.weight);
                let adjusted = (old_weight + delta).clamp(0.0, 1.0);
                let new_weight = if delta < 0.0 && adjusted < FORGET_THRESHOLD {
                    0.0
                } else {
                    adjusted
                };
                let cost = (new_weight - old_weight).abs() * COST_PER_WEIGHT;
                if cost < 1e-8 || !graph.consume_resource(DOPAMINE_SCHEMA, cost) {
                    continue;
                }
                let created = !graph.edges.contains_key(&edge_id);
                let edge = graph
                    .edges
                    .entry(edge_id.clone())
                    .or_insert_with(|| AssociationEdge {
                        edge_id: edge_id.clone(),
                        source_instance_id: trial.source_id.clone(),
                        target_instance_id: trial.target_id.clone(),
                        polarity: Polarity::Excitatory,
                        weight: 0.0,
                        learnable: true,
                        decay_rate_per_tick: 0.0,
                        learn_type: LearnType::Classical,
                        evidence: Evidence {
                            co_occurrence_count: 0,
                            last_co_occurred_at: 0,
                            window_sec: 1.0,
                        },
                    });
                edge.weight = new_weight;
                if trial.reward > 0.0 {
                    edge.evidence.co_occurrence_count += 1;
                    edge.evidence.last_co_occurred_at = state.tick;
                }
                let char_id = character.id.clone();
                if created {
                    state.pending_events.push(WorldEvent::EdgeCreated {
                        character_id: char_id.clone(),
                        edge_id: edge_id.clone(),
                        source_id: trial.source_id.clone(),
                        target_id: trial.target_id.clone(),
                        weight: new_weight,
                    });
                } else {
                    state.pending_events.push(WorldEvent::EdgeWeightChanged {
                        character_id: char_id.clone(),
                        edge_id: edge_id.clone(),
                        old_weight,
                        new_weight,
                    });
                }
                if new_weight == 0.0 {
                    graph.remove_edge(&edge_id);
                    state.pending_events.push(WorldEvent::EdgeRemoved {
                        character_id: char_id.clone(),
                        edge_id: edge_id.clone(),
                    });
                }
                state.pending_events.push(WorldEvent::ResourceConsumed {
                    character_id: char_id.clone(),
                    resource_schema_id: DOPAMINE_SCHEMA.into(),
                    amount: cost,
                    remaining: graph.resource_value(DOPAMINE_SCHEMA),
                });
                state.pending_events.push(WorldEvent::LearningUpdated {
                    character_id: char_id,
                    edge_id,
                    source_id: trial.source_id,
                    target_id: trial.target_id,
                    reward: trial.reward,
                    prediction: trial.prediction,
                    prediction_error: error,
                    dopamine_spent: cost,
                    old_weight,
                    new_weight,
                    phase: if created {
                        "created"
                    } else if delta > 0.0 {
                        "reinforced"
                    } else {
                        "extinguished"
                    }
                    .into(),
                });
            }
        }
    }
}
