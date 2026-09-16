use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #18: Attention flood — when isAttentionFlood memes are active,
/// they spawn many distractor nodes that consume attention budget.
/// Key for: 触发网瘾、赛博梦中梦、网瘾少年
pub struct AttentionFloodSystem;

const ATTENTION_SCHEMA: &str = "it:concept/attention";

impl System for AttentionFloodSystem {
    fn name(&self) -> &'static str {
        "AttentionFloodSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find active attention flood memes
            let floods: Vec<(String, f64)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Meme
                        && n.active
                        && n.meme.as_ref().map_or(false, |m| m.is_attention_flood)
                })
                .map(|n| {
                    let drain = n
                        .meme
                        .as_ref()
                        .and_then(|m| m.flood_drain_rate_per_tick)
                        .unwrap_or(0.1);
                    (n.instance_id.clone(), drain)
                })
                .collect();

            for (_flood_id, drain_rate) in floods {
                // Drain attention directly
                character
                    .mind_graph
                    .consume_resource(ATTENTION_SCHEMA, drain_rate);
                state.pending_events.push(WorldEvent::ResourceConsumed {
                    character_id: char_id.clone(),
                    resource_schema_id: ATTENTION_SCHEMA.to_string(),
                    amount: drain_rate,
                    remaining: character.mind_graph.resource_value(ATTENTION_SCHEMA),
                });
            }
        }
    }
}
