use super::System;
use crate::models::world_state::WorldState;

/// System #2: Regenerates resource nodes (attention, dopamine, health) toward their setPoint.
pub struct ResourceRegenSystem;

impl System for ResourceRegenSystem {
    fn name(&self) -> &'static str { "ResourceRegenSystem" }

    fn run(&self, state: &mut WorldState, dt: f64) {
        for character in state.characters.values_mut() {
            let resource_ids: Vec<String> = character.mind_graph.nodes.values()
                .filter(|n| n.is_resource())
                .map(|n| n.instance_id.clone())
                .collect();

            for id in resource_ids {
                if let Some(node) = character.mind_graph.nodes.get_mut(&id) {
                    let set_point = node.prior_instinct.as_ref()
                        .map_or(1.0, |pi| pi.set_point);
                    let regen = node.value_velocity * dt;

                    let old_value = node.value;
                    // Regen toward setPoint, clamp to [0, setPoint]
                    if node.value < set_point {
                        node.value = (node.value + regen).min(set_point);
                    }

                    if (node.value - old_value).abs() > f64::EPSILON {
                        state.pending_events.push(
                            crate::models::events::WorldEvent::NodeValueChanged {
                                character_id: character.id.clone(),
                                instance_id: id.clone(),
                                old_value,
                                new_value: node.value,
                            }
                        );
                    }
                }
            }
        }
    }
}
