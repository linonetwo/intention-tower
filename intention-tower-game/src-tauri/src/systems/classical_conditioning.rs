use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{AssociationEdge, Evidence, LearnType, NodeType, Polarity};
use crate::models::world_state::WorldState;

/// System #12: Classical conditioning (Pavlovian).
///
/// TWO passes per tick:
/// 1. **Learning pass**: When a Motivation node is active and Observations are recent,
///    create/reinforce edges: Observation -> Motivation.
/// 2. **Conditioned-activation pass**: For existing learned edges (Obs -> Motivation),
///    if the Observation is active and edge weight >= CR_THRESHOLD,
///    boost the Motivation value (conditioned response: bell alone -> salivation).
pub struct ClassicalConditioningSystem;

const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";
const LEARNING_COST: f64 = 0.05;
const REINFORCE_DELTA: f64 = 0.1;
const DECAY_RATE: f64 = 0.005;
const CR_THRESHOLD: f64 = 0.25;
const CR_DRIVE: f64 = 0.35;

impl System for ClassicalConditioningSystem {
    fn name(&self) -> &'static str {
        "ClassicalConditioningSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;

        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            let graph = &mut character.mind_graph;

            // Pass 1: Learning
            let motivation_ids: Vec<(String, f64)> = graph
                .nodes
                .values()
                .filter(|n| n.node_type == NodeType::Motivation && n.active && n.attended)
                .map(|n| {
                    let window = n
                        .motivation
                        .as_ref()
                        .map_or(10.0, |m| m.lookback_window_sec);
                    (n.instance_id.clone(), window)
                })
                .collect();

            for (motivation_id, window_sec) in motivation_ids {
                let window_ticks = (window_sec * 10.0) as u64;
                let cutoff = current_tick.saturating_sub(window_ticks);

                let recent_obs: Vec<String> = graph
                    .nodes
                    .values()
                    .filter(|n| {
                        n.node_type == NodeType::Observation
                            && n.active
                            && n.attended
                            && n.created_at >= cutoff
                    })
                    .map(|n| n.instance_id.clone())
                    .collect();

                for obs_id in recent_obs {
                    let existing_edge_id = graph
                        .edges
                        .values()
                        .find(|e| {
                            e.source_instance_id == obs_id && e.target_instance_id == motivation_id
                        })
                        .map(|e| e.edge_id.clone());

                    let has_dopamine = graph.resource_value(DOPAMINE_SCHEMA) >= LEARNING_COST;
                    if !has_dopamine {
                        continue;
                    }

                    if let Some(edge_id) = existing_edge_id {
                        let (old_weight, new_weight) = {
                            let edge = graph.edges.get_mut(&edge_id).unwrap();
                            let old = edge.weight;
                            edge.weight = (edge.weight + REINFORCE_DELTA).min(1.0);
                            edge.evidence.co_occurrence_count += 1;
                            edge.evidence.last_co_occurred_at = current_tick;
                            (old, edge.weight)
                        };
                        graph.consume_resource(DOPAMINE_SCHEMA, LEARNING_COST);
                        state.pending_events.push(WorldEvent::EdgeWeightChanged {
                            character_id: char_id.clone(),
                            edge_id,
                            old_weight,
                            new_weight,
                        });
                        state.pending_events.push(WorldEvent::ResourceConsumed {
                            character_id: char_id.clone(),
                            resource_schema_id: DOPAMINE_SCHEMA.to_string(),
                            amount: LEARNING_COST,
                            remaining: graph.resource_value(DOPAMINE_SCHEMA),
                        });
                    } else {
                        let edge_id = format!("learned_{}_{}", obs_id, motivation_id);
                        let edge = AssociationEdge {
                            edge_id: edge_id.clone(),
                            source_instance_id: obs_id.clone(),
                            target_instance_id: motivation_id.clone(),
                            polarity: Polarity::Excitatory,
                            weight: REINFORCE_DELTA,
                            learnable: true,
                            decay_rate_per_tick: DECAY_RATE,
                            learn_type: LearnType::Classical,
                            evidence: Evidence {
                                co_occurrence_count: 1,
                                last_co_occurred_at: current_tick,
                                window_sec,
                            },
                        };
                        graph.add_edge(edge);
                        graph.consume_resource(DOPAMINE_SCHEMA, LEARNING_COST);
                        state.pending_events.push(WorldEvent::EdgeCreated {
                            character_id: char_id.clone(),
                            edge_id,
                            source_id: obs_id,
                            target_id: motivation_id.clone(),
                            weight: REINFORCE_DELTA,
                        });
                        state.pending_events.push(WorldEvent::ResourceConsumed {
                            character_id: char_id.clone(),
                            resource_schema_id: DOPAMINE_SCHEMA.to_string(),
                            amount: LEARNING_COST,
                            remaining: graph.resource_value(DOPAMINE_SCHEMA),
                        });
                    }
                }
            }

            // Pass 2: Conditioned Activation (CR)
            let cr_activations: Vec<(String, f64)> = graph
                .edges
                .values()
                .filter(|e| {
                    e.learnable && e.learn_type == LearnType::Classical && e.weight >= CR_THRESHOLD
                })
                .filter_map(|e| {
                    let src = graph.nodes.get(&e.source_instance_id)?;
                    if !src.active || !src.attended || src.node_type != NodeType::Observation {
                        return None;
                    }
                    let tgt = graph.nodes.get(&e.target_instance_id)?;
                    if tgt.node_type != NodeType::Motivation {
                        return None;
                    }
                    Some((
                        e.target_instance_id.clone(),
                        e.weight * src.value * CR_DRIVE,
                    ))
                })
                .collect();

            for (mot_id, drive) in cr_activations {
                if let Some(node) = graph.nodes.get_mut(&mot_id) {
                    let old_val = node.value;
                    node.value = (node.value + drive).min(1.0);
                    node.active = true;
                    if (node.value - old_val).abs() > 1e-6 {
                        state.pending_events.push(WorldEvent::NodeValueChanged {
                            character_id: char_id.clone(),
                            instance_id: mot_id.clone(),
                            old_value: old_val,
                            new_value: node.value,
                        });
                    }
                }
            }
        }
    }
}
