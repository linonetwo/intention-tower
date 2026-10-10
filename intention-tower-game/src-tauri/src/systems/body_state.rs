use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{MindNode, Modality, NodeType, ObservationData, ObservationSource};
use crate::models::world_state::WorldState;

/// System #3: Monitors organ/body state and spawns interoceptive Observations.
/// For the Pavlov level this is a no-op; becomes relevant in 毁灭虫族 and 克苏鲁 levels.
pub struct BodyStateSystem;

impl System for BodyStateSystem {
    fn name(&self) -> &'static str {
        "BodyStateSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let mut events = Vec::new();
        for character in state.characters.values_mut() {
            let Some(health) = character
                .mind_graph
                .find_by_schema("it:concept/health")
                .map(|node| node.value)
            else {
                continue;
            };
            let instance_id = format!("body_{}_injury", character.id);
            let pain_value = (1.0 - health).clamp(0.0, 1.0);

            if health <= 0.7 {
                if let Some(existing) = character.mind_graph.nodes.get_mut(&instance_id) {
                    let old_value = existing.value;
                    let was_active = existing.active;
                    existing.value = pain_value;
                    existing.strength = (0.45 + pain_value * 0.5).min(1.0);
                    existing.active = true;
                    if (old_value - pain_value).abs() > f64::EPSILON {
                        events.push(WorldEvent::NodeValueChanged {
                            character_id: character.id.clone(),
                            instance_id: instance_id.clone(),
                            old_value,
                            new_value: pain_value,
                        });
                    }
                    if !was_active {
                        events.push(WorldEvent::NodeActivated {
                            character_id: character.id.clone(),
                            instance_id: instance_id.clone(),
                        });
                    }
                } else {
                    character.mind_graph.add_node(MindNode {
                        instance_id: instance_id.clone(),
                        schema_id: "it:concept/body-injury".to_string(),
                        label: "concept.body-injury.label".to_string(),
                        node_type: NodeType::Observation,
                        value: pain_value,
                        value_velocity: 0.0,
                        strength: (0.45 + pain_value * 0.5).min(1.0),
                        active: true,
                        attended: true,
                        suppression: 0.0,
                        created_at: state.tick,
                        ttl: None,
                        hidden_by_default: false,
                        thresholds: Vec::new(),
                        costs: Vec::new(),
                        observation: Some(ObservationData {
                            modality: Some(Modality::Interoceptive),
                            about: Some("it:concept/health".to_string()),
                            novelty_key: Some(format!("body-injury-{}", character.id)),
                            credibility: 1.0,
                            source: Some(ObservationSource::Body),
                            ..Default::default()
                        }),
                        prior_instinct: None,
                        motivation: None,
                        action: None,
                        meme: None,
                        prev_value: 0.0,
                        reality_layer: 0,
                        is_virtual: false,
                    });
                    events.push(WorldEvent::NodeSpawned {
                        character_id: character.id.clone(),
                        instance_id,
                        schema_id: "it:concept/body-injury".to_string(),
                        node_type: "Observation".to_string(),
                    });
                }
            } else if let Some(existing) = character.mind_graph.nodes.get_mut(&instance_id) {
                if existing.active {
                    existing.active = false;
                    events.push(WorldEvent::NodeDeactivated {
                        character_id: character.id.clone(),
                        instance_id,
                    });
                }
            }
        }
        state.pending_events.extend(events);
    }
}
