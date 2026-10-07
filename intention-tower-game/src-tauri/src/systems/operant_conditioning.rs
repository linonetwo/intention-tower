use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #13: Operant conditioning (Thorndike's smart cat).
/// When an Action is executed and leads to a reward (satisfaction increase),
/// strengthens the path from the triggering Motivation → Action.
/// Key for: 聪明猫 (pressing button → food), 网瘾少年
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

            // Find recently executed actions (those that became active this tick)
            // and check if any connected PriorInstinct's satisfaction improved
            let action_ids: Vec<String> = graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Action
                        && n.active
                        && n.attended
                        && n.action
                            .as_ref()
                            .is_some_and(|action| !action.innate && action.selected)
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in action_ids {
                // Find incoming edges to this action (from motivations)
                let incoming: Vec<(String, String)> = graph
                    .edges
                    .values()
                    .filter(|e| {
                        e.target_instance_id == action_id
                            && e.learnable
                            && graph
                                .nodes
                                .get(&e.source_instance_id)
                                .is_some_and(|node| node.node_type == NodeType::Motivation)
                    })
                    .map(|e| (e.edge_id.clone(), e.source_instance_id.clone()))
                    .collect();

                // Check if the action led to reward: look for satisfaction > 0 on recent observations
                let reward = graph
                    .nodes
                    .values()
                    .filter(|n| {
                        n.node_type == NodeType::Observation
                            && n.active
                            && n.attended
                            && n.created_at == current_tick
                    })
                    .map(|n| super::classical_conditioning::intrinsic_reward(graph, &n.instance_id))
                    .fold(0.0_f64, f64::max);

                if reward <= 0.0 {
                    continue;
                }

                // Reinforce all motivation → action edges
                for (edge_id, source_id) in incoming {
                    let prediction = graph.edges[&edge_id].weight;
                    let error = reward - prediction;
                    let delta = LEARNING_RATE * error;
                    let cost = delta.abs() * COST_PER_WEIGHT;
                    if delta.abs() < 1e-6 || !graph.consume_resource(DOPAMINE_SCHEMA, cost) {
                        continue;
                    }
                    let (old_w, new_w) = {
                        if let Some(edge) = graph.edges.get_mut(&edge_id) {
                            if !edge.learnable {
                                continue;
                            }
                            let old = edge.weight;
                            edge.weight = (edge.weight + delta).clamp(0.0, 1.0);
                            edge.evidence.co_occurrence_count += 1;
                            edge.evidence.last_co_occurred_at = current_tick;
                            (old, edge.weight)
                        } else {
                            continue;
                        }
                    };
                    state.pending_events.push(WorldEvent::EdgeWeightChanged {
                        character_id: char_id.clone(),
                        edge_id: edge_id.clone(),
                        old_weight: old_w,
                        new_weight: new_w,
                    });
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
                        old_weight: old_w,
                        new_weight: new_w,
                        phase: if delta > 0.0 {
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
