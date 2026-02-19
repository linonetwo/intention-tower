use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::{MindNode, NodeType, ThresholdTrigger};
use crate::models::events::WorldEvent;

/// System #10: Checks ThresholdTriggers on each node for rising/falling crossings.
/// Spawns or despawns managed child nodes accordingly.
pub struct ThresholdSystem;

impl System for ThresholdSystem {
    fn name(&self) -> &'static str { "ThresholdSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            // Collect spawn/despawn actions to avoid borrow conflicts
            let mut spawns: Vec<(String, ThresholdTrigger, u64)> = Vec::new(); // (parent_id, trigger, tick)
            let mut despawns: Vec<(String, String, String)> = Vec::new(); // (parent_id, trigger_id, managed_id)

            for node in character.mind_graph.nodes.values() {
                let prev = node.prev_value;
                let curr = node.value;

                for trigger in &node.thresholds {
                    // Rising crossing: prev < threshold <= curr
                    if prev < trigger.activate_on_rising_above
                        && curr >= trigger.activate_on_rising_above
                        && trigger.managed_instance_id.is_none()
                    {
                        spawns.push((node.instance_id.clone(), trigger.clone(), state.tick));
                    }

                    // Falling crossing: value is below deactivate threshold and we have a managed instance
                    // Uses both prev_value crossing check AND absolute check for robustness
                    // (external modifications like feeding may skip prev_value update)
                    if let Some(ref managed_id) = trigger.managed_instance_id {
                        if curr < trigger.deactivate_on_falling_below {
                            despawns.push((
                                node.instance_id.clone(),
                                trigger.trigger_id.clone(),
                                managed_id.clone(),
                            ));
                        }
                    }
                }
            }

            // Execute spawns
            for (parent_id, trigger, tick) in spawns {
                let managed_id = format!("{}__{}",
                    parent_id, trigger.trigger_id);

                let child = MindNode {
                    instance_id: managed_id.clone(),
                    schema_id: trigger.spawn_schema_id.clone(),
                    label: trigger.spawn_schema_id.clone(), // Will be resolved to i18n key
                    node_type: trigger.spawn_node_type,
                    value: 0.0,
                    value_velocity: 0.0,
                    strength: 0.5,
                    active: true,
                    created_at: tick,
                    ttl: None,
                    hidden_by_default: false,
                    thresholds: Vec::new(),
                    costs: Vec::new(),
                    observation: None,
                    prior_instinct: if trigger.spawn_node_type == NodeType::PriorInstinct {
                        Some(crate::models::mind_node::PriorInstinctData {
                            is_mood: true, // Threshold-spawned PriorInstinct are mood nodes
                            valence: Some(crate::models::mind_node::Valence::Negative),
                            ..Default::default()
                        })
                    } else {
                        None
                    },
                    motivation: if trigger.spawn_node_type == NodeType::Motivation {
                        Some(crate::models::mind_node::MotivationData {
                            spawned_by: Some(parent_id.clone()),
                            lookback_window_sec: 10.0,
                            ..Default::default()
                        })
                    } else {
                        None
                    },
                    action: None,
                    meme: None,
                    prev_value: 0.0,
                };

                character.mind_graph.add_node(child);

                // Update trigger's managed_instance_id
                if let Some(parent_node) = character.mind_graph.nodes.get_mut(&parent_id) {
                    for t in &mut parent_node.thresholds {
                        if t.trigger_id == trigger.trigger_id {
                            t.managed_instance_id = Some(managed_id.clone());
                        }
                    }
                }

                state.pending_events.push(WorldEvent::ThresholdCrossed {
                    character_id: char_id.clone(),
                    instance_id: parent_id.clone(),
                    trigger_id: trigger.trigger_id.clone(),
                    direction: "rising".to_string(),
                });
                state.pending_events.push(WorldEvent::NodeSpawned {
                    character_id: char_id.clone(),
                    instance_id: managed_id,
                    schema_id: trigger.spawn_schema_id.clone(),
                    node_type: format!("{:?}", trigger.spawn_node_type),
                });
            }

            // Execute despawns
            for (parent_id, trigger_id, managed_id) in despawns {
                character.mind_graph.remove_node(&managed_id);

                if let Some(parent_node) = character.mind_graph.nodes.get_mut(&parent_id) {
                    for t in &mut parent_node.thresholds {
                        if t.trigger_id == trigger_id {
                            t.managed_instance_id = None;
                        }
                    }
                }

                state.pending_events.push(WorldEvent::ThresholdCrossed {
                    character_id: char_id.clone(),
                    instance_id: parent_id.clone(),
                    trigger_id: trigger_id.clone(),
                    direction: "falling".to_string(),
                });
                state.pending_events.push(WorldEvent::NodeDespawned {
                    character_id: char_id.clone(),
                    instance_id: managed_id,
                });
            }
        }
    }
}
