use super::System;
use crate::models::world_state::WorldState;

/// System #9: Updates PriorInstinct values by their velocity (natural drift) and
/// observation satisfaction modifiers.
pub struct InstinctUpdateSystem;

impl System for InstinctUpdateSystem {
    fn name(&self) -> &'static str {
        "InstinctUpdateSystem"
    }

    fn run(&self, state: &mut WorldState, dt: f64) {
        for character in state.characters.values_mut() {
            let instinct_ids: Vec<String> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == crate::models::mind_node::NodeType::PriorInstinct
                        && !n.is_resource()
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for id in instinct_ids {
                if let Some(node) = character.mind_graph.nodes.get_mut(&id) {
                    node.prev_value = node.value;
                    let velocity = node.value_velocity * dt;
                    let old_value = node.value;
                    node.value += velocity;
                    // Clamp to [0, 1] for standard instinct range
                    node.value = node.value.clamp(0.0, 1.0);

                    if (node.value - old_value).abs() > f64::EPSILON {
                        state.pending_events.push(
                            crate::models::events::WorldEvent::NodeValueChanged {
                                character_id: character.id.clone(),
                                instance_id: id.clone(),
                                old_value,
                                new_value: node.value,
                            },
                        );
                    }
                }
            }
        }
    }
}
