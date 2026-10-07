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

        let entities: std::collections::HashSet<_> = state
            .characters
            .values()
            .flat_map(|character| character.mind_graph.nodes.values())
            .filter_map(|node| node.observation.as_ref()?.about.as_ref())
            .filter(|about| state.entity_position(about).is_some())
            .cloned()
            .collect();
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find motivations that have imprinting fields but no targetEntity yet
            let mut imprinting_motivations: Vec<(String, ImprintingConfig)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Motivation
                        && n.motivation.as_ref().is_some_and(|m| {
                            m.target_entity.is_none()
                                && m.imprinting.is_some()
                                && m.critical_period_end.is_some()
                                && m.critical_period_end.unwrap() > current_tick
                        })
                })
                .map(|n| {
                    (
                        n.instance_id.clone(),
                        n.motivation.as_ref().unwrap().imprinting.clone().unwrap(),
                    )
                })
                .collect();

            imprinting_motivations.sort_by(|a, b| a.0.cmp(&b.0));
            for (mot_id, config) in imprinting_motivations {
                // Contact schemas are an explicit species contract. Unrelated
                // visual stimuli never become a parent; ties are deterministic.
                let mut candidates: Vec<_> = character
                    .mind_graph
                    .nodes
                    .values()
                    .filter(|n| {
                        n.node_type == NodeType::Observation
                            && n.active
                            && n.attended
                            && n.created_at == current_tick
                            && config.observation_schemas.contains(&n.schema_id)
                            && n.observation.as_ref().is_some_and(|o| {
                                matches!(o.modality, Some(Modality::Visual | Modality::Auditory))
                                    && o.about.as_ref().is_some_and(|about| {
                                        let id = about.strip_prefix("it:entity/").unwrap_or(about);
                                        id != char_id && entities.contains(about)
                                    })
                            })
                    })
                    .map(|n| {
                        (
                            n.instance_id.clone(),
                            n.observation.as_ref().unwrap().about.clone().unwrap(),
                        )
                    })
                    .collect();
                candidates.sort();
                let first_obs = candidates.into_iter().next();

                if let Some((obs_id, about)) = first_obs {
                    // Check dopamine availability
                    if !character
                        .mind_graph
                        .consume_resource(DOPAMINE_SCHEMA, IMPRINTING_COST)
                    {
                        continue; // Cannot imprint without dopamine
                    }

                    if let Some(mot_node) = character.mind_graph.nodes.get_mut(&mot_id) {
                        if let Some(ref mut mot) = mot_node.motivation {
                            mot.target_entity = Some(about.clone());
                            mot.is_persistent = true;
                            mot.imprinting_evidence = Some(ImprintingEvidence {
                                target_entity: about,
                                source_id: obs_id.clone(),
                                imprinted_at: current_tick,
                                dopamine_spent: IMPRINTING_COST,
                                followed_distance: 0.0,
                                follow_ticks: 0,
                                max_separation_distance: 0.0,
                            });
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
