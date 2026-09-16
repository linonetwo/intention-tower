use super::System;
use crate::models::events::WorldEvent;
use crate::models::mind_node::NodeType;
use crate::models::world_state::WorldState;

/// System #5: NPC autonomous actions, environmental changes, group aggregation.
/// Generates WorldEvents for PerceptionSystem to convert into Observations.
/// Relevant for: 人从众、浪潮实验、毁灭虫族主脑
pub struct EnvironmentEventSystem;

impl System for EnvironmentEventSystem {
    fn name(&self) -> &'static str {
        "EnvironmentEventSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        // Active, committed actions become public signals on a restrained cadence.
        // PerceptionSystem turns these objective-world signals into each nearby
        // character's subjective observation, enabling emergent social feedback.
        if state.tick % 5 != 0 {
            return;
        }
        let emitted: Vec<WorldEvent> = state
            .characters
            .values()
            .flat_map(|character| {
                character
                    .mind_graph
                    .nodes
                    .values()
                    .filter(|node| {
                        node.node_type == NodeType::Action
                            && node.active
                            && node.value >= 0.5
                            && node
                                .action
                                .as_ref()
                                .is_some_and(|action| action.innate || action.selected)
                    })
                    .map(|node| WorldEvent::SoundEmitted {
                        source_entity_id: character.id.clone(),
                        about: node.schema_id.clone(),
                        modality: "Social".to_string(),
                    })
            })
            .collect();
        state.pending_events.extend(emitted);
    }
}
