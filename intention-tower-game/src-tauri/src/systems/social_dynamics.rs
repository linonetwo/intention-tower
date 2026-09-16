use std::collections::{BTreeMap, HashMap};

use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::social::SocialGroupState;
use crate::models::world_state::WorldState;

/// Cross-character group aggregation: identity membership, cohesion, and the
/// currently selected collective action. This deliberately derives from normal
/// mind nodes, preserving one cognitive model instead of a parallel hard-coded
/// faction model.
pub struct SocialDynamicsSystem;

impl System for SocialDynamicsSystem {
    fn name(&self) -> &'static str {
        "SocialDynamicsSystem"
    }

    fn run(&self, state: &mut WorldState, dt: f64) {
        let mut memberships: BTreeMap<String, Vec<(String, f64)>> = BTreeMap::new();
        let mut selected_actions: HashMap<String, String> = HashMap::new();

        for character in state.characters.values() {
            for node in character.mind_graph.nodes.values() {
                if node.node_type == NodeType::Meme && node.active {
                    if let Some(group_id) = node
                        .meme
                        .as_ref()
                        .filter(|meme| meme.is_identity)
                        .and_then(|meme| meme.group_id.as_ref())
                    {
                        memberships
                            .entry(group_id.clone())
                            .or_default()
                            .push((character.id.clone(), node.effective_strength()));
                    }
                }
                if node.node_type == NodeType::Action
                    && node.active
                    && node
                        .action
                        .as_ref()
                        .is_some_and(|action| action.selected)
                {
                    selected_actions.insert(character.id.clone(), node.schema_id.clone());
                }
            }
        }

        let previous = std::mem::take(&mut state.social_groups);
        let mut next = HashMap::new();
        for (group_id, mut members_with_strength) in memberships {
            members_with_strength.sort_by(|a, b| a.0.cmp(&b.0));
            members_with_strength.dedup_by(|a, b| a.0 == b.0);
            let members: Vec<String> = members_with_strength
                .iter()
                .map(|(member, _)| member.clone())
                .collect();
            let group_bonus = if members.len() > 1 {
                0.005 * (members.len() - 1).min(4) as f64 * dt.clamp(0.0, 2.0)
            } else {
                0.0
            };

            if group_bonus > 0.0 {
                for member_id in &members {
                    if let Some(character) = state.characters.get_mut(member_id) {
                        for node in character.mind_graph.nodes.values_mut() {
                            if node.node_type == NodeType::Meme
                                && node.active
                                && node.meme.as_ref().is_some_and(|meme| {
                                    meme.is_identity
                                        && meme.group_id.as_deref() == Some(group_id.as_str())
                                })
                            {
                                node.strength = (node.strength + group_bonus).min(1.0);
                            }
                        }
                    }
                }
            }

            let cohesion = if members_with_strength.is_empty() {
                0.0
            } else {
                (members_with_strength
                    .iter()
                    .map(|(_, strength)| strength)
                    .sum::<f64>()
                    / members_with_strength.len() as f64
                    + group_bonus)
                    .clamp(0.0, 1.0)
            };
            let mut action_counts: BTreeMap<String, usize> = BTreeMap::new();
            for member in &members {
                if let Some(action) = selected_actions.get(member) {
                    *action_counts.entry(action.clone()).or_default() += 1;
                }
            }
            let consensus_action = action_counts
                .into_iter()
                .max_by(|(action_a, count_a), (action_b, count_b)| {
                    count_a.cmp(count_b).then_with(|| action_b.cmp(action_a))
                })
                .map(|(action, _)| action);
            let group = SocialGroupState {
                group_id: group_id.clone(),
                members,
                cohesion,
                consensus_action,
            };

            let changed = previous.get(&group_id).is_none_or(|old| {
                old.members != group.members
                    || old.consensus_action != group.consensus_action
                    || (old.cohesion - group.cohesion).abs() >= 0.01
            });
            if changed {
                state.pending_events.push(WorldEvent::SocialGroupUpdated {
                    group_id: group_id.clone(),
                    member_count: group.members.len().min(u32::MAX as usize) as u32,
                    cohesion: group.cohesion,
                    consensus_action: group.consensus_action.clone(),
                });
            }
            next.insert(group_id, group);
        }
        state.social_groups = next;
    }
}
