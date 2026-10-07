use super::System;
use crate::models::events::WorldEvent;
use crate::models::world_state::WorldState;

/// System #22: Cleanup expired TTL nodes and orphaned edges.
pub struct CleanupSystem;

impl System for CleanupSystem {
    fn name(&self) -> &'static str {
        "CleanupSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;

        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find nodes with expired TTL
            let expired: Vec<String> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    if let Some(ttl) = n.ttl {
                        n.created_at + ttl <= current_tick
                    } else {
                        false
                    }
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for id in expired {
                // A learned percept is memory, not a disposable stimulus. Keep
                // its identity and associations, but stop its sensory activity.
                let remembered = character
                    .mind_graph
                    .edges
                    .values()
                    .any(|edge| edge.source_instance_id == id || edge.target_instance_id == id)
                    || character
                        .mind_graph
                        .conditioning_trials
                        .iter()
                        .any(|trial| trial.source_id == id);
                if remembered {
                    if let Some(node) = character.mind_graph.nodes.get_mut(&id) {
                        if node.active {
                            state.pending_events.push(WorldEvent::NodeDeactivated {
                                character_id: char_id.clone(),
                                instance_id: id.clone(),
                            });
                        }
                        node.active = false;
                        node.attended = false;
                        node.value = 0.0;
                        node.ttl = None;
                    }
                    continue;
                }
                character.mind_graph.remove_node(&id);
                state.pending_events.push(WorldEvent::NodeDespawned {
                    character_id: char_id.clone(),
                    instance_id: id,
                });
            }
        }
    }
}
