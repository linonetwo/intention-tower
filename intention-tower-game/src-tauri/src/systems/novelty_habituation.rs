use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::NodeType;

/// System #7: Habituation — repeated exposure to the same noveltyKey reduces strength.
/// This is why Pavlov walking around randomly becomes an isolated node:
/// "看到巴甫洛夫" appears many times without food → strength decays → ignored.
pub struct NoveltyHabituationSystem;

const HABITUATION_DECAY: f64 = 0.02;
const MIN_STRENGTH: f64 = 0.05;

impl System for NoveltyHabituationSystem {
    fn name(&self) -> &'static str { "NoveltyHabituationSystem" }

    fn run(&self, state: &mut WorldState, dt: f64) {
        for character in state.characters.values_mut() {
            // Count active observations by novelty_key
            let mut novelty_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            for node in character.mind_graph.nodes.values() {
                if node.node_type == NodeType::Observation && node.active {
                    if let Some(ref obs) = node.observation {
                        if let Some(ref key) = obs.novelty_key {
                            *novelty_counts.entry(key.clone()).or_insert(0) += 1;
                        }
                    }
                }
            }

            // For each observation, if its novelty_key has been seen multiple times,
            // decay its strength proportionally
            let obs_ids: Vec<String> = character.mind_graph.nodes.values()
                .filter(|n| n.node_type == NodeType::Observation && n.active)
                .map(|n| n.instance_id.clone())
                .collect();

            for id in obs_ids {
                if let Some(node) = character.mind_graph.nodes.get_mut(&id) {
                    if let Some(ref obs) = node.observation {
                        if let Some(ref key) = obs.novelty_key {
                            let count = novelty_counts.get(key).copied().unwrap_or(0);
                            if count > 1 {
                                // More repetition = faster decay
                                let decay = HABITUATION_DECAY * (count as f64 - 1.0) * dt;
                                node.strength = (node.strength - decay).max(MIN_STRENGTH);
                            }
                        }
                    }
                }
            }
        }
    }
}
