use std::collections::BTreeMap;

use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{MemeData, MindNode, NodeType, SpreadVector};
use crate::models::world_state::WorldState;

/// Crystallizes repeatedly perceived public behavior into a low-resilience
/// meme. This provides a deterministic bottom-up route alongside explicit
/// InjectMeme commands and lets authored scenarios build on emergent schemas.
pub struct MemeEmergenceSystem;

impl System for MemeEmergenceSystem {
    fn name(&self) -> &'static str {
        "MemeEmergenceSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let mut repeated: BTreeMap<String, (usize, bool, u8)> = BTreeMap::new();
            for node in character.mind_graph.nodes.values() {
                if node.node_type != NodeType::Observation || !node.active || !node.attended {
                    continue;
                }
                let Some(observation) = node.observation.as_ref() else {
                    continue;
                };
                let Some(about) = observation.about.as_ref() else {
                    continue;
                };
                let entry = repeated.entry(about.clone()).or_insert((0, false, 0));
                entry.0 += 1;
                entry.1 |= observation.is_signal;
                entry.2 = entry.2.max(node.reality_layer);
            }

            for (about, (count, is_social, reality_layer)) in repeated {
                if count < 3 {
                    continue;
                }
                let schema_id = format!("it:emergent/{}", sanitize(&about));
                if character.mind_graph.find_by_schema(&schema_id).is_some() {
                    continue;
                }
                let instance_id = format!("emergent_{}", sanitize(&about));
                character.mind_graph.add_node(MindNode {
                    instance_id: instance_id.clone(),
                    schema_id: schema_id.clone(),
                    label: schema_id.clone(),
                    node_type: NodeType::Meme,
                    value: (count as f64 * 0.08).min(0.6),
                    value_velocity: 0.0,
                    strength: (0.3 + count as f64 * 0.04).min(0.7),
                    active: true,
                    attended: true,
                    suppression: 0.0,
                    created_at: state.tick,
                    ttl: None,
                    hidden_by_default: false,
                    thresholds: Vec::new(),
                    costs: Vec::new(),
                    observation: None,
                    prior_instinct: None,
                    motivation: None,
                    action: None,
                    meme: Some(MemeData {
                        constituent_schemas: vec![about.clone()],
                        binding_sites: vec![about],
                        spread_vector: Some(if is_social {
                            SpreadVector::Language
                        } else {
                            SpreadVector::Visual
                        }),
                        resilience: 0.15,
                        ..Default::default()
                    }),
                    prev_value: 0.0,
                    reality_layer,
                    is_virtual: reality_layer > 0,
                });
                state.pending_events.push(WorldEvent::NodeSpawned {
                    character_id: character.id.clone(),
                    instance_id,
                    schema_id,
                    node_type: "Meme".to_owned(),
                });
            }
        }
    }
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect()
}
