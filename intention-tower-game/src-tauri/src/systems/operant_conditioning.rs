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
const LEARNING_COST: f64 = 0.03;
const REINFORCE_DELTA: f64 = 0.08;

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
                            .is_some_and(|action| action.innate || action.selected)
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in action_ids {
                // Find incoming edges to this action (from motivations)
                let incoming: Vec<(String, String)> = graph
                    .edges
                    .values()
                    .filter(|e| e.target_instance_id == action_id)
                    .map(|e| (e.edge_id.clone(), e.source_instance_id.clone()))
                    .collect();

                // Check if the action led to reward: look for satisfaction > 0 on recent observations
                let has_reward = graph.nodes.values().any(|n| {
                    n.node_type == NodeType::Observation
                        && n.active
                        && n.attended
                        && n.observation.as_ref().is_some_and(|o| o.satisfaction > 0.0)
                        && n.created_at >= current_tick.saturating_sub(5) // within last 5 ticks
                });

                if !has_reward {
                    continue;
                }

                // Check dopamine
                if graph.resource_value(DOPAMINE_SCHEMA) < LEARNING_COST {
                    continue;
                }

                // Reinforce all motivation → action edges
                for (edge_id, _source_id) in incoming {
                    let (old_w, new_w) = {
                        if let Some(edge) = graph.edges.get_mut(&edge_id) {
                            if !edge.learnable {
                                continue;
                            }
                            let old = edge.weight;
                            edge.weight = (edge.weight + REINFORCE_DELTA).min(1.0);
                            edge.evidence.co_occurrence_count += 1;
                            edge.evidence.last_co_occurred_at = current_tick;
                            (old, edge.weight)
                        } else {
                            continue;
                        }
                    };
                    graph.consume_resource(DOPAMINE_SCHEMA, LEARNING_COST);
                    state.pending_events.push(WorldEvent::EdgeWeightChanged {
                        character_id: char_id.clone(),
                        edge_id,
                        old_weight: old_w,
                        new_weight: new_w,
                    });
                }
            }
        }
    }
}
