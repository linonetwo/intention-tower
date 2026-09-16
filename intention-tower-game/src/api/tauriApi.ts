/**
 * Tauri IPC command wrappers.
 * All calls go to the Rust backend via invoke().
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import type { WorldState, WorldEvent, CommandDef, SaveMeta } from '../types/backend';

const WEB_SAVE_KEY = 'intention-tower-web-saves-v1';
const MCP_ENDPOINT = import.meta.env.VITE_MCP_URL ?? 'http://127.0.0.1:9222/mcp';
let rpcSequence = 1;

function validateSaveSlot(slot: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(slot)) {
    throw new Error("Save slot may only contain 1–64 letters, numbers, '-' or '_'");
  }
}

interface McpEnvelope {
  result?: {
    content?: Array<{ type: string; text?: string }>;
  };
  error?: { message?: string };
}

/** Browser development uses the standalone Rust MCP core through Vite's proxy. */
async function mcpCall<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcSequence++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`MCP ${name} failed: HTTP ${response.status}`);
  const envelope = await response.json() as McpEnvelope;
  if (envelope.error) throw new Error(envelope.error.message ?? `MCP ${name} failed`);
  const text = envelope.result?.content?.find((item) => item.type === 'text')?.text;
  if (text == null) throw new Error(`MCP ${name} returned no data`);
  return JSON.parse(text) as T;
}

function readWebSaves(): Record<string, { meta: SaveMeta; world: WorldState }> {
  try {
    return JSON.parse(localStorage.getItem(WEB_SAVE_KEY) ?? '{}') as Record<string, { meta: SaveMeta; world: WorldState }>;
  } catch {
    return {};
  }
}

function writeWebSaves(saves: Record<string, { meta: SaveMeta; world: WorldState }>): void {
  localStorage.setItem(WEB_SAVE_KEY, JSON.stringify(saves));
}

/** Load a level by directory ID (e.g. "pavlov"). Returns initial WorldState. */
export async function loadLevel(levelId: string): Promise<WorldState> {
  if (isTauri()) return invoke<WorldState>('load_level', { levelId });
  await mcpCall('load_level', { level_id: levelId });
  return mcpCall<WorldState>('snapshot');
}

/** Get full world state snapshot. */
export async function snapshot(): Promise<WorldState> {
  return isTauri() ? invoke<WorldState>('snapshot') : mcpCall<WorldState>('snapshot');
}

/** Advance simulation by dt seconds. Returns events produced this tick. */
export async function tick(dt: number): Promise<WorldEvent[]> {
  if (isTauri()) return invoke<WorldEvent[]>('tick', { dt });
  const result = await mcpCall<{ events: WorldEvent[] }>('tick', { count: 1, dt });
  return result.events;
}

/** Set time speed: 0=pause, 1=1x, 2=2x, 3=3x, 4=4x. */
export async function setTimeSpeed(speed: number): Promise<void> {
  if (isTauri()) await invoke('set_time_speed', { speed });
  else await mcpCall('set_time_speed', { speed });
}

/** List commands available for an actor (optionally targeting another entity). */
export async function listCommands(actorId: string, targetId?: string | null): Promise<CommandDef[]> {
  if (isTauri()) return invoke<CommandDef[]>('list_commands', { actorId, targetId: targetId ?? null });
  return mcpCall<CommandDef[]>('list_commands', { actor_id: actorId, target_id: targetId ?? null });
}

/** Execute a command. Returns events produced. */
export async function executeCommand(
  commandId: string,
  actorId: string,
  targetId?: string | null,
): Promise<WorldEvent[]> {
  if (isTauri()) {
    return invoke<WorldEvent[]>('execute_command', {
      commandId,
      actorId,
      targetId: targetId ?? null,
    });
  }
  const result = await mcpCall<{ events: WorldEvent[] }>('execute_command', {
    command_id: commandId,
    actor_id: actorId,
    target_id: targetId ?? null,
  });
  return result.events;
}

/** Cancel a queued pending command by command_id. */
export async function cancelPendingCommand(commandId: string): Promise<void> {
  if (isTauri()) await invoke('cancel_pending_command', { commandId });
  else await mcpCall('cancel_pending_command', { command_id: commandId });
}

/** Get a specific character's mind graph JSON. */
export async function getMindGraph(characterId: string): Promise<unknown> {
  if (isTauri()) return invoke('get_mind_graph', { characterId });
  const world = await snapshot();
  const character = world.characters[characterId];
  if (!character) throw new Error(`Character '${characterId}' not found`);
  return character.mind_graph;
}

/** Pause or unpause the simulation. */
export async function setPaused(paused: boolean): Promise<void> {
  if (isTauri()) await invoke('set_paused', { paused });
  else await mcpCall('set_paused', { paused });
}

/** Advance exactly one tick regardless of pause state (single-step button). */
export async function stepTick(): Promise<WorldEvent[]> {
  if (isTauri()) return invoke<WorldEvent[]>('step_tick');
  const result = await mcpCall<{ events: WorldEvent[] }>('step_tick');
  return result.events;
}

/** Move a character in micro-control mode without advancing simulation time. */
export async function moveCharacter(
  characterId: string,
  deltaX: number,
  deltaY: number,
): Promise<WorldEvent> {
  if (isTauri()) {
    return invoke<WorldEvent>('move_character', { characterId, deltaX, deltaY });
  }
  return mcpCall<WorldEvent>('move_character', {
    character_id: characterId,
    delta_x: deltaX,
    delta_y: deltaY,
  });
}

// ── Save / Load ──

/** Save current game state to a named slot. */
export async function saveGame(slot: string): Promise<SaveMeta> {
  validateSaveSlot(slot);
  if (isTauri()) return invoke<SaveMeta>('save_game', { slot });
  const world = await snapshot();
  const meta: SaveMeta = {
    slot,
    level_id: world.level_id,
    tick: world.tick,
    timestamp: new Date().toISOString(),
  };
  const saves = readWebSaves();
  saves[slot] = { meta, world };
  writeWebSaves(saves);
  return meta;
}

/** Load game state from a named slot. Returns the restored WorldState. */
export async function loadSave(slot: string): Promise<WorldState> {
  validateSaveSlot(slot);
  if (isTauri()) return invoke<WorldState>('load_save', { slot });
  const saved = readWebSaves()[slot];
  if (!saved) throw new Error(`Save slot '${slot}' not found`);
  await mcpCall('restore_snapshot', { world: saved.world });
  return snapshot();
}

/** List all save slots. */
export async function listSaves(): Promise<SaveMeta[]> {
  if (isTauri()) return invoke<SaveMeta[]>('list_saves');
  return Object.values(readWebSaves())
    .map((saved) => saved.meta)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Delete a save slot. */
export async function deleteSave(slot: string): Promise<void> {
  validateSaveSlot(slot);
  if (isTauri()) {
    await invoke('delete_save', { slot });
    return;
  }
  const saves = readWebSaves();
  delete saves[slot];
  writeWebSaves(saves);
}

// ── Window / Graphics ──

export interface WindowResolution {
  width: number;
  height: number;
}

export async function getWindowResolution(): Promise<WindowResolution> {
  if (!isTauri()) return { width: window.innerWidth, height: window.innerHeight };
  const size = await getCurrentWindow().innerSize();
  return {
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
}

export async function setWindowResolution(width: number, height: number): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().setSize(new LogicalSize(width, height));
}
