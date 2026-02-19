use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::NodeType;

/// System #17: Belief-instinct conflict resolution.
/// When a Belief meme has overridesInstinct, it suppresses matching PriorInstinct nodes.
/// Key for: 信仰与意识形态、死要面子活受罪
pub struct BeliefConflictSystem;

impl System for BeliefConflictSystem {
    fn name(&self) -> &'static str { "BeliefConflictSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            // Collect active beliefs with overridesInstinct
            let overrides: Vec<(String, Vec<String>)> = character.mind_graph.nodes.values()
                .filter(|n| {
                    n.node_type == NodeType::Meme
                        && n.active
                        && n.meme.as_ref().map_or(false, |m| m.is_belief && !m.overrides_instinct.is_empty())
                })
                .map(|n| {
                    let targets = n.meme.as_ref().unwrap().overrides_instinct.clone();
                    (n.instance_id.clone(), targets)
                })
                .collect();

            // Suppress matching instincts
            for (_belief_id, target_schemas) in &overrides {
                for target_schema in target_schemas {
                    // Find and suppress matching PriorInstinct
                    let instinct_ids: Vec<String> = character.mind_graph.nodes.values()
                        .filter(|n| {
                            n.node_type == NodeType::PriorInstinct
                                && n.schema_id == *target_schema
                                && n.prior_instinct.as_ref().map_or(false, |pi| pi.overridable_by_meme)
                        })
                        .map(|n| n.instance_id.clone())
                        .collect();

                    for iid in instinct_ids {
                        if let Some(node) = character.mind_graph.nodes.get_mut(&iid) {
                            // Reduce the instinct's effective strength (suppression, not deletion)
                            node.strength = (node.strength * 0.5).max(0.01);
                        }
                    }
                }
            }
        }
    }
}
