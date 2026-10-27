use crate::models::events::WorldEvent;
use crate::models::progress::LevelStatus;
use crate::models::scene::CharacterPosture;
use crate::models::world_state::WorldState;

const MAX_STEP: f64 = 40.0;
const CHARACTER_CLEARANCE: f64 = 32.0;
const ITEM_CLEARANCE: f64 = 20.0;

/// Move one character in the authoritative world. The operation is shared by
/// Tauri, browser MCP, keyboard, and touch controls so every platform observes
/// identical bounds and collision rules.
pub fn move_character(
    world: &mut WorldState,
    character_id: &str,
    delta_x: f64,
    delta_y: f64,
) -> Result<WorldEvent, String> {
    move_character_impl(world, character_id, delta_x, delta_y, true)
}

/// Simulation callers emit the returned event through the tick event pipeline.
pub(crate) fn move_character_in_tick(
    world: &mut WorldState,
    character_id: &str,
    delta_x: f64,
    delta_y: f64,
) -> Result<WorldEvent, String> {
    move_character_impl(world, character_id, delta_x, delta_y, false)
}

fn move_character_impl(
    world: &mut WorldState,
    character_id: &str,
    delta_x: f64,
    delta_y: f64,
    record_history: bool,
) -> Result<WorldEvent, String> {
    if world.progress.status != LevelStatus::InProgress {
        return Err("the level is already complete".to_owned());
    }
    if !delta_x.is_finite() || !delta_y.is_finite() {
        return Err("movement delta must be finite".to_owned());
    }
    if delta_y != 0.0 {
        return Err("vertical movement requires a stairs or ladder connector".into());
    }

    let current = world
        .characters
        .get(character_id)
        .ok_or_else(|| format!("character '{character_id}' not found"))?
        .position
        .clone();
    let current_room = world
        .entity_room(character_id)
        .ok_or("character room missing")?
        .to_owned();
    let platform = world
        .scene
        .support_in_room(current.x, current.y, &current_room)
        .ok_or("character is not supported by a platform")?;
    let desired = current.x + delta_x.clamp(-MAX_STEP, MAX_STEP);
    let mut destination_room = current_room.clone();
    let mut destination_platform = platform;
    if desired < platform.x_min || desired > platform.x_max {
        for portal in &world.scene.portals {
            let destination =
                if portal.from_room == current_room && portal.from_platform == platform.id {
                    Some((&portal.to_room, &portal.to_platform))
                } else if portal.to_room == current_room && portal.to_platform == platform.id {
                    Some((&portal.from_room, &portal.from_platform))
                } else {
                    None
                };
            if let Some((room, id)) = destination {
                let target = world
                    .scene
                    .platforms
                    .iter()
                    .find(|p| &p.id == id)
                    .ok_or("portal platform missing")?;
                if desired >= target.x_min && desired <= target.x_max {
                    destination_room = room.clone();
                    destination_platform = target;
                    break;
                }
            }
        }
    }
    let to_x = desired.clamp(destination_platform.x_min, destination_platform.x_max);
    let to_y = platform.y;

    let hits_character = world.characters.values().any(|other| {
        other.id != character_id
            && !world.scene.non_blocking_characters.contains(&other.id)
            && world.entity_room(&other.id) == Some(destination_room.as_str())
            && (other.position.x - to_x).hypot(other.position.y - to_y) < CHARACTER_CLEARANCE
    });
    let hits_item = world.items.values().any(|item| {
        world.entity_room(&item.id) == Some(destination_room.as_str())
            && (item.position.x - to_x).hypot(item.position.y - to_y) < ITEM_CLEARANCE
    });
    if hits_character || hits_item {
        return Err("movement blocked by another entity".to_owned());
    }

    let character = world
        .characters
        .get_mut(character_id)
        .expect("character existence checked above");
    character.position.x = to_x;
    character.position.y = to_y;
    world
        .character_rooms
        .insert(character_id.to_owned(), destination_room.clone());
    crate::room_memory::crossed(
        world,
        character_id,
        &current_room,
        &destination_room,
        record_history,
    );
    // Walking automatically stands the character up; sitting is never a way
    // to glide along a platform.
    if to_x != current.x {
        world
            .character_postures
            .insert(character_id.to_owned(), CharacterPosture::Standing);
    }
    let event = WorldEvent::CharacterMoved {
        character_id: character_id.to_owned(),
        from_x: current.x,
        from_y: current.y,
        to_x,
        to_y,
    };
    // Movement happens outside the simulation tick and is returned directly
    // by the API, so record it in history without re-emitting it next tick.
    if record_history {
        world.event_log.push(event.clone());
    }
    Ok(event)
}

pub fn set_character_posture(
    world: &mut WorldState,
    character_id: &str,
    posture: CharacterPosture,
) -> Result<(), String> {
    if world.progress.status != LevelStatus::InProgress {
        return Err("the level is already complete".into());
    }
    if !world.characters.contains_key(character_id) {
        return Err(format!("character '{character_id}' not found"));
    }
    world
        .character_postures
        .insert(character_id.to_owned(), posture);
    Ok(())
}

/// Traverse only from a connector endpoint on the current supporting floor.
/// This explicit operation cannot teleport from elsewhere in the scene.
pub fn traverse_connector(
    world: &mut WorldState,
    character_id: &str,
    connector_id: &str,
) -> Result<WorldEvent, String> {
    if world.progress.status != LevelStatus::InProgress {
        return Err("the level is already complete".into());
    }
    let current = world
        .characters
        .get(character_id)
        .ok_or("character not found")?
        .position
        .clone();
    let room = world
        .entity_room(character_id)
        .ok_or("character room missing")?
        .to_owned();
    let platform = world
        .scene
        .support_in_room(current.x, current.y, &room)
        .ok_or("character is not on a platform")?;
    let connector = world
        .scene
        .connectors
        .iter()
        .find(|c| c.id == connector_id)
        .ok_or("connector not found")?;
    let (start_x, destination, to_x) = if platform.id == connector.from_platform {
        (connector.from_x, &connector.to_platform, connector.to_x)
    } else if platform.id == connector.to_platform {
        (connector.to_x, &connector.from_platform, connector.from_x)
    } else {
        return Err("connector does not connect this platform".into());
    };
    if (current.x - start_x).abs() > 20.0 {
        return Err("walk to the connector endpoint first".into());
    }
    let target = world
        .scene
        .platforms
        .iter()
        .find(|p| &p.id == destination)
        .ok_or("destination platform missing")?;
    if world.scene.platform_room(&target.id) != room {
        return Err("connector leaves room".into());
    }
    if world.characters.values().any(|c| {
        c.id != character_id
            && !world.scene.non_blocking_characters.contains(&c.id)
            && world.entity_room(&c.id) == Some(room.as_str())
            && (c.position.x - to_x).hypot(c.position.y - target.y) < CHARACTER_CLEARANCE
    }) || world.items.values().any(|i| {
        world.entity_room(&i.id) == Some(room.as_str())
            && (i.position.x - to_x).hypot(i.position.y - target.y) < ITEM_CLEARANCE
    }) {
        return Err("connector exit blocked".into());
    }
    let to_y = target.y;
    let character = world
        .characters
        .get_mut(character_id)
        .expect("checked character");
    character.position.x = to_x;
    character.position.y = to_y;
    world
        .character_postures
        .insert(character_id.to_owned(), CharacterPosture::Standing);
    let event = WorldEvent::CharacterMoved {
        character_id: character_id.into(),
        from_x: current.x,
        from_y: current.y,
        to_x,
        to_y,
    };
    world.event_log.push(event.clone());
    Ok(event)
}
