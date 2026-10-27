#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LayeredMigrationReceipt {
    pub level_id: String,
    pub migrated_at_tick: u64,
    pub legacy_in_virtual_context: bool,
    pub legacy_virtual_context_stack: Vec<String>,
    pub legacy_progress: crate::models::progress::LevelProgress,
    pub message_key: String,
}

/// Validate before using an untrusted snapshot's level ID in asset lookup paths.
pub fn validate_level_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
    {
        return Err("invalid saved level ID".into());
    }
    Ok(())
}

/// Both restore callers resolve authoring with their existing asset resolver.
/// No snapshot-controlled paths are opened by this shared transformation.
pub fn prepare_restored_world_with_authoring(
    saved: crate::models::world_state::WorldState,
    authored: Option<crate::models::world_state::WorldState>,
) -> Result<crate::models::world_state::WorldState, String> {
    let Some(mut fresh) = authored else {
        return prepare_restored_world(saved);
    };
    validate_level_id(&saved.level_id)?;
    if fresh.level_id != saved.level_id {
        return Err("saved level differs from authored lookup".into());
    }
    if fresh.scene.layered_world.is_none() || saved.scene.layered_world.is_some() {
        return prepare_restored_world(saved);
    }
    saved.scene.validate()?;
    if !saved.layered_world.is_empty() || saved.layered_world_migration.is_some() {
        return Err("legacy snapshot contains unexpected layered evidence".into());
    }
    if saved.character_rooms.iter().any(|(id, room)| {
        !saved.characters.contains_key(id)
            || !(saved.scene.rooms.is_empty() && room == "main"
                || saved.scene.rooms.iter().any(|r| &r.id == room))
    }) || saved.item_rooms.iter().any(|(id, room)| {
        !saved.items.contains_key(id)
            || !(saved.scene.rooms.is_empty() && room == "main"
                || saved.scene.rooms.iter().any(|r| &r.id == room))
    }) || saved
        .virtual_context_stack
        .iter()
        .any(|id| id.trim().is_empty())
    {
        return Err("legacy snapshot has invalid entity-room or stack references".into());
    }
    if saved.characters.values().any(|c| {
        !c.position.x.is_finite()
            || !c.position.y.is_finite()
            || c.mind_graph.nodes.values().any(|n| {
                n.created_at > saved.tick || !n.value.is_finite() || !n.strength.is_finite()
            })
    }) || saved
        .progress
        .completed_at_tick
        .is_some_and(|t| t > saved.tick)
        || saved
            .progress
            .objectives
            .iter()
            .any(|o| o.completed_at_tick.is_some_and(|t| t > saved.tick))
    {
        return Err("legacy snapshot has invalid positions or timestamps".into());
    }
    let receipt = LayeredMigrationReceipt {
        level_id: saved.level_id.clone(),
        migrated_at_tick: saved.tick,
        legacy_in_virtual_context: saved.in_virtual_context,
        legacy_virtual_context_stack: saved.virtual_context_stack.clone(),
        legacy_progress: saved.progress.clone(),
        message_key: "layer.migration.legacy-reset".into(),
    };
    let config = fresh.scene.layered_world.as_ref().unwrap();
    if config
        .actor_ids
        .iter()
        .any(|id| !saved.characters.contains_key(id))
    {
        return Err("legacy snapshot is missing a configured actor".into());
    }
    for (id, character) in &mut fresh.characters {
        if let Some(old) = saved.characters.get(id) {
            let authored_mind = character.mind_graph.clone();
            character.mind_graph = old.mind_graph.clone();
            for (node_id, node) in authored_mind.nodes {
                if character
                    .mind_graph
                    .nodes
                    .values()
                    .any(|n| n.schema_id == node.schema_id)
                {
                    continue;
                }
                if character.mind_graph.nodes.contains_key(&node_id) {
                    return Err("legacy mind collides with required authored node".into());
                }
                character.mind_graph.nodes.insert(node_id, node);
            }
        }
    }
    fresh.tick = saved.tick;
    fresh.seed = saved.seed;
    fresh.paused = saved.paused;
    fresh.time_speed = saved.time_speed;
    fresh.event_log = saved.event_log;
    fresh.pending_commands.clear();
    fresh.pending_events.clear();
    for state in fresh.layered_world.values_mut() {
        state.legacy_in_virtual_context = receipt.legacy_in_virtual_context;
        state.legacy_virtual_context_stack = receipt.legacy_virtual_context_stack.clone();
    }
    if let Some(actor) = fresh.default_actor_id.as_ref() {
        fresh
            .event_log
            .push(crate::models::events::WorldEvent::LayeredWorldChanged {
                actor_id: actor.clone(),
                context_id: config.contexts[0].id.clone(),
                depth: 0,
                kind: "migrated".into(),
                fact: Some(serde_json::to_value(&receipt).map_err(|e| e.to_string())?),
            });
    }
    fresh.layered_world_migration = Some(receipt);
    prepare_restored_world(fresh)
}

/// Shared desktop/MCP restore boundary. Missing optional legacy memory state
/// can observe the actor's current room, but never invents historical receipts.
/// This checks structural consistency, not authenticity against whole-save editing.
pub fn prepare_restored_world(
    mut world: crate::models::world_state::WorldState,
) -> Result<crate::models::world_state::WorldState, String> {
    world.scene.validate()?;
    if let Some(receipt) = &world.layered_world_migration {
        if world.scene.layered_world.is_none()
            || receipt.level_id != world.level_id
            || receipt.migrated_at_tick > world.tick
            || receipt.message_key != "layer.migration.legacy-reset"
            || receipt
                .legacy_progress
                .completed_at_tick
                .is_some_and(|t| t > receipt.migrated_at_tick)
            || receipt.legacy_progress.objectives.iter().any(|o| {
                o.completed_at_tick
                    .is_some_and(|t| t > receipt.migrated_at_tick)
            })
        {
            return Err("invalid layered migration receipt".into());
        }
    }
    crate::layered_world::validate_world(&world)?;
    crate::models::scene::normalize_positions(&mut world);
    crate::room_memory::validate_world(&world)?;
    crate::layered_world::initialize(&mut world);
    crate::layered_world::validate_world(&world)?;
    crate::room_memory::initialize(&mut world);
    crate::room_memory::validate_world(&world)?;
    Ok(world)
}

/// Validate a user-visible save slot before it is used as a filesystem name.
/// The same grammar is mirrored by the browser adapter for platform parity.
pub fn validate_save_slot(slot: &str) -> Result<(), String> {
    if slot.is_empty() || slot.len() > 64 {
        return Err("save slot must contain 1 to 64 characters".to_owned());
    }
    if !slot
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("save slot may only contain letters, numbers, '-' and '_'".to_owned());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_save_slot;

    #[test]
    fn rejects_path_traversal_and_accepts_portable_names() {
        assert!(validate_save_slot("pavlov-tick42").is_ok());
        assert!(validate_save_slot("slot_01").is_ok());
        assert!(validate_save_slot("../escape").is_err());
        assert!(validate_save_slot("a/b").is_err());
        assert!(validate_save_slot("").is_err());
    }
}
