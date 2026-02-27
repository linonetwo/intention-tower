use std::sync::Mutex;
use std::ops::Deref;
use tauri::State;
use tauri::Manager;
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
    world.level_id = level_id;

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
    // dt is already scaled by the frontend (0.5 * speed), do NOT multiply by time_speed again
    let events = sim.runner.tick(&mut world, dt);
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

    // If paused, just queue — the command will execute on next step_tick / unpause.
    // If running, process immediately with a zero-dt tick.
    if world.paused {
        Ok(vec![])
    } else {
        let events = sim.runner.tick(&mut world, 0.0);
        Ok(events)
    }
}

/// Advance exactly one tick regardless of pause state. Used by the single-step button.
/// Restores the paused state after the tick so the game remains paused.
#[tauri::command]
pub fn step_tick(sim: State<'_, SimulationState>) -> Result<Vec<WorldEvent>, String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;
    let was_paused = world.paused;
    let saved_speed = world.time_speed;
    // Temporarily unpause with speed 1 for exactly one tick
    world.paused = false;
    if world.time_speed == 0 {
        world.time_speed = 1;
    }
    let effective_dt = 0.5 * world.time_speed as f64;
    let events = sim.runner.tick(&mut world, effective_dt);
    // Restore pause state
    world.paused = was_paused;
    world.time_speed = saved_speed;
    Ok(events)
}

/// Cancel a queued pending command by command_id.
/// Used when the player clicks a queued command button to dequeue it.
#[tauri::command]
pub fn cancel_pending_command(
    command_id: String,
    sim: State<'_, SimulationState>,
) -> Result<(), String> {
    let mut world = sim.world.lock().map_err(|e| e.to_string())?;
    if let Some(pos) = world.pending_commands.iter().position(|c| c.command_id == command_id) {
        world.pending_commands.remove(pos);
    }
    Ok(())
}

/// Get the mind graph for a specific character.
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

// ── Save / Load System ──

/// Get the saves directory path (creates if not exists).
fn saves_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = if cfg!(debug_assertions) {
        // Dev mode: keep saves in the project's userData-Dev/ folder so they're
        // easy to inspect and reset during development.
        std::path::PathBuf::from("userData-Dev").join("saves")
    } else {
        app.path().app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?
            .join("saves")
    };
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create saves dir: {}", e))?;
    }
    Ok(dir)
}

/// Save metadata returned to frontend
#[derive(serde::Serialize, Clone)]
pub struct SaveMeta {
    pub slot: String,
    pub level_id: String,
    pub tick: u64,
    pub timestamp: String,
}

/// Save current world state to a named slot.
#[tauri::command]
pub fn save_game(
    slot: String,
    sim: State<'_, SimulationState>,
    app_handle: tauri::AppHandle,
) -> Result<SaveMeta, String> {
    let world = sim.world.lock().map_err(|e| e.to_string())?;
    let dir = saves_dir(&app_handle)?;
    let file_path = dir.join(format!("{}.json", slot));

    let json = serde_json::to_string_pretty(&*world)
        .map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(&file_path, &json)
        .map_err(|e| format!("Write error: {}", e))?;

    // Extract level_id reliably from world state
    let level_id = if world.level_id.is_empty() { "unknown".to_string() } else { world.level_id.clone() };

    Ok(SaveMeta {
        slot: slot.clone(),
        level_id,
        tick: world.tick,
        timestamp: chrono_now(),
    })
}

/// Load world state from a named slot.
#[tauri::command]
pub fn load_save(
    slot: String,
    sim: State<'_, SimulationState>,
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let dir = saves_dir(&app_handle)?;
    let file_path = dir.join(format!("{}.json", slot));

    if !file_path.exists() {
        return Err(format!("Save slot '{}' not found", slot));
    }

    let json = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Read error: {}", e))?;
    let loaded: WorldState = serde_json::from_str(&json)
        .map_err(|e| format!("Deserialize error: {}", e))?;

    let mut world = sim.world.lock().map_err(|e| e.to_string())?;
    *world = loaded;

    serde_json::to_value(&*world).map_err(|e| e.to_string())
}

/// List all save slots.
#[tauri::command]
pub fn list_saves(
    app_handle: tauri::AppHandle,
) -> Result<Vec<SaveMeta>, String> {
    let dir = saves_dir(&app_handle)?;
    let mut saves = Vec::new();

    if dir.exists() {
        let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                let slot = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                // Read just enough to get tick
                if let Ok(json) = std::fs::read_to_string(&path) {
                    if let Ok(ws) = serde_json::from_str::<WorldState>(&json) {
                        let metadata = std::fs::metadata(&path);
                        let timestamp = metadata.ok()
                            .and_then(|m| m.modified().ok())
                            .map(|t| {
                                let duration = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
                                format_timestamp(duration.as_secs())
                            })
                            .unwrap_or_else(|| "unknown".to_string());

                        let level_id = if ws.level_id.is_empty() { "unknown".to_string() } else { ws.level_id.clone() };

                        saves.push(SaveMeta {
                            slot,
                            level_id,
                            tick: ws.tick,
                            timestamp,
                        });
                    }
                }
            }
        }
    }

    saves.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(saves)
}

/// Delete a save slot.
#[tauri::command]
pub fn delete_save(
    slot: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let dir = saves_dir(&app_handle)?;
    let file_path = dir.join(format!("{}.json", slot));
    if file_path.exists() {
        std::fs::remove_file(&file_path).map_err(|e| format!("Delete error: {}", e))?;
    }
    Ok(())
}

fn chrono_now() -> String {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format_timestamp(duration.as_secs())
}

fn format_timestamp(secs: u64) -> String {
    // Simple ISO-ish format without chrono crate
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    // Approximate date from days since epoch (good enough for sorting)
    let y = 1970 + days / 365;
    let d = days % 365;
    format!("{:04}-{:03} {:02}:{:02}:{:02}", y, d, h, m, s)
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
