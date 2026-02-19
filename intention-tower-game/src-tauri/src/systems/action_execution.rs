use super::System;
use crate::models::world_state::WorldState;
use crate::models::mind_node::NodeType;
use crate::models::events::WorldEvent;

/// System #20: Executes the selected action's world effects.
/// For innate actions (e.g., salivation), automatic execution when triggered by edges.
/// For voluntary actions, execution when selected by ActionSelectionSystem.
pub struct ActionExecutionSystem;

impl System for ActionExecutionSystem {
    fn name(&self) -> &'static str { "ActionExecutionSystem" }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        for character in state.characters.values_mut() {
            let char_id = character.id.clone();

            // Find innate actions that should fire based on incoming excitatory edges
            let innate_actions: Vec<String> = character.mind_graph.nodes.values()
                .filter(|n| {
                    n.node_type == NodeType::Action
                        && n.action.as_ref().map_or(false, |a| a.innate)
                })
                .map(|n| n.instance_id.clone())
                .collect();

            for action_id in innate_actions {
                // Calculate total excitatory input
                let total_input: f64 = character.mind_graph.edges.values()
                    .filter(|e| e.target_instance_id == action_id)
                    .map(|e| {
                        let source_val = character.mind_graph.nodes.get(&e.source_instance_id)
                            .filter(|s| s.active)
                            .map_or(0.0, |s| s.value);
                        match e.polarity {
                            crate::models::mind_node::Polarity::Excitatory => e.weight * source_val,
                            crate::models::mind_node::Polarity::Inhibitory => -e.weight * source_val,
                        }
                    })
                    .sum();

                // If total input exceeds firing threshold, activate the action
                let threshold = 0.3;
                if let Some(node) = character.mind_graph.nodes.get_mut(&action_id) {
                    let was_active = node.active;
                    node.active = total_input >= threshold;
                    if node.active && !was_active {
                        state.pending_events.push(WorldEvent::NodeActivated {
                            character_id: char_id.clone(),
                            instance_id: action_id.clone(),
                        });
                    } else if !node.active && was_active {
                        state.pending_events.push(WorldEvent::NodeDeactivated {
                            character_id: char_id.clone(),
                            instance_id: action_id.clone(),
                        });
                    }
                }
            }
        }
    }
}
