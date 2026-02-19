use super::System;
use crate::models::world_state::WorldState;
use crate::models::events::WorldEvent;

/// System #22: Cleanup expired TTL nodes and orphaned edges.
pub struct CleanupSystem;

impl System for CleanupSystem {
    fn name(&self) -> &'static str { "CleanupSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let current_tick = state.tick;

        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find nodes with expired TTL
            let expired: Vec<String> = character.mind_graph.nodes.values()
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
                character.mind_graph.remove_node(&id);
                state.pending_events.push(WorldEvent::NodeDespawned {
                    character_id: char_id.clone(),
                    instance_id: id,
                });
            }
        }
    }
}
