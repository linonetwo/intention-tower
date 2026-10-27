use std::collections::BTreeMap;

use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{
    AssociationEdge, Evidence, LearnType, Modality, NodeType, Polarity, SignalType,
};
use crate::models::world_state::WorldState;

const DOPAMINE_SCHEMA: &str = "it:concept/dopamine";

fn valid_operant(edge: &AssociationEdge, source: &str, target: &str) -> bool {
    edge.source_instance_id == source
        && edge.target_instance_id == target
        && edge.learnable
        && edge.learn_type == LearnType::Operant
        && edge.polarity == Polarity::Excitatory
        && edge.weight.is_finite()
        && edge.weight > 0.0
        && edge.weight <= 1.0
}

pub(crate) fn arm_expectation(
    graph: &mut crate::models::mind_graph::MindGraph,
    index: usize,
    commands: &[crate::models::commands::CommandDef],
) {
    use crate::models::commands::CommandEffect;
    use crate::models::mind_graph::{MindGraph, SocialRewardExpectation};
    let episode = &graph.action_episodes[index];
    let mut configs: Vec<_> = commands
        .iter()
        .flat_map(|c| &c.effect_templates)
        .filter_map(|effect| {
            let CommandEffect::SpawnObservation {
                modality: Modality::Social,
                signal_type: Some(SignalType::Approval | SignalType::Belonging),
                group_context,
                action_credit: Some(config),
                ..
            } = effect
            else {
                return None;
            };
            (group_context.as_deref() == Some(config.group_context.as_str())
                && config.emitter_id != graph.character_id
                && MindGraph::credit_matches(episode, config, episode.executed_at))
            .then_some(config.clone())
        })
        .collect();
    configs.sort_by_key(|c| serde_json::to_string(c).unwrap_or_default());
    let Some(config) = configs.into_iter().next() else {
        return;
    };
    let mut sources: Vec<_> = episode
        .contexts
        .iter()
        .filter(|context| {
            context.value.is_finite()
                && context.value > 0.0
                && context.value <= 1.0
                && graph.nodes.get(&context.instance_id).is_some_and(|n| {
                    n.schema_id == context.schema_id
                        && n.node_type == NodeType::PriorInstinct
                        && !n.is_resource()
                })
                && graph.nodes.values().any(|n| {
                    n.active
                        && n.node_type == NodeType::Meme
                        && n.meme.as_ref().is_some_and(|m| {
                            m.is_identity
                                && m.group_id.as_deref() == Some(config.group_context.as_str())
                                && m.social_need_bindings.iter().any(|b| {
                                    b.need_schema_id == context.schema_id
                                        && b.relief.is_finite()
                                        && b.relief > 0.0
                                        && b.relief <= 1.0
                                })
                        })
                })
        })
        .cloned()
        .collect();
    if sources.is_empty() {
        return;
    }
    let stimulus = episode.stimulus.as_ref().unwrap();
    if let Some(cue) = graph
        .nodes
        .get(&stimulus.observation_instance_id)
        .filter(|n| {
            n.node_type == NodeType::Observation
                && n.schema_id == stimulus.observation_schema_id
                && n.value.is_finite()
                && n.value > 0.0
                && n.observation.as_ref().is_some_and(|o| {
                    o.emitter_id == stimulus.emitter_id
                        && o.group_context == stimulus.group_context
                        && o.presentation_count == stimulus.presentation_count
                })
                && n.created_at == stimulus.presented_at
        })
    {
        sources.push(crate::models::mind_graph::ActionContext {
            instance_id: cue.instance_id.clone(),
            schema_id: cue.schema_id.clone(),
            value: cue.value,
        });
    } else {
        return;
    }
    sources.sort_by(|a, b| a.instance_id.cmp(&b.instance_id));
    sources.dedup_by(|a, b| a.instance_id == b.instance_id);
    let prediction = sources
        .iter()
        .map(|s| {
            graph
                .edges
                .get(&format!("operant_{}_{}", s.instance_id, episode.action_id))
                .filter(|e| valid_operant(e, &s.instance_id, &episode.action_id))
                .map_or(0.0, |e| e.weight)
        })
        .sum::<f64>();
    graph.action_episodes[index].social_reward_expectation = Some(SocialRewardExpectation {
        deadline: episode.executed_at.saturating_add(config.max_age_ticks),
        config,
        sources,
        prediction,
        settled_at: None,
        outcome: None,
        reward: None,
        extinction_dopamine_spent: 0.0,
    });
}

fn settle_expectation(
    graph: &mut crate::models::mind_graph::MindGraph,
    index: usize,
    realized: &BTreeMap<String, f64>,
    tick: u64,
    character_id: &str,
    events: &mut Vec<WorldEvent>,
    outcome: &str,
) {
    let episode = graph.action_episodes[index].clone();
    let Some(expectation) = episode.social_reward_expectation else {
        return;
    };
    if expectation.settled_at.is_some() {
        return;
    }
    let reward = expectation
        .sources
        .iter()
        .filter(|s| {
            graph.nodes.get(&s.instance_id).is_some_and(|n| {
                n.schema_id == s.schema_id
                    && n.node_type == NodeType::PriorInstinct
                    && !n.is_resource()
            })
        })
        .filter_map(|s| realized.get(&s.instance_id))
        .copied()
        .filter(|v| v.is_finite() && *v > 0.0)
        .sum::<f64>()
        .clamp(0.0, 1.0);
    let receipt = &mut graph.action_episodes[index];
    let settled = receipt.social_reward_expectation.as_mut().unwrap();
    settled.settled_at = Some(tick);
    settled.outcome = Some(outcome.into());
    settled.reward = Some(reward);
    receipt.reward_consumed_at.get_or_insert(tick);
    if expectation.sources.is_empty()
        || !expectation.config.valid()
        || !graph.nodes.values().any(|n| {
            n.active
                && n.node_type == NodeType::Meme
                && n.meme.as_ref().is_some_and(|m| {
                    m.is_identity
                        && m.group_id.as_deref() == Some(expectation.config.group_context.as_str())
                })
        })
        || !expectation.prediction.is_finite()
        || expectation.prediction < 0.0
        || !graph.nodes.get(&episode.action_id).is_some_and(|n| {
            n.node_type == NodeType::Action && n.schema_id == episode.action_schema_id
        })
    {
        return;
    }
    let error = reward - expectation.prediction;
    let delta = 0.08 * error / expectation.sources.len() as f64;
    if !delta.is_finite() {
        return;
    }
    for source in expectation.sources {
        let Some(node) = graph.nodes.get(&source.instance_id).filter(|n| {
            n.schema_id == source.schema_id
                && n.value.is_finite()
                && source.value.is_finite()
                && source.value > 0.0
                && source.value <= 1.0
        }) else {
            continue;
        };
        let valid_source = if node.node_type == NodeType::PriorInstinct {
            !node.is_resource()
                && graph.nodes.values().any(|n| {
                    n.active
                        && n.node_type == NodeType::Meme
                        && n.meme.as_ref().is_some_and(|m| {
                            m.is_identity
                                && m.group_id.as_deref()
                                    == Some(expectation.config.group_context.as_str())
                                && m.social_need_bindings.iter().any(|b| {
                                    b.need_schema_id == source.schema_id
                                        && b.relief.is_finite()
                                        && b.relief > 0.0
                                        && b.relief <= 1.0
                                })
                        })
                })
        } else if node.node_type == NodeType::Observation {
            episode.stimulus.as_ref().is_some_and(|s| {
                node.instance_id == s.observation_instance_id
                    && node.created_at == s.presented_at
                    && node.observation.as_ref().is_some_and(|o| {
                        o.presentation_count == s.presentation_count
                            && o.emitter_id == s.emitter_id
                            && o.group_context == s.group_context
                    })
            })
        } else {
            false
        };
        if !valid_source {
            continue;
        }
        let source_id = source.instance_id;
        let edge_id = format!("operant_{}_{}", source_id, episode.action_id);
        let existing = graph.edges.get(&edge_id);
        if existing.is_some_and(|e| {
            !(valid_operant(e, &source_id, &episode.action_id)
                || (delta > 0.0
                    && e.source_instance_id == source_id
                    && e.target_instance_id == episode.action_id
                    && e.learnable
                    && e.learn_type == LearnType::Operant
                    && e.polarity == Polarity::Excitatory
                    && e.weight == 0.0))
        }) || (delta <= 0.0 && existing.is_none())
        {
            continue;
        }
        let old_weight = existing.map_or(0.0, |e| e.weight);
        let new_weight = (old_weight + delta).clamp(0.0, 1.0);
        let cost = (new_weight - old_weight).abs() * 0.375;
        if !cost.is_finite() || cost <= 1e-8 {
            continue;
        }
        let Some(dopamine) = graph.nodes.values_mut().find(|n| {
            n.schema_id == DOPAMINE_SCHEMA
                && n.is_resource()
                && n.value.is_finite()
                && n.value >= cost
        }) else {
            continue;
        };
        dopamine.value -= cost;
        let remaining = dopamine.value;
        let created = existing.is_none();
        let edge = graph
            .edges
            .entry(edge_id.clone())
            .or_insert_with(|| AssociationEdge {
                edge_id: edge_id.clone(),
                source_instance_id: source_id.clone(),
                target_instance_id: episode.action_id.clone(),
                polarity: Polarity::Excitatory,
                weight: 0.0,
                learnable: true,
                decay_rate_per_tick: 0.0,
                learn_type: LearnType::Operant,
                evidence: Evidence::default(),
            });
        edge.weight = new_weight;
        edge.evidence.co_occurrence_count = edge.evidence.co_occurrence_count.saturating_add(1);
        edge.evidence.last_co_occurred_at = tick;
        let receipt = &mut graph.action_episodes[index];
        if new_weight > old_weight {
            receipt.rewarded_at = Some(tick);
            receipt.reinforcement_dopamine_spent += cost;
            if let Some(a) = graph
                .nodes
                .get_mut(&episode.action_id)
                .and_then(|n| n.action.as_mut())
            {
                a.proficiency_level = (a.proficiency_level + new_weight - old_weight).min(1.0);
            }
        } else {
            receipt
                .social_reward_expectation
                .as_mut()
                .unwrap()
                .extinction_dopamine_spent += cost;
        }
        if created {
            events.push(WorldEvent::EdgeCreated {
                character_id: character_id.into(),
                edge_id: edge_id.clone(),
                source_id: source_id.clone(),
                target_id: episode.action_id.clone(),
                weight: new_weight,
            });
        } else {
            events.push(WorldEvent::EdgeWeightChanged {
                character_id: character_id.into(),
                edge_id: edge_id.clone(),
                old_weight,
                new_weight,
            });
        }
        events.push(WorldEvent::ResourceConsumed {
            character_id: character_id.into(),
            resource_schema_id: DOPAMINE_SCHEMA.into(),
            amount: cost,
            remaining,
        });
        events.push(WorldEvent::LearningUpdated {
            character_id: character_id.into(),
            edge_id,
            source_id,
            target_id: episode.action_id.clone(),
            reward,
            prediction: expectation.prediction,
            prediction_error: error,
            dopamine_spent: cost,
            old_weight,
            new_weight,
            phase: if created {
                "created"
            } else if new_weight > old_weight {
                "reinforced"
            } else {
                "extinguished"
            }
            .into(),
        });
    }
}

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
                            observation.action_credit.clone(),
                            observation.social_reward_scale,
                        )
                    })
                })
                .collect();

            for (observation_id, signal_type, group_context, credit_pin, scale) in signals {
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
                if credit_pin.as_ref().is_some_and(|pin| {
                    !matches!(
                        signal_type,
                        Some(SignalType::Approval | SignalType::Belonging)
                    ) || !graph.credit_pin_valid(pin, tick)
                        || graph
                            .nodes
                            .get(&observation_id)
                            .filter(|node| node.created_at == pin.reserved_at)
                            .and_then(|node| node.observation.as_ref())
                            .is_none_or(|observation| {
                                observation.emitter_id.as_deref()
                                    != Some(pin.config.emitter_id.as_str())
                                    || observation.group_context.as_deref()
                                        != Some(pin.config.group_context.as_str())
                            })
                }) {
                    continue;
                }
                if let Some(pin) = &credit_pin {
                    graph.action_episodes[pin.episode_index].social_reward_delivered_at =
                        Some(tick);
                }
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
                let mut realized_needs = BTreeMap::new();
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
                    let relief = relief
                        * if scale.is_finite() {
                            scale.clamp(0.0, 1.0)
                        } else {
                            0.0
                        };
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
                    if positive {
                        realized_needs.insert(source_id.clone(), realized);
                    }
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
                    if reward > 0.0 && new_weight > prediction {
                        edge.evidence.social_dopamine_spent += cost;
                    }
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
                if let Some(pin) = &credit_pin {
                    reward_action(
                        graph,
                        pin,
                        &realized_needs,
                        tick,
                        &character_id,
                        &mut state.pending_events,
                    );
                }
            }
            let expired: Vec<_> = graph
                .action_episodes
                .iter()
                .enumerate()
                .filter_map(|(i, e)| {
                    e.social_reward_expectation
                        .as_ref()
                        .filter(|x| x.settled_at.is_none() && tick > x.deadline)
                        .map(|_| i)
                })
                .collect();
            for index in expired {
                settle_expectation(
                    graph,
                    index,
                    &BTreeMap::new(),
                    tick,
                    &character_id,
                    &mut state.pending_events,
                    "omitted",
                );
            }
        }
    }
}

/// Only the actual realized need outcome buys a positive action update. The
/// instruction receipt supplies its exact cue; unrelated current context cannot
/// become a predictor retroactively.
fn reward_action(
    graph: &mut crate::models::mind_graph::MindGraph,
    pin: &crate::models::mind_graph::ActionCreditPin,
    realized_needs: &BTreeMap<String, f64>,
    tick: u64,
    character_id: &str,
    events: &mut Vec<WorldEvent>,
) {
    if graph.action_episodes[pin.episode_index]
        .social_reward_expectation
        .is_some()
    {
        settle_expectation(
            graph,
            pin.episode_index,
            realized_needs,
            tick,
            character_id,
            events,
            "delivered",
        );
        return;
    }
    let episode = graph.action_episodes[pin.episode_index].clone();
    if !graph.nodes.get(&episode.action_id).is_some_and(|node| {
        node.node_type == NodeType::Action && node.schema_id == episode.action_schema_id
    }) {
        return;
    }
    let mut sources: Vec<String> = episode
        .contexts
        .iter()
        .filter(|context| {
            context.value.is_finite()
                && context.value > 0.0
                && realized_needs.contains_key(&context.instance_id)
                && graph.nodes.get(&context.instance_id).is_some_and(|node| {
                    node.node_type == NodeType::PriorInstinct
                        && !node.is_resource()
                        && node.schema_id == context.schema_id
                })
        })
        .map(|context| context.instance_id.clone())
        .collect();
    // No captured need deficit: a later reward cannot fabricate its cause.
    if sources.is_empty() {
        return;
    }
    let reward = sources
        .iter()
        .filter_map(|id| realized_needs.get(id))
        .sum::<f64>()
        .clamp(0.0, 1.0);
    let cue_id = &pin.stimulus.observation_instance_id;
    if graph.nodes.get(cue_id).is_some_and(|node| {
        node.node_type == NodeType::Observation
            && node.schema_id == pin.stimulus.observation_schema_id
            && node.observation.as_ref().is_some_and(|observation| {
                observation.emitter_id == pin.stimulus.emitter_id
                    && observation.group_context == pin.stimulus.group_context
            })
    }) {
        sources.push(cue_id.clone());
    }
    sources.sort();
    sources.dedup();
    let prediction = sources
        .iter()
        .map(|source_id| {
            graph
                .edges
                .get(&format!("operant_{}_{}", source_id, episode.action_id))
                .filter(|edge| edge.learnable && edge.learn_type == LearnType::Operant)
                .map_or(0.0, |edge| edge.weight)
        })
        .sum::<f64>();
    if !prediction.is_finite() || reward <= prediction {
        return;
    }
    let error = reward - prediction;
    let delta = 0.08 * error / sources.len() as f64;
    for source_id in sources {
        let edge_id = format!("operant_{}_{}", source_id, episode.action_id);
        let existing = graph.edges.get(&edge_id);
        if existing.is_some_and(|edge| !edge.learnable || edge.learn_type != LearnType::Operant) {
            continue;
        }
        let old_weight = existing.map_or(0.0, |edge| edge.weight);
        let new_weight = (old_weight + delta).clamp(0.0, 1.0);
        let cost = (new_weight - old_weight) * 0.375;
        if !cost.is_finite() || cost <= 1e-8 {
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
        let remaining = dopamine.value;
        let created = !graph.edges.contains_key(&edge_id);
        let edge = graph
            .edges
            .entry(edge_id.clone())
            .or_insert_with(|| AssociationEdge {
                edge_id: edge_id.clone(),
                source_instance_id: source_id.clone(),
                target_instance_id: episode.action_id.clone(),
                polarity: Polarity::Excitatory,
                weight: 0.0,
                learnable: true,
                decay_rate_per_tick: 0.0,
                learn_type: LearnType::Operant,
                evidence: Evidence::default(),
            });
        edge.weight = new_weight;
        edge.evidence.co_occurrence_count = edge.evidence.co_occurrence_count.saturating_add(1);
        edge.evidence.last_co_occurred_at = tick;
        let receipt = &mut graph.action_episodes[pin.episode_index];
        receipt.rewarded_at = Some(tick);
        receipt.reinforcement_dopamine_spent += cost;
        if let Some(action) = graph
            .nodes
            .get_mut(&episode.action_id)
            .and_then(|node| node.action.as_mut())
        {
            action.proficiency_level = (action.proficiency_level + delta).min(1.0);
        }
        if created {
            events.push(WorldEvent::EdgeCreated {
                character_id: character_id.into(),
                edge_id: edge_id.clone(),
                source_id: source_id.clone(),
                target_id: episode.action_id.clone(),
                weight: new_weight,
            });
        } else {
            events.push(WorldEvent::EdgeWeightChanged {
                character_id: character_id.into(),
                edge_id: edge_id.clone(),
                old_weight,
                new_weight,
            });
        }
        events.push(WorldEvent::ResourceConsumed {
            character_id: character_id.into(),
            resource_schema_id: DOPAMINE_SCHEMA.into(),
            amount: cost,
            remaining,
        });
        events.push(WorldEvent::LearningUpdated {
            character_id: character_id.into(),
            edge_id,
            source_id,
            target_id: episode.action_id.clone(),
            reward,
            prediction,
            prediction_error: error,
            dopamine_spent: cost,
            old_weight,
            new_weight,
            phase: if created { "created" } else { "reinforced" }.into(),
        });
    }
}
