import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../types/backend';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(),
  LogicalSize: class LogicalSize {},
}));

import { listCommands, loadLevel, loadSave, saveGame } from './tauriApi';

function world(): WorldState {
  return {
    tick: 3,
    time_speed: 0,
    paused: true,
    seed: 42,
    level_id: 'pavlov',
    level_label: 'level.pavlov.name',
    level_description: 'level.pavlov.description',
    initial_mode: 'observe',
    default_actor_id: 'pavlov',
    default_target_id: 'dog',
    characters: {},
    items: {},
    event_log: [],
    command_defs: [],
    pending_commands: [],
    in_virtual_context: false,
    virtual_context_stack: [],
    social_groups: {},
    economy: { accounts: {}, holdings: {}, assets: {}, transactions: [] },
    progress: {
      status: 'InProgress',
      objectives: [],
      failure_rules: [],
      command_counts: {},
      command_targets: {},
      completed_at_tick: null,
      outcome_label: null,
    },
  };
}

function mcpResponse(value: unknown): Response {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify(value) }] },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('browser MCP transport', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads a level through MCP and returns the authoritative snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mcpResponse({ level_id: 'pavlov' }))
      .mockResolvedValueOnce(mcpResponse(world()));

    await expect(loadLevel('pavlov')).resolves.toMatchObject({ level_id: 'pavlov', tick: 3 });
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(firstBody.params).toEqual({ name: 'load_level', arguments: { level_id: 'pavlov' } });
  });

  it('maps command arguments to snake_case MCP fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mcpResponse([]));
    await expect(listCommands('pavlov', 'dog')).resolves.toEqual([]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.params.arguments).toEqual({ actor_id: 'pavlov', target_id: 'dog' });
  });

  it('round-trips a browser save through the Rust restore endpoint', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mcpResponse(world()))
      .mockResolvedValueOnce(mcpResponse({ restored: true }))
      .mockResolvedValueOnce(mcpResponse(world()));

    const meta = await saveGame('slot-a');
    expect(meta).toMatchObject({ slot: 'slot-a', level_id: 'pavlov', tick: 3 });
    await expect(loadSave('slot-a')).resolves.toMatchObject({ level_id: 'pavlov' });
  });

  it('rejects save-slot path traversal before any storage or filesystem adapter call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(saveGame('../escape')).rejects.toThrow(/Save slot/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
