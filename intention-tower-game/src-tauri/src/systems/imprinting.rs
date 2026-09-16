use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::*;
use crate::models::world_state::WorldState;

/// System #14: Imprinting (雏鹅的印刻行为).
/// During the critical period, first Observation matching certain criteria
/// consumes dopamine and creates a Motivation with targetEntity.
/// If dopamine is blocked, imprinting fails entirely.
pub struct ImprintingSystem;

const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";
const IMPRINTING_COST: f64 = 0.2;

impl System for ImprintingSystem {
    fn name(&self) -> &'static str {
        "ImprintingSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;

        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find motivations that have imprinting fields but no targetEntity yet
            let imprinting_motivations: Vec<(String, u64)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Motivation
                        && n.motivation.as_ref().map_or(false, |m| {
                            m.target_entity.is_none()
                                && m.critical_period_end.is_some()
                                && m.critical_period_end.unwrap() > current_tick
                        })
                })
                .map(|n| {
                    let end = n.motivation.as_ref().unwrap().critical_period_end.unwrap();
                    (n.instance_id.clone(), end)
                })
                .collect();

            for (mot_id, _period_end) in imprinting_motivations {
                // Find the first new visual observation this tick
                let first_obs = character
                    .mind_graph
                    .nodes
                    .values()
                    .find(|n| {
                        n.node_type == NodeType::Observation
                            && n.active
                            && n.attended
                            && n.created_at == current_tick
                            && n.observation
                                .as_ref()
                                .map_or(false, |o| o.modality == Some(Modality::Visual))
                    })
                    .map(|n| {
                        (
                            n.instance_id.clone(),
                            n.observation.as_ref().unwrap().about.clone(),
                        )
                    });

                if let Some((obs_id, about)) = first_obs {
                    // Check dopamine availability
                    if character.mind_graph.resource_value(DOPAMINE_SCHEMA) < IMPRINTING_COST {
                        continue; // Cannot imprint without dopamine
                    }

                    // Consume dopamine and set target entity
                    character
                        .mind_graph
                        .consume_resource(DOPAMINE_SCHEMA, IMPRINTING_COST);

                    if let Some(mot_node) = character.mind_graph.nodes.get_mut(&mot_id) {
                        if let Some(ref mut mot) = mot_node.motivation {
                            mot.target_entity = about.clone();
                        }
                    }

                    // Create follow edge: observation → motivation
                    let edge = AssociationEdge {
                        edge_id: format!("imprint_{}_{}", obs_id, mot_id),
                        source_instance_id: obs_id.clone(),
                        target_instance_id: mot_id.clone(),
                        polarity: Polarity::Excitatory,
                        weight: 0.8,
                        learnable: false,
                        decay_rate_per_tick: 0.0, // Imprinted bonds don't decay
                        learn_type: LearnType::Imprinting,
                        evidence: Evidence {
                            co_occurrence_count: 1,
                            last_co_occurred_at: current_tick,
                            window_sec: 0.0,
                        },
                    };
                    character.mind_graph.add_edge(edge);

                    state.pending_events.push(WorldEvent::ResourceConsumed {
                        character_id: char_id.clone(),
                        resource_schema_id: DOPAMINE_SCHEMA.to_string(),
                        amount: IMPRINTING_COST,
                        remaining: character.mind_graph.resource_value(DOPAMINE_SCHEMA),
                    });
                    state.pending_events.push(WorldEvent::EdgeCreated {
                        character_id: char_id.clone(),
                        edge_id: format!("imprint_{}_{}", obs_id, mot_id),
                        source_id: obs_id,
                        target_id: mot_id.clone(),
                        weight: 0.8,
                    });
                }
            }
        }
    }
}
