use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{AssociationEdge, Evidence, LearnType, NodeType, Polarity};
use crate::models::world_state::WorldState;

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
            // A reward consumes only the latest eligible completed response.
            // Context is captured BEFORE feeding changes body state.
            let Some(index) = graph.action_episodes.iter().rposition(|episode| {
                episode.rewarded_at.is_none()
                    && episode.reward_consumed_at.is_none()
                    && episode.executed_at < current_tick
                    && current_tick - episode.executed_at <= 10
            }) else {
                continue;
            };
            let episode = graph.action_episodes[index].clone();
            graph.action_episodes[index].reward_consumed_at = Some(current_tick);
            for action_id in [episode.action_id.clone()] {
                let sources: Vec<_> = episode
                    .contexts
                    .iter()
                    .filter(|context| graph.nodes.contains_key(&context.instance_id))
                    .map(|context| context.instance_id.clone())
                    .collect();
                if sources.is_empty() {
                    continue;
                }
                let prediction: f64 = graph
                    .edges
                    .values()
                    .filter(|edge| {
                        edge.learnable
                            && edge.learn_type == LearnType::Operant
                            && edge.target_instance_id == action_id
                            && episode
                                .contexts
                                .iter()
                                .any(|context| context.instance_id == edge.source_instance_id)
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
                    if new_weight > old_weight {
                        let evidence = &mut graph.action_episodes[index];
                        evidence.rewarded_at = Some(current_tick);
                        evidence.reinforcement_dopamine_spent += cost;
                    }
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
