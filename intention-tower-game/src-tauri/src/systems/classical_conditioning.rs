use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::{NodeType, AssociationEdge, Evidence, Polarity, LearnType};
use crate::models::events::WorldEvent;

/// System #12: Classical conditioning (Pavlovian).
/// When a Motivation node becomes active (spawned by ThresholdSystem),
/// looks back within its lookbackWindowSec for recent Observations
/// and creates/reinforces edges from those Observations to the Motivation.
/// Consumes dopamine for each learning event.
pub struct ClassicalConditioningSystem;

const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";
const LEARNING_COST: f64 = 0.05;
const REINFORCE_DELTA: f64 = 0.1;
const DECAY_RATE: f64 = 0.005;

impl System for ClassicalConditioningSystem {
    fn name(&self) -> &'static str { "ClassicalConditioningSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;

        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            let graph = &mut character.mind_graph;

            // Find all active Motivation nodes
            let motivation_ids: Vec<(String, f64)> = graph.nodes.values()
                .filter(|n| {
                    n.node_type == NodeType::Motivation
                        && n.active
                })
                .map(|n| {
                    let window = n.motivation.as_ref()
                        .map_or(10.0, |m| m.lookback_window_sec);
                    (n.instance_id.clone(), window)
                })
                .collect();

            for (motivation_id, window_sec) in motivation_ids {
                // Convert window from seconds to ticks (assuming 1 tick = 1 time unit for now)
                let window_ticks = (window_sec * 10.0) as u64; // 10 ticks per second
                let cutoff = current_tick.saturating_sub(window_ticks);

                // Find recent Observations within the lookback window
                let recent_obs: Vec<String> = graph.nodes.values()
                    .filter(|n| {
                        n.node_type == NodeType::Observation
                            && n.active
                            && n.created_at >= cutoff
                    })
                    .map(|n| n.instance_id.clone())
                    .collect();

                for obs_id in recent_obs {
                    // Check if edge already exists
                    let existing_edge_id = graph.edges.values()
                        .find(|e| {
                            e.source_instance_id == obs_id
                                && e.target_instance_id == motivation_id
                        })
                        .map(|e| e.edge_id.clone());

                    // Check if we have enough dopamine
                    let has_dopamine = graph.resource_value(DOPAMINE_SCHEMA) >= LEARNING_COST;

                    if !has_dopamine {
                        continue; // Cannot learn without dopamine
                    }

                    if let Some(edge_id) = existing_edge_id {
                        // Reinforce existing edge
                        let (old_weight, new_weight) = {
                            let edge = graph.edges.get_mut(&edge_id).unwrap();
                            let old_weight = edge.weight;
                            edge.weight = (edge.weight + REINFORCE_DELTA).min(1.0);
                            edge.evidence.co_occurrence_count += 1;
                            edge.evidence.last_co_occurred_at = current_tick;
                            (old_weight, edge.weight)
                        };

                        // Consume dopamine
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
                        // Create new learnable edge
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
                                window_sec: window_sec,
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
        }
    }
}
