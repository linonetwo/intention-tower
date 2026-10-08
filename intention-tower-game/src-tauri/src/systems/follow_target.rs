use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// Opt-in, distance-driven attachment. It runs before attention so the motor
/// response must receive this tick's real allocation, like any other action.
pub struct ImprintingDriveSystem;

impl System for ImprintingDriveSystem {
    fn name(&self) -> &'static str {
        "ImprintingDriveSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let mut drives = Vec::new();
        for character in state.characters.values() {
            for node in character
                .mind_graph
                .nodes
                .values()
                .filter(|n| n.node_type == NodeType::Motivation)
            {
                let Some(motivation) = &node.motivation else {
                    continue;
                };
                let (Some(config), Some(evidence), Some(target)) = (
                    &motivation.imprinting,
                    &motivation.imprinting_evidence,
                    &motivation.target_entity,
                ) else {
                    continue;
                };
                if evidence.target_entity != *target {
                    continue;
                }
                let Some(position) = state.entity_position(target) else {
                    continue;
                };
                let distance =
                    (character.position.x - position.x).hypot(character.position.y - position.y);
                let radius = config.comfort_radius.max(32.0);
                let drive = ((distance - radius) / radius).clamp(0.0, 1.0);
                drives.push((
                    character.id.clone(),
                    node.instance_id.clone(),
                    config.clone(),
                    distance,
                    drive,
                ));
            }
        }
        drives.sort_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
        for (id, motivation_id, config, distance, drive) in drives {
            let character = state.characters.get_mut(&id).expect("collected character");
            let graph = &mut character.mind_graph;
            if let Some(node) = graph.nodes.get_mut(&motivation_id) {
                if let Some(evidence) = node
                    .motivation
                    .as_mut()
                    .and_then(|m| m.imprinting_evidence.as_mut())
                {
                    evidence.max_separation_distance =
                        evidence.max_separation_distance.max(distance);
                }
            }
            let action_ids: Vec<_> = graph
                .nodes
                .values()
                .filter(|node| {
                    node.node_type == NodeType::Action
                        && node.schema_id == config.follow_action_schema
                        && node.action.as_ref().is_some_and(|action| action.innate)
                })
                .map(|node| node.instance_id.clone())
                .collect();
            let mut updates = vec![(motivation_id.clone(), drive, true)];
            for action_id in action_ids {
                let input: f64 = graph
                    .edges
                    .values()
                    .filter(|edge| {
                        edge.source_instance_id == motivation_id
                            && edge.target_instance_id == action_id
                            && edge.polarity == crate::models::mind_node::Polarity::Excitatory
                    })
                    .map(|edge| edge.weight * drive)
                    .sum();
                updates.push((action_id, input.clamp(0.0, 1.0), input >= 0.3));
            }
            updates.extend(
                graph
                    .nodes
                    .values()
                    .filter(|node| {
                        node.node_type == NodeType::PriorInstinct
                            && node.schema_id == config.separation_instinct_schema
                    })
                    .map(|node| (node.instance_id.clone(), drive, drive > 0.0)),
            );
            for (node_id, value, active) in updates {
                let node = graph.nodes.get_mut(&node_id).expect("collected node");
                if (node.value - value).abs() > 1e-8 {
                    state.pending_events.push(WorldEvent::NodeValueChanged {
                        character_id: id.clone(),
                        instance_id: node_id.clone(),
                        old_value: node.value,
                        new_value: value,
                    });
                }
                if node.active != active {
                    state.pending_events.push(if active {
                        WorldEvent::NodeActivated {
                            character_id: id.clone(),
                            instance_id: node_id.clone(),
                        }
                    } else {
                        WorldEvent::NodeDeactivated {
                            character_id: id.clone(),
                            instance_id: node_id.clone(),
                        }
                    });
                }
                node.value = value;
                node.active = active;
            }
        }
    }
}

/// Executed following uses the same collision/bounds rules as player movement.
/// Evidence records only actual reduction in distance, never desired motion.
pub struct FollowTargetSystem;

impl System for FollowTargetSystem {
    fn name(&self) -> &'static str {
        "FollowTargetSystem"
    }

    fn run(&self, state: &mut WorldState, dt: f64) {
        if !dt.is_finite() || dt <= 0.0 {
            return;
        }
        let mut follows = Vec::new();
        for character in state.characters.values() {
            for node in character.mind_graph.nodes.values().filter(|node| {
                node.node_type == NodeType::Motivation && node.active && node.attended
            }) {
                let Some(motivation) = &node.motivation else {
                    continue;
                };
                let (Some(config), Some(evidence), Some(target)) = (
                    &motivation.imprinting,
                    &motivation.imprinting_evidence,
                    &motivation.target_entity,
                ) else {
                    continue;
                };
                if evidence.target_entity != *target {
                    continue;
                }
                let follows_target = character.mind_graph.nodes.values().any(|action| {
                    action.node_type == NodeType::Action
                        && action.schema_id == config.follow_action_schema
                        && action.active
                        && action.attended
                        && action
                            .action
                            .as_ref()
                            .is_some_and(|data| data.innate || data.selected)
                        && character.mind_graph.edges.values().any(|edge| {
                            edge.source_instance_id == node.instance_id
                                && edge.target_instance_id == action.instance_id
                                && edge.weight > 0.0
                                && edge.polarity == crate::models::mind_node::Polarity::Excitatory
                        })
                });
                if follows_target {
                    follows.push((
                        character.id.clone(),
                        node.instance_id.clone(),
                        target.clone(),
                        config.clone(),
                    ));
                }
            }
        }
        follows.sort_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
        let mut moved = std::collections::HashSet::new();
        for (id, motivation_id, target, config) in follows {
            if moved.contains(&id) {
                continue;
            }
            let Some(position) = state.entity_position(&target) else {
                continue;
            };
            let character = &state.characters[&id];
            let dx = position.x - character.position.x;
            let dy = position.y - character.position.y;
            // Ground following cannot fly between floors. A connector must be
            // traversed explicitly before horizontal following can resume.
            if dy.abs() > 1e-8 {
                continue;
            }
            let before = dx.hypot(dy);
            let step = (config.follow_speed.max(0.0) * dt)
                .min((before - config.comfort_radius.max(32.0)).max(0.0))
                .min(40.0);
            if before <= 0.0 || step <= 0.0 {
                continue;
            }
            let Ok(event) =
                crate::movement::move_character_in_tick(state, &id, dx / before * step, 0.0)
            else {
                continue;
            };
            let character = state.characters.get_mut(&id).expect("collected character");
            let after =
                (position.x - character.position.x).hypot(position.y - character.position.y);
            let reduction = before - after;
            if reduction <= 1e-8 {
                continue;
            }
            if let Some(evidence) = character
                .mind_graph
                .nodes
                .get_mut(&motivation_id)
                .and_then(|node| node.motivation.as_mut())
                .and_then(|motivation| motivation.imprinting_evidence.as_mut())
            {
                evidence.followed_distance += reduction;
                evidence.follow_ticks += 1;
            }
            state.pending_events.push(event);
            moved.insert(id);
        }
    }
}
