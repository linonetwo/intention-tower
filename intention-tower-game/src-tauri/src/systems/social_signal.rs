use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::NodeType;

/// System #16: Processes social signals — status, belonging, approval, rejection.
/// Updates Identity and group belonging meme nodes based on incoming social observations.
/// Key for: 社交与归属、地位与支配、浪潮实验、人从众
pub struct SocialSignalSystem;

impl System for SocialSignalSystem {
    fn name(&self) -> &'static str { "SocialSignalSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            // Find social signal observations
            let signals: Vec<(String, String, String)> = character.mind_graph.nodes.values()
                .filter(|n| {
                    n.node_type == NodeType::Observation
                        && n.active
                        && n.observation.as_ref().map_or(false, |o| o.is_signal)
                })
                .filter_map(|n| {
                    let obs = n.observation.as_ref()?;
                    let signal_type = format!("{:?}", obs.signal_type?);
                    let group_ctx = obs.group_context.clone().unwrap_or_default();
                    Some((n.instance_id.clone(), signal_type, group_ctx))
                })
                .collect();

            for (_obs_id, signal_type, group_context) in signals {
                // Find identity memes matching this group
                let identity_ids: Vec<String> = character.mind_graph.nodes.values()
                    .filter(|n| {
                        n.node_type == NodeType::Meme
                            && n.meme.as_ref().map_or(false, |m| {
                                m.is_identity
                                    && m.group_id.as_deref() == Some(&group_context)
                            })
                    })
                    .map(|n| n.instance_id.clone())
                    .collect();

                for id_node_id in identity_ids {
                    if let Some(node) = character.mind_graph.nodes.get_mut(&id_node_id) {
                        match signal_type.as_str() {
                            "Approval" | "Belonging" => {
                                node.strength = (node.strength + 0.05).min(1.0);
                            }
                            "Rejection" | "Threat" => {
                                node.strength = (node.strength - 0.05).max(0.0);
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }
}
