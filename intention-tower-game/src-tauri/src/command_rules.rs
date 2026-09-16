use crate::models::commands::{CommandDef, Precondition, TargetingMode};
use crate::models::progress::LevelStatus;
use crate::models::world_state::WorldState;

/// Platform-independent command availability rules shared by Tauri and MCP.
pub fn check_precondition(
    precondition: &Precondition,
    actor_id: &str,
    target_id: Option<&str>,
    world: &WorldState,
) -> bool {
    match precondition {
        Precondition::EnvHasItem { item_schema_id } => world.items.values().any(|item| {
            item.schema_type == *item_schema_id
                || item.abstract_type.as_deref() == Some(item_schema_id.as_str())
        }),
        Precondition::TargetHasNode { schema_id } => target_id
            .and_then(|id| world.characters.get(id))
            .is_some_and(|character| character.mind_graph.find_by_schema(schema_id).is_some()),
        Precondition::TargetNodeActive { schema_id } => target_id
            .and_then(|id| world.characters.get(id))
            .and_then(|character| character.mind_graph.find_by_schema(schema_id))
            .is_some_and(|node| node.active),
        Precondition::TargetNodeValue {
            schema_id,
            op,
            threshold,
        } => target_id
            .and_then(|id| world.characters.get(id))
            .and_then(|character| character.mind_graph.find_by_schema(schema_id))
            .is_some_and(|node| op.evaluate(node.value, *threshold)),
        Precondition::ActorResource {
            resource_schema_id,
            op,
            threshold,
        } => world.characters.get(actor_id).is_some_and(|character| {
            op.evaluate(
                character.mind_graph.resource_value(resource_schema_id),
                *threshold,
            )
        }),
        Precondition::IsVirtualContext { value } => world.in_virtual_context == *value,
    }
}

pub fn command_available(
    command: &CommandDef,
    actor_id: &str,
    target_id: Option<&str>,
    world: &WorldState,
) -> bool {
    if world.progress.status != LevelStatus::InProgress || !world.characters.contains_key(actor_id)
    {
        return false;
    }
    if command.targeting == TargetingMode::RequiresTarget
        && !target_id.is_some_and(|id| world.characters.contains_key(id))
    {
        return false;
    }
    if target_id.is_some_and(|id| !world.characters.contains_key(id)) {
        return false;
    }
    command
        .preconditions
        .iter()
        .all(|precondition| check_precondition(precondition, actor_id, target_id, world))
}
