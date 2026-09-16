use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::*;
use crate::models::world_state::WorldState;

/// System #6: Converts pending WorldEvents (SoundEmitted, FoodPresented, etc.)
/// into Observation nodes in the perceiving character's MindGraph.
/// This is the bridge between the "objective world" and the "subjective mind".
pub struct PerceptionSystem;

impl System for PerceptionSystem {
    fn name(&self) -> &'static str {
        "PerceptionSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let virtual_depth = state.virtual_context_stack.len().min(u8::MAX as usize) as u8;
        let in_virtual_context = state.in_virtual_context;
        let perception_source = if in_virtual_context {
            ObservationSource::Virtual
        } else {
            ObservationSource::Environment
        };
        // Process sensory events from this tick and convert to Observation nodes
        // We iterate over pending_events (accumulated from earlier systems like CommandSystem)
        // and generate observation nodes for relevant characters.
        let events_snapshot: Vec<WorldEvent> = state.pending_events.clone();

        for event in &events_snapshot {
            match event {
                WorldEvent::SoundEmitted {
                    source_entity_id,
                    about,
                    modality,
                } => {
                    let source_position = state
                        .characters
                        .get(source_entity_id)
                        .map(|character| (character.position.x, character.position.y));
                    // Characters within the readable scene radius perceive the signal.
                    let char_ids: Vec<String> = state
                        .characters
                        .values()
                        .filter(|character| {
                            source_position.is_none_or(|(x, y)| {
                                (character.position.x - x).hypot(character.position.y - y) <= 450.0
                            })
                        })
                        .map(|character| character.id.clone())
                        .collect();
                    for char_id in char_ids {
                        if let Some(character) = state.characters.get_mut(&char_id) {
                            let instance_id = format!("perc_{}_{}", about, state.tick);
                            // Avoid duplicates
                            if character.mind_graph.nodes.contains_key(&instance_id) {
                                continue;
                            }
                            let mod_enum = match modality.as_str() {
                                "Auditory" => Modality::Auditory,
                                "Visual" => Modality::Visual,
                                "Olfactory" => Modality::Olfactory,
                                "Social" => Modality::Social,
                                _ => Modality::Auditory,
                            };
                            let node = MindNode {
                                instance_id: instance_id.clone(),
                                schema_id: about.clone(),
                                label: about.clone(),
                                node_type: NodeType::Observation,
                                value: 1.0,
                                value_velocity: 0.0,
                                strength: 0.8,
                                active: true,
                                attended: true,
                                suppression: 0.0,
                                created_at: state.tick,
                                ttl: Some(300),
                                hidden_by_default: false,
                                thresholds: Vec::new(),
                                costs: Vec::new(),
                                observation: Some(ObservationData {
                                    modality: Some(mod_enum),
                                    about: Some(about.clone()),
                                    novelty_key: Some(format!("{}-{}", modality, about)),
                                    credibility: 1.0,
                                    satisfaction: 0.0,
                                    source: Some(perception_source),
                                    is_signal: mod_enum == Modality::Social,
                                    signal_type: (mod_enum == Modality::Social)
                                        .then_some(SignalType::Belonging),
                                    emitter_id: Some(source_entity_id.clone()),
                                    ..Default::default()
                                }),
                                prior_instinct: None,
                                motivation: None,
                                action: None,
                                meme: None,
                                prev_value: 0.0,
                                reality_layer: virtual_depth,
                                is_virtual: in_virtual_context,
                            };
                            character.mind_graph.add_node(node);
                        }
                    }
                }
                WorldEvent::FoodPresented {
                    source_entity_id: _,
                    about,
                } => {
                    // All characters perceive food (olfactory/visual)
                    let char_ids: Vec<String> = state.characters.keys().cloned().collect();
                    for char_id in char_ids {
                        if let Some(character) = state.characters.get_mut(&char_id) {
                            let instance_id = format!("perc_food_{}_{}", about, state.tick);
                            if character.mind_graph.nodes.contains_key(&instance_id) {
                                continue;
                            }
                            let node = MindNode {
                                instance_id: instance_id.clone(),
                                schema_id: about.clone(),
                                label: about.clone(),
                                node_type: NodeType::Observation,
                                value: 1.0,
                                value_velocity: 0.0,
                                strength: 1.0,
                                active: true,
                                attended: true,
                                suppression: 0.0,
                                created_at: state.tick,
                                ttl: Some(300),
                                hidden_by_default: false,
                                thresholds: Vec::new(),
                                costs: Vec::new(),
                                observation: Some(ObservationData {
                                    modality: Some(Modality::Olfactory),
                                    about: Some(about.clone()),
                                    novelty_key: Some(format!("olfactory-{}", about)),
                                    credibility: 1.0,
                                    satisfaction: 0.5, // Food is inherently satisfying
                                    source: Some(perception_source),
                                    ..Default::default()
                                }),
                                prior_instinct: None,
                                motivation: None,
                                action: None,
                                meme: None,
                                prev_value: 0.0,
                                reality_layer: virtual_depth,
                                is_virtual: in_virtual_context,
                            };
                            character.mind_graph.add_node(node);
                        }
                    }
                }
                _ => {} // Other events don't generate observations directly
            }
        }
    }
}
