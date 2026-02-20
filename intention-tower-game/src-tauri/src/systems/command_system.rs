use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::*;
use crate::models::commands::CommandEffect;
use crate::models::events::WorldEvent;

/// System #4: Processes player commands from the pending command queue.
/// Each command is a declarative DTO with preconditions and effects.
pub struct CommandSystem;

/// Resolve "__target" placeholder to actual target_id
fn resolve_target<'a>(explicit: Option<&'a str>, fallback: Option<&'a str>) -> Option<&'a str> {
    match explicit {
        Some("__target") | None => fallback,
        Some(id) => Some(id),
    }
}

impl System for CommandSystem {
    fn name(&self) -> &'static str { "CommandSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let commands = std::mem::take(&mut state.pending_commands);

        for cmd in commands {
            // Emit command executed event
            state.pending_events.push(WorldEvent::CommandExecuted {
                actor_id: cmd.actor_id.clone(),
                command_id: cmd.command_id.clone(),
                target_id: cmd.target_id.clone(),
            });

            // Process each effect
            for effect in &cmd.effects {
                match effect {
                    CommandEffect::SpawnObservation { schema_id, modality, about, ttl, strength, target_character_id } => {
                        let target_char = resolve_target(target_character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                let instance_id = format!("obs_{}_{}", schema_id, state.tick);
                                let node = MindNode {
                                    instance_id: instance_id.clone(),
                                    schema_id: schema_id.clone(),
                                    label: schema_id.clone(),
                                    node_type: NodeType::Observation,
                                    value: 1.0,
                                    value_velocity: 0.0,
                                    strength: *strength,
                                    active: true,
                                    created_at: state.tick,
                                    ttl: Some(*ttl),
                                    hidden_by_default: false,
                                    thresholds: Vec::new(),
                                    costs: Vec::new(),
                                    observation: Some(ObservationData {
                                        modality: Some(*modality),
                                        about: Some(about.clone()),
                                        novelty_key: Some(format!("{}-{}", modality_str(*modality), about)),
                                        credibility: 1.0,
                                        satisfaction: 0.0,
                                        source: Some(ObservationSource::Environment),
                                        ..Default::default()
                                    }),
                                    prior_instinct: None,
                                    motivation: None,
                                    action: None,
                                    meme: None,
                                    prev_value: 0.0,
                                    reality_layer: 0,
                                    is_virtual: false,
                                };
                                character.mind_graph.add_node(node);
                                state.pending_events.push(WorldEvent::NodeSpawned {
                                    character_id: char_id.to_string(),
                                    instance_id,
                                    schema_id: schema_id.clone(),
                                    node_type: "Observation".to_string(),
                                });
                            }
                        }
                    }
                    CommandEffect::ModifyNodeValue { schema_id, delta, target_character_id } => {
                        let target_char = resolve_target(target_character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(node) = character.mind_graph.find_by_schema_mut(schema_id) {
                                    let old = node.value;
                                    node.value = (node.value + delta).clamp(0.0, 1.0);
                                    state.pending_events.push(WorldEvent::NodeValueChanged {
                                        character_id: char_id.to_string(),
                                        instance_id: node.instance_id.clone(),
                                        old_value: old,
                                        new_value: node.value,
                                    });
                                }
                            }
                        }
                    }
                    CommandEffect::ConsumeResource { resource_schema_id, amount, target_character_id } => {
                        let target_char = resolve_target(target_character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                let old = character.mind_graph.resource_value(resource_schema_id);
                                character.mind_graph.consume_resource(resource_schema_id, *amount);
                                state.pending_events.push(WorldEvent::ResourceConsumed {
                                    character_id: char_id.to_string(),
                                    resource_schema_id: resource_schema_id.clone(),
                                    amount: *amount,
                                    remaining: character.mind_graph.resource_value(resource_schema_id),
                                });
                            }
                        }
                    }
                    CommandEffect::ReinforceEdge { source_schema_id, target_schema_id, delta, character_id } => {
                        let char_id = resolve_target(character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(cid) = char_id {
                            if let Some(character) = state.characters.get_mut(cid) {
                                // Find edge between nodes with those schemas
                                let edge_id = character.mind_graph.edges.values()
                                    .find(|e| {
                                        let src = character.mind_graph.nodes.get(&e.source_instance_id);
                                        let tgt = character.mind_graph.nodes.get(&e.target_instance_id);
                                        src.map_or(false, |s| s.schema_id == *source_schema_id)
                                            && tgt.map_or(false, |t| t.schema_id == *target_schema_id)
                                    })
                                    .map(|e| e.edge_id.clone());

                                if let Some(eid) = edge_id {
                                    if let Some(edge) = character.mind_graph.edges.get_mut(&eid) {
                                        let old = edge.weight;
                                        edge.weight = (edge.weight + delta).clamp(0.0, 1.0);
                                        state.pending_events.push(WorldEvent::EdgeWeightChanged {
                                            character_id: cid.to_string(),
                                            edge_id: eid,
                                            old_weight: old,
                                            new_weight: edge.weight,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    CommandEffect::WeakenEdge { source_schema_id, target_schema_id, delta, character_id } => {
                        let char_id = resolve_target(character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(cid) = char_id {
                            if let Some(character) = state.characters.get_mut(cid) {
                                let edge_id = character.mind_graph.edges.values()
                                    .find(|e| {
                                        let src = character.mind_graph.nodes.get(&e.source_instance_id);
                                        let tgt = character.mind_graph.nodes.get(&e.target_instance_id);
                                        src.map_or(false, |s| s.schema_id == *source_schema_id)
                                            && tgt.map_or(false, |t| t.schema_id == *target_schema_id)
                                    })
                                    .map(|e| e.edge_id.clone());

                                if let Some(eid) = edge_id {
                                    if let Some(edge) = character.mind_graph.edges.get_mut(&eid) {
                                        let old = edge.weight;
                                        edge.weight = (edge.weight - delta).max(0.0);
                                        state.pending_events.push(WorldEvent::EdgeWeightChanged {
                                            character_id: cid.to_string(),
                                            edge_id: eid,
                                            old_weight: old,
                                            new_weight: edge.weight,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    CommandEffect::InjectMeme { meme_schema_id, target_character_id } => {
                        // Placeholder: will be processed by MemeInfectionSystem
                        let target_char = resolve_target(target_character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                let instance_id = format!("meme_{}_{}", meme_schema_id, state.tick);
                                let node = MindNode {
                                    instance_id: instance_id.clone(),
                                    schema_id: meme_schema_id.clone(),
                                    label: meme_schema_id.clone(),
                                    node_type: NodeType::Meme,
                                    value: 0.1,
                                    value_velocity: 0.0,
                                    strength: 0.5,
                                    active: true,
                                    created_at: state.tick,
                                    ttl: None,
                                    hidden_by_default: false,
                                    thresholds: Vec::new(),
                                    costs: Vec::new(),
                                    observation: None,
                                    prior_instinct: None,
                                    motivation: None,
                                    action: None,
                                    meme: Some(MemeData::default()),
                                    prev_value: 0.0,
                                    reality_layer: 0,
                                    is_virtual: false,
                                };
                                character.mind_graph.add_node(node);
                                state.pending_events.push(WorldEvent::NodeSpawned {
                                    character_id: char_id.to_string(),
                                    instance_id,
                                    schema_id: meme_schema_id.clone(),
                                    node_type: "Meme".to_string(),
                                });
                            }
                        }
                    }
                    CommandEffect::DeleteNode { schema_id, target_character_id } => {
                        let target_char = resolve_target(target_character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(node) = character.mind_graph.find_by_schema(schema_id) {
                                    let iid = node.instance_id.clone();
                                    character.mind_graph.remove_node(&iid);
                                    state.pending_events.push(WorldEvent::NodeDespawned {
                                        character_id: char_id.to_string(),
                                        instance_id: iid,
                                    });
                                }
                            }
                        }
                    }
                    CommandEffect::ModifyResourceRegen { resource_schema_id, new_regen_rate, target_character_id } => {
                        let target_char = resolve_target(target_character_id.as_deref(), cmd.target_id.as_deref());
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(node) = character.mind_graph.find_by_schema_mut(resource_schema_id) {
                                    node.value_velocity = *new_regen_rate;
                                }
                            }
                        }
                    }
                    // Effects that are just world-level events
                    CommandEffect::EmitWorldEvent { event } => {
                        state.pending_events.push(event.clone());
                    }
                }
            }
        }
    }
}

fn modality_str(m: Modality) -> &'static str {
    match m {
        Modality::Visual => "visual",
        Modality::Auditory => "auditory",
        Modality::Olfactory => "olfactory",
        Modality::Gustatory => "gustatory",
        Modality::Tactile => "tactile",
        Modality::Interoceptive => "interoceptive",
        Modality::Chemical => "chemical",
        Modality::Social => "social",
    }
}
