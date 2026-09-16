use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::{ConflictResolution, NodeType, Polarity};
use crate::models::world_state::WorldState;

/// System #17: Belief-instinct conflict resolution.
/// When a Belief meme has overridesInstinct, it suppresses matching PriorInstinct nodes.
/// Key for: 信仰与意识形态、死要面子活受罪
pub struct BeliefConflictSystem;

impl System for BeliefConflictSystem {
    fn name(&self) -> &'static str {
        "BeliefConflictSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let character_id = character.id.clone();
            let previous: std::collections::HashMap<String, f64> = character
                .mind_graph
                .nodes
                .values()
                .map(|node| (node.instance_id.clone(), node.suppression))
                .collect();
            for node in character.mind_graph.nodes.values_mut() {
                node.suppression = 0.0;
            }

            let health_stress = character
                .mind_graph
                .find_by_schema("it:concept/health")
                .map_or(0.0, |health| 1.0 - health.value);
            let hunger_stress = character
                .mind_graph
                .find_by_schema("it:concept/hunger")
                .map_or(0.0, |hunger| hunger.value);
            let stress = health_stress
                .max(hunger_stress)
                .clamp(0.0, 1.0);
            let overrides: Vec<(Vec<String>, f64)> = character
                .mind_graph
                .nodes
                .values()
                .filter(|n| {
                    n.node_type == NodeType::Meme
                        && n.active
                        && n.meme
                            .as_ref()
                            .map_or(false, |m| m.is_belief && !m.overrides_instinct.is_empty())
                })
                .map(|node| {
                    let meme = node.meme.as_ref().expect("belief checked above");
                    let resolution_pressure = match meme.conflict_resolution {
                        Some(ConflictResolution::BeliefWins) => 0.9,
                        Some(ConflictResolution::InstinctWins) => 0.2,
                        Some(ConflictResolution::StressDependent) => 0.25 + stress * 0.65,
                        None => 0.55,
                    };
                    let conviction = ((node.strength + meme.resilience) * 0.5).clamp(0.0, 1.0);
                    (meme.overrides_instinct.clone(), resolution_pressure * conviction)
                })
                .collect();

            for (target_schemas, pressure) in &overrides {
                for target_schema in target_schemas {
                    for node in character
                        .mind_graph
                        .nodes
                        .values_mut()
                        .filter(|n| {
                            n.node_type == NodeType::PriorInstinct
                                && n.schema_id == *target_schema
                                && n.prior_instinct
                                    .as_ref()
                                    .map_or(false, |pi| pi.overridable_by_meme)
                        })
                    {
                        node.suppression = node.suppression.max(*pressure);
                    }
                }
            }

            // Inhibitory graph edges also resolve belief-vs-belief and
            // evidence-vs-belief conflicts without a special scenario script.
            let inhibitory_edges: Vec<_> = character
                .mind_graph
                .edges
                .values()
                .filter(|edge| edge.polarity == Polarity::Inhibitory)
                .cloned()
                .collect();
            for edge in inhibitory_edges {
                let source = character
                    .mind_graph
                    .nodes
                    .get(&edge.source_instance_id)
                    .cloned();
                let target = character
                    .mind_graph
                    .nodes
                    .get(&edge.target_instance_id)
                    .cloned();
                let (Some(source), Some(target)) = (source, target) else {
                    continue;
                };
                if target.node_type != NodeType::Meme
                    || !target.meme.as_ref().is_some_and(|meme| meme.is_belief)
                {
                    continue;
                }
                let pressure = (edge.weight * source.value * source.effective_strength())
                    .clamp(0.0, 1.0);
                if source.node_type == NodeType::Meme
                    && source.meme.as_ref().is_some_and(|meme| meme.is_belief)
                {
                    let source_score = source.value * source.effective_strength()
                        + source.meme.as_ref().map_or(0.0, |meme| meme.resilience);
                    let target_score = target.value * target.effective_strength()
                        + target.meme.as_ref().map_or(0.0, |meme| meme.resilience);
                    let loser_id = if source_score >= target_score {
                        target.instance_id
                    } else {
                        source.instance_id
                    };
                    if let Some(loser) = character.mind_graph.nodes.get_mut(&loser_id) {
                        loser.suppression = loser.suppression.max(edge.weight.clamp(0.0, 1.0));
                    }
                } else if let Some(target) = character
                    .mind_graph
                    .nodes
                    .get_mut(&target.instance_id)
                {
                    target.suppression = target.suppression.max(pressure);
                }
            }

            for node in character.mind_graph.nodes.values() {
                if (previous.get(&node.instance_id).copied().unwrap_or_default()
                    - node.suppression)
                    .abs()
                    > f64::EPSILON
                {
                    state.pending_events.push(WorldEvent::NodeSuppressionChanged {
                        character_id: character_id.clone(),
                        instance_id: node.instance_id.clone(),
                        suppression: node.suppression,
                    });
                }
            }
        }
    }
}
