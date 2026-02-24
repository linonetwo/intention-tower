use std::sync::Mutex;
use std::ops::Deref;
use tauri::State;
use crate::models::world_state::WorldState;
use crate::models::events::WorldEvent;
use crate::models::commands::{CommandDTO, CommandDef, Precondition, CompareOp};
use crate::systems::runner::SimulationRunner;

/// Shared simulation state managed by Tauri
pub struct SimulationState {
    pub world: Mutex<WorldState>,
    pub runner: SimulationRunner,
}

impl SimulationState {
    pub fn new() -> Self {
        Self {
            world: Mutex::new(WorldState::new(42)),
            runner: SimulationRunner::new(),
        }
    }
}

// ── Tauri Commands ──

/// Load a level by ID, initializing the world state from JSON-LD assets.
#[tauri::command]
pub fn load_level(
    level_id: String,
    sim: State<'_, SimulationState>,
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;

    // Load level data from assets
    let level_data = crate::level_loader::load_level_from_assets(&level_id, &app_handle)
        .map_err(|e| format!("Failed to load level '{}': {}", level_id, e))?;

    *world = level_data;

    // Return the initial state as JSON
    serde_json::to_value(&*world).map_err(|e| e.to_string())
}

/// Get a full snapshot of the world state (for debug/recovery).
#[tauri::command]
pub fn snapshot(sim: State<'_, SimulationState>) -> Result<serde_json::Value, String> {
    let world = sim.world.lock().map_err(|e| e.to_string())?;
    serde_json::to_value(&*world).map_err(|e| e.to_string())
}

/// Advance the simulation by one tick. Returns events (StateDiff).
#[tauri::command]
pub fn tick(dt: f64, sim: State<'_, SimulationState>) -> Result<Vec<WorldEvent>, String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;
    let effective_dt = dt * (world.time_speed as f64);
    let events = sim.runner.tick(&mut world, effective_dt);
    Ok(events)
}

/// Set time speed multiplier (0=pause, 1=normal, 2=2x, 3=4x, 4=8x).
#[tauri::command]
pub fn set_time_speed(speed: u8, sim: State<'_, SimulationState>) -> Result<(), String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;
    world.time_speed = speed.min(4);
    world.paused = speed == 0;
    Ok(())
}

/// List available commands for a given actor targeting a given entity.
#[tauri::command]
pub fn list_commands(
    actor_id: String,
    target_id: Option<String>,
    sim: State<'_, SimulationState>,
) -> Result<Vec<CommandDef>, String> {
    let world = sim.world.lock().map_err(|e| e.to_string())?;

    let available: Vec<CommandDef> = world.command_defs.iter()
        .filter(|cmd_def| {
            cmd_def.preconditions.iter().all(|pre| {
                check_precondition(pre, &actor_id, target_id.as_deref(), &world)
            })
        })
        .cloned()
        .collect();

    Ok(available)
}

/// Execute a command by ID.
#[tauri::command]
pub fn execute_command(
    command_id: String,
    actor_id: String,
    target_id: Option<String>,
    sim: State<'_, SimulationState>,
) -> Result<Vec<WorldEvent>, String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;

    // Find the command definition
    let cmd_def = world.command_defs.iter()
        .find(|c| c.command_id == command_id)
        .cloned()
        .ok_or_else(|| format!("Command '{}' not found", command_id))?;

    // Check preconditions
    for pre in &cmd_def.preconditions {
        if !check_precondition(pre, &actor_id, target_id.as_deref(), &world) {
            return Err(format!("Precondition not met for command '{}'", command_id));
        }
    }

    // Queue the command for CommandSystem to process
    let dto = CommandDTO {
        command_id: command_id.clone(),
        actor_id: actor_id.clone(),
        target_id: target_id.clone(),
        effects: cmd_def.effect_templates.clone(),
    };
    world.pending_commands.push(dto);

    // Run one tick to process the command immediately
    let events = sim.runner.tick(&mut world, 0.0);
    Ok(events)
}

/// Get a specific character's mind graph.
#[tauri::command]
pub fn get_mind_graph(
    character_id: String,
    sim: State<'_, SimulationState>,
) -> Result<serde_json::Value, String> {
    let world = sim.world.lock().map_err(|e| e.to_string())?;
    let character = world.characters.get(&character_id)
        .ok_or_else(|| format!("Character '{}' not found", character_id))?;
    serde_json::to_value(&character.mind_graph).map_err(|e| e.to_string())
}

/// Pause/unpause the simulation.
#[tauri::command]
pub fn set_paused(paused: bool, sim: State<'_, SimulationState>) -> Result<(), String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;
    world.paused = paused;
    Ok(())
}

// ── Precondition Checker ──

/// Public wrapper for precondition checking (used by test_server).
pub fn check_precondition_pub(
    pre: &Precondition,
    actor_id: &str,
    target_id: Option<&str>,
    world: &WorldState,
) -> bool {
    check_precondition(pre, actor_id, target_id, world)
}

fn check_precondition(
    pre: &Precondition,
    actor_id: &str,
    target_id: Option<&str>,
    world: &WorldState,
) -> bool {
    match pre {
        Precondition::EnvHasItem { item_schema_id } => {
            world.items.values().any(|i| {
                i.schema_type == *item_schema_id
                    || i.abstract_type.as_deref() == Some(item_schema_id.as_str())
            })
        }
        Precondition::TargetHasNode { schema_id } => {
            target_id.and_then(|tid| world.characters.get(tid))
                .map_or(false, |c| c.mind_graph.find_by_schema(schema_id).is_some())
        }
        Precondition::TargetNodeActive { schema_id } => {
            target_id.and_then(|tid| world.characters.get(tid))
                .and_then(|c| c.mind_graph.find_by_schema(schema_id))
                .map_or(false, |n| n.active)
        }
        Precondition::TargetNodeValue { schema_id, op, threshold } => {
            target_id.and_then(|tid| world.characters.get(tid))
                .and_then(|c| c.mind_graph.find_by_schema(schema_id))
                .map_or(false, |n| op.evaluate(n.value, *threshold))
        }
        Precondition::ActorResource { resource_schema_id, op, threshold } => {
            world.characters.get(actor_id)
                .map_or(false, |c| {
                    let val = c.mind_graph.resource_value(resource_schema_id);
                    op.evaluate(val, *threshold)
                })
        }
        Precondition::IsVirtualContext { value } => {
            world.in_virtual_context == *value
        }
    }
}
