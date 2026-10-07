use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{AssociationEdge, Evidence, LearnType, NodeType, Polarity};
use crate::models::world_state::WorldState;
use std::collections::HashSet;

/// Reward credits a voluntary action that was already actually selected,
/// never a demonstration or an action first made eligible by this reward.
/// Establishes context -> action links as well as reinforcing existing links.
pub struct OperantConditioningSystem;
const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";
const COST_PER_WEIGHT: f64 = 0.375;
const LEARNING_RATE: f64 = 0.08;

impl System for OperantConditioningSystem {
    fn name(&self) -> &'static str {
        "OperantConditioningSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;
        let newly_selected: HashSet<_> = state
            .pending_events
            .iter()
            .filter_map(|event| match event {
                WorldEvent::ActionSelected {
                    character_id,
                    instance_id,
                } => Some((character_id.clone(), instance_id.clone())),
                _ => None,
            })
            .collect();
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            let graph = &mut character.mind_graph;
            let reward = graph
                .nodes
                .values()
                .filter(|node| {
                    node.active
                        && node.attended
                        && node.node_type == NodeType::Observation
                        && node.created_at == current_tick
                })
                .map(|node| {
                    super::classical_conditioning::intrinsic_reward(graph, &node.instance_id)
                })
                .fold(0.0_f64, f64::max);
            if reward <= 0.0 {
                continue;
            }
            let mut actions: Vec<_> = graph
                .nodes
                .values()
                .filter(|node| {
                    node.node_type == NodeType::Action
                        && node.active
                        && node.attended
                        && node
                            .action
                            .as_ref()
                            .is_some_and(|action| !action.innate && action.selected)
                        && !newly_selected.contains(&(char_id.clone(), node.instance_id.clone()))
                })
                .map(|node| node.instance_id.clone())
                .collect();
            actions.sort();
            for action_id in actions {
                let mut sources: Vec<_> = graph
                    .nodes
                    .values()
                    .filter(|node| {
                        if !node.active || !node.attended {
                            return false;
                        }
                        if node.node_type == NodeType::Motivation {
                            return true;
                        }
                        node.node_type == NodeType::Observation
                            && node.created_at < current_tick
                            && node.created_at >= current_tick.saturating_sub(10)
                            && super::classical_conditioning::intrinsic_reward(
                                graph,
                                &node.instance_id,
                            ) == 0.0
                            && !node.observation.as_ref().is_some_and(|observation| {
                                observation.is_signal
                                    && observation.emitter_id.as_ref() == Some(&char_id)
                            })
                            && graph.edges.values().any(|edge| {
                                edge.source_instance_id == node.instance_id
                                    && edge.target_instance_id == action_id
                                    && (edge.learnable || edge.weight == 0.0)
                            })
                    })
                    .map(|node| node.instance_id.clone())
                    .collect();
                sources.sort();
                sources.dedup();
                if sources.is_empty() {
                    continue;
                }
                let prediction: f64 = graph
                    .edges
                    .values()
                    .filter(|edge| {
                        edge.learnable
                            && edge.target_instance_id == action_id
                            && graph
                                .nodes
                                .get(&edge.source_instance_id)
                                .is_some_and(|node| node.active && node.attended)
                    })
                    .map(|edge| edge.weight)
                    .sum();
                let error = reward - prediction;
                let delta = LEARNING_RATE * error / sources.len() as f64;
                for source_id in sources {
                    let edge_id = format!("operant_{}_{}", source_id, action_id);
                    let old_weight = graph.edges.get(&edge_id).map_or(0.0, |edge| edge.weight);
                    let new_weight = (old_weight + delta).clamp(0.0, 1.0);
                    let cost = (new_weight - old_weight).abs() * COST_PER_WEIGHT;
                    if cost < 1e-8 || !graph.consume_resource(DOPAMINE_SCHEMA, cost) {
                        continue;
                    }
                    let created = !graph.edges.contains_key(&edge_id);
                    let edge =
                        graph
                            .edges
                            .entry(edge_id.clone())
                            .or_insert_with(|| AssociationEdge {
                                edge_id: edge_id.clone(),
                                source_instance_id: source_id.clone(),
                                target_instance_id: action_id.clone(),
                                polarity: Polarity::Excitatory,
                                weight: 0.0,
                                learnable: true,
                                decay_rate_per_tick: 0.0,
                                learn_type: LearnType::Operant,
                                evidence: Evidence {
                                    co_occurrence_count: 0,
                                    last_co_occurred_at: 0,
                                    window_sec: 1.0,
                                },
                            });
                    edge.weight = new_weight;
                    edge.evidence.co_occurrence_count += 1;
                    edge.evidence.last_co_occurred_at = current_tick;
                    if let Some(action) = graph
                        .nodes
                        .get_mut(&action_id)
                        .and_then(|node| node.action.as_mut())
                    {
                        action.proficiency_level =
                            (action.proficiency_level + delta.max(0.0)).min(1.0);
                    }
                    if created {
                        state.pending_events.push(WorldEvent::EdgeCreated {
                            character_id: char_id.clone(),
                            edge_id: edge_id.clone(),
                            source_id: source_id.clone(),
                            target_id: action_id.clone(),
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
                    state.pending_events.push(WorldEvent::ResourceConsumed {
                        character_id: char_id.clone(),
                        resource_schema_id: DOPAMINE_SCHEMA.into(),
                        amount: cost,
                        remaining: graph.resource_value(DOPAMINE_SCHEMA),
                    });
                    state.pending_events.push(WorldEvent::LearningUpdated {
                        character_id: char_id.clone(),
                        edge_id,
                        source_id,
                        target_id: action_id.clone(),
                        reward,
                        prediction,
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
}
