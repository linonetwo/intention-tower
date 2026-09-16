use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::*;
use crate::models::world_state::WorldState;

/// System #15: Meme infection — matches meme bindingSites against existing node schemas.
/// If a character has all required binding sites, the meme "infects" and spawns.
/// Key for: 模因和魔法、消费主义魔法、信仰与意识形态、内切模因
pub struct MemeInfectionSystem;

impl System for MemeInfectionSystem {
    fn name(&self) -> &'static str {
        "MemeInfectionSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();
            // Find pending (recently spawned) meme nodes that haven't been fully integrated
            let meme_ids: Vec<String> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Meme
                        && n.active
                        && n.attended
                        && n.meme
                            .as_ref()
                            .map_or(false, |m| !m.binding_sites.is_empty())
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for meme_id in meme_ids {
                let binding_sites = {
                    let meme = character.mind_graph.nodes.get(&meme_id);
                    meme.and_then(|n| n.meme.as_ref())
                        .map(|m| m.binding_sites.clone())
                        .unwrap_or_default()
                };

                if binding_sites.is_empty() {
                    continue;
                }

                // Check if all binding sites are present as node schemas
                let all_present = binding_sites
                    .iter()
                    .all(|bs| character.mind_graph.find_by_schema(bs).is_some());

                if all_present {
                    // Create edges from meme to each binding site node
                    for bs in &binding_sites {
                        if let Some(target) = character.mind_graph.find_by_schema(bs) {
                            let target_id = target.instance_id.clone();
                            let edge_id = format!("meme_bind_{}_{}", meme_id, target_id);
                            if !character.mind_graph.edges.contains_key(&edge_id) {
                                let edge = AssociationEdge {
                                    edge_id: edge_id.clone(),
                                    source_instance_id: meme_id.clone(),
                                    target_instance_id: target_id.clone(),
                                    polarity: Polarity::Excitatory,
                                    weight: 0.5,
                                    learnable: false,
                                    decay_rate_per_tick: 0.001,
                                    learn_type: LearnType::MemeInfection,
                                    evidence: Evidence::default(),
                                };
                                character.mind_graph.add_edge(edge);
                                state.pending_events.push(WorldEvent::EdgeCreated {
                                    character_id: char_id.clone(),
                                    edge_id,
                                    source_id: meme_id.clone(),
                                    target_id,
                                    weight: 0.5,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}
