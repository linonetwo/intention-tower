use crate::models::events::WorldEvent;
use crate::models::progress::LevelStatus;
use crate::models::world_state::WorldState;

const MAX_STEP: f64 = 40.0;
const WORLD_MAX_X: f64 = 800.0;
const WORLD_MAX_Y: f64 = 600.0;
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
    if world.progress.status != LevelStatus::InProgress {
        return Err("the level is already complete".to_owned());
    }
    if !delta_x.is_finite() || !delta_y.is_finite() {
        return Err("movement delta must be finite".to_owned());
    }

    let current = world
        .characters
        .get(character_id)
        .ok_or_else(|| format!("character '{character_id}' not found"))?
        .position
        .clone();
    let magnitude = delta_x.hypot(delta_y);
    let scale = if magnitude > MAX_STEP {
        MAX_STEP / magnitude
    } else {
        1.0
    };
    let to_x = (current.x + delta_x * scale).clamp(0.0, WORLD_MAX_X);
    let to_y = (current.y + delta_y * scale).clamp(0.0, WORLD_MAX_Y);

    let hits_character = world.characters.values().any(|other| {
        other.id != character_id
            && (other.position.x - to_x).hypot(other.position.y - to_y) < CHARACTER_CLEARANCE
    });
    let hits_item = world
        .items
        .values()
        .any(|item| (item.position.x - to_x).hypot(item.position.y - to_y) < ITEM_CLEARANCE);
    if hits_character || hits_item {
        return Err("movement blocked by another entity".to_owned());
    }

    let character = world
        .characters
        .get_mut(character_id)
        .expect("character existence checked above");
    character.position.x = to_x;
    character.position.y = to_y;
    let event = WorldEvent::CharacterMoved {
        character_id: character_id.to_owned(),
        from_x: current.x,
        from_y: current.y,
        to_x,
        to_y,
    };
    // Movement happens outside the simulation tick and is returned directly
    // by the API, so record it in history without re-emitting it next tick.
    world.event_log.push(event.clone());
    Ok(event)
}
