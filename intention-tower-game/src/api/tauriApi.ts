/**
 * Tauri IPC command wrappers.
 * All calls go to the Rust backend via invoke().
 */
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import type { WorldState, WorldEvent, CommandDef, SaveMeta } from '../types/backend';

/** Load a level by directory ID (e.g. "pavlov"). Returns initial WorldState. */
export async function loadLevel(levelId: string): Promise<WorldState> {
  return invoke<WorldState>('load_level', { levelId });
}

/** Get full world state snapshot. */
export async function snapshot(): Promise<WorldState> {
  return invoke<WorldState>('snapshot');
}

/** Advance simulation by dt seconds. Returns events produced this tick. */
export async function tick(dt: number): Promise<WorldEvent[]> {
  return invoke<WorldEvent[]>('tick', { dt });
}

/** Set time speed: 0=pause, 1=1x, 2=2x, 3=3x, 4=4x. */
export async function setTimeSpeed(speed: number): Promise<void> {
  return invoke('set_time_speed', { speed });
}

/** List commands available for an actor (optionally targeting another entity). */
export async function listCommands(actorId: string, targetId?: string | null): Promise<CommandDef[]> {
  return invoke<CommandDef[]>('list_commands', { actorId, targetId: targetId ?? null });
}

/** Execute a command. Returns events produced. */
export async function executeCommand(
  commandId: string,
  actorId: string,
  targetId?: string | null,
): Promise<WorldEvent[]> {
  return invoke<WorldEvent[]>('execute_command', {
    commandId,
    actorId,
    targetId: targetId ?? null,
  });
}

/** Cancel a queued pending command by command_id. */
export async function cancelPendingCommand(commandId: string): Promise<void> {
  return invoke('cancel_pending_command', { commandId });
}

/** Get a specific character's mind graph JSON. */
export async function getMindGraph(characterId: string): Promise<unknown> {
  return invoke('get_mind_graph', { characterId });
}

/** Pause or unpause the simulation. */
export async function setPaused(paused: boolean): Promise<void> {
  return invoke('set_paused', { paused });
}

/** Advance exactly one tick regardless of pause state (single-step button). */
export async function stepTick(): Promise<WorldEvent[]> {
  return invoke<WorldEvent[]>('step_tick');
}

// ── Save / Load ──

/** Save current game state to a named slot. */
export async function saveGame(slot: string): Promise<SaveMeta> {
  return invoke<SaveMeta>('save_game', { slot });
}

/** Load game state from a named slot. Returns the restored WorldState. */
export async function loadSave(slot: string): Promise<WorldState> {
  return invoke<WorldState>('load_save', { slot });
}

/** List all save slots. */
export async function listSaves(): Promise<SaveMeta[]> {
  return invoke<SaveMeta[]>('list_saves');
}

/** Delete a save slot. */
export async function deleteSave(slot: string): Promise<void> {
  return invoke('delete_save', { slot });
}

// ── Window / Graphics ──

export interface WindowResolution {
  width: number;
  height: number;
}

export async function getWindowResolution(): Promise<WindowResolution> {
  const size = await getCurrentWindow().innerSize();
  return {
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
}

export async function setWindowResolution(width: number, height: number): Promise<void> {
  await getCurrentWindow().setSize(new LogicalSize(width, height));
}
