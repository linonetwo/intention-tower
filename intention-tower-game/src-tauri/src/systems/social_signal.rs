use std::collections::BTreeMap;

use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{
    AssociationEdge, Evidence, LearnType, Modality, NodeType, Polarity, SignalType,
};
use crate::models::world_state::WorldState;

const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";

/// One attended social presentation changes authored needs once. Its realized
/// outcome, rather than persistent group membership, may buy social learning.
pub struct SocialSignalSystem;

impl System for SocialSignalSystem {
    fn name(&self) -> &'static str {
        "SocialSignalSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let tick = state.tick;
        let mut character_ids: Vec<_> = state.characters.keys().cloned().collect();
        character_ids.sort();
        for character_id in character_ids {
            let character = state.characters.get_mut(&character_id).unwrap();
            let graph = &mut character.mind_graph;
            let signals: Vec<_> = graph
                .nodes
                .values()
                .filter_map(|node| {
                    let observation = node.observation.as_ref()?;
                    (node.node_type == NodeType::Observation
                        && node.active
                        && node.attended
                        && node.created_at == tick
                        && observation.modality == Some(Modality::Social)
                        && observation.is_signal
                        && observation.social_consumed_at != Some(tick))
                    .then(|| {
                        (
                            node.instance_id.clone(),
                            observation.signal_type,
                            observation.group_context.clone(),
                        )
                    })
                })
                .collect();

            for (observation_id, signal_type, group_context) in signals {
                // Consume even unsupported/unmatched/underfunded presentations:
                // their lingering TTL is not another opportunity to learn.
                graph
                    .nodes
                    .get_mut(&observation_id)
                    .unwrap()
                    .observation
                    .as_mut()
                    .unwrap()
                    .social_consumed_at = Some(tick);
                let positive = match signal_type {
                    Some(SignalType::Approval | SignalType::Belonging) => true,
                    Some(SignalType::Rejection | SignalType::Threat) => false,
                    _ => continue,
                };
                let Some(group_context) = group_context else {
                    continue;
                };
                // One need can change only once per signal, even with duplicate
                // bindings or multiple instances of an identity installed.
                let mut bindings = BTreeMap::new();
                for node in graph
                    .nodes
                    .values()
                    .filter(|node| node.node_type == NodeType::Meme && node.active)
                {
                    let Some(meme) = node.meme.as_ref().filter(|meme| {
                        meme.is_identity && meme.group_id.as_deref() == Some(group_context.as_str())
                    }) else {
                        continue;
                    };
                    for binding in &meme.social_need_bindings {
                        if binding.relief.is_finite()
                            && binding.relief > 0.0
                            && binding.relief <= 1.0
                        {
                            bindings
                                .entry(binding.need_schema_id.clone())
                                .or_insert((node.instance_id.clone(), binding.relief));
                        }
                    }
                }
                for (need_schema, (identity_id, relief)) in bindings {
                    let Some(need) = graph.nodes.values_mut().find(|node| {
                        node.schema_id == need_schema
                            && node.node_type == NodeType::PriorInstinct
                            && !node.is_resource()
                    }) else {
                        continue;
                    };
                    let source_id = need.instance_id.clone();
                    let old_value = need.value;
                    if !old_value.is_finite() {
                        continue;
                    }
                    let new_value = if positive {
                        (old_value - relief).clamp(0.0, 1.0)
                    } else {
                        (old_value + relief).clamp(0.0, 1.0)
                    };
                    let realized = if positive {
                        old_value - new_value
                    } else {
                        new_value - old_value
                    };
                    if realized <= 0.0 {
                        continue;
                    }
                    need.value = new_value;
                    state.pending_events.push(WorldEvent::NodeValueChanged {
                        character_id: character_id.clone(),
                        instance_id: source_id.clone(),
                        old_value,
                        new_value,
                    });

                    let edge_id = format!("social_{}_{}", source_id, identity_id);
                    let existing = graph.edges.get(&edge_id);
                    if !positive && existing.is_none() {
                        continue;
                    }
                    if existing
                        .is_some_and(|edge| !edge.learnable || edge.learn_type != LearnType::Social)
                    {
                        continue;
                    }
                    let prediction = existing.map_or(0.0, |edge| edge.weight);
                    if !prediction.is_finite() {
                        continue;
                    }
                    // Reward is the fraction of authored relief actually realized.
                    // Rejection uses its negative counterpart: weaken an existing
                    // positive association, never create a negative association.
                    let fraction = (realized / relief).clamp(0.0, 1.0);
                    let reward = if positive { fraction } else { -fraction };
                    let error = reward - prediction;
                    let new_weight = (prediction + 0.2 * error).clamp(0.0, 1.0);
                    let cost = (new_weight - prediction).abs() * 0.25;
                    if cost <= 0.0 {
                        continue;
                    }
                    let Some(dopamine) = graph.nodes.values_mut().find(|node| {
                        node.schema_id == DOPAMINE_SCHEMA
                            && node.is_resource()
                            && node.value.is_finite()
                            && node.value >= cost
                    }) else {
                        continue;
                    };
                    dopamine.value -= cost;
                    let remaining_dopamine = dopamine.value;
                    let created = !graph.edges.contains_key(&edge_id);
                    let edge =
                        graph
                            .edges
                            .entry(edge_id.clone())
                            .or_insert_with(|| AssociationEdge {
                                edge_id: edge_id.clone(),
                                source_instance_id: source_id.clone(),
                                target_instance_id: identity_id.clone(),
                                polarity: Polarity::Excitatory,
                                weight: 0.0,
                                learnable: true,
                                decay_rate_per_tick: 0.0,
                                learn_type: LearnType::Social,
                                evidence: Evidence::default(),
                            });
                    edge.weight = new_weight;
                    edge.evidence.co_occurrence_count =
                        edge.evidence.co_occurrence_count.saturating_add(1);
                    edge.evidence.last_co_occurred_at = tick;
                    if created {
                        state.pending_events.push(WorldEvent::EdgeCreated {
                            character_id: character_id.clone(),
                            edge_id: edge_id.clone(),
                            source_id: source_id.clone(),
                            target_id: identity_id.clone(),
                            weight: new_weight,
                        });
                    } else {
                        state.pending_events.push(WorldEvent::EdgeWeightChanged {
                            character_id: character_id.clone(),
                            edge_id: edge_id.clone(),
                            old_weight: prediction,
                            new_weight,
                        });
                    }
                    state.pending_events.push(WorldEvent::ResourceConsumed {
                        character_id: character_id.clone(),
                        resource_schema_id: DOPAMINE_SCHEMA.into(),
                        amount: cost,
                        remaining: remaining_dopamine,
                    });
                    state.pending_events.push(WorldEvent::LearningUpdated {
                        character_id: character_id.clone(),
                        edge_id,
                        source_id,
                        target_id: identity_id,
                        reward,
                        prediction,
                        prediction_error: error,
                        dopamine_spent: cost,
                        old_weight: prediction,
                        new_weight,
                        phase: if created {
                            "created"
                        } else if new_weight > prediction {
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
