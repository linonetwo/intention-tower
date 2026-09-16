import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef, WorldState } from '../types/backend';

const api = vi.hoisted(() => ({
  loadLevel: vi.fn(),
  setTimeSpeed: vi.fn(),
  listCommands: vi.fn(),
  executeCommand: vi.fn(),
  snapshot: vi.fn(),
  stepTick: vi.fn(),
  moveCharacter: vi.fn(),
}));

vi.mock('../api/tauriApi', () => ({
  ...api,
  cancelPendingCommand: vi.fn(),
  tick: vi.fn(),
  setPaused: vi.fn(),
  saveGame: vi.fn(),
  loadSave: vi.fn(),
  listSaves: vi.fn(),
  deleteSave: vi.fn(),
}));

import { gameStore } from './useGameState';

function world(status: 'InProgress' | 'Won' | 'Lost' = 'InProgress'): WorldState {
  const character = (id: string) => ({
    id,
    label: id,
    position: { x: 0, y: 0 },
    mind_graph: { character_id: id, nodes: {}, edges: {} },
  });
  return {
    tick: status === 'InProgress' ? 0 : 4,
    time_speed: 1,
    paused: false,
    seed: 1,
    level_id: 'pavlov',
    level_label: 'level.pavlov.name',
    level_description: 'level.pavlov.description',
    initial_mode: 'observe',
    default_actor_id: 'pavlov',
    default_target_id: 'dog',
    characters: { dog: character('dog'), pavlov: character('pavlov') },
    items: {},
    event_log: [],
    command_defs: [],
    pending_commands: [],
    in_virtual_context: false,
    virtual_context_stack: [],
    social_groups: {},
    economy: { accounts: {}, holdings: {}, assets: {}, transactions: [] },
    progress: {
      status,
      objectives: [],
      failure_rules: [],
      command_counts: {},
      command_targets: {},
      completed_at_tick: status === 'InProgress' ? null : 4,
      outcome_label: status === 'Lost' ? 'timeout' : null,
    },
  };
}

const command: CommandDef = {
  command_id: 'ring-bell',
  label: 'command.ring-bell.label',
  hotkey: '1',
  targeting: 'RequiresTarget',
  preconditions: [],
  effect_templates: [],
};

describe('backend-driven game store', () => {
  beforeEach(() => {
    gameStore.getState().reset();
    api.loadLevel.mockReset();
    api.setTimeSpeed.mockReset().mockResolvedValue(undefined);
    api.listCommands.mockReset().mockResolvedValue([command]);
    api.executeCommand.mockReset().mockResolvedValue([]);
    api.snapshot.mockReset();
    api.stepTick.mockReset().mockResolvedValue([]);
    api.moveCharacter.mockReset();
  });

  it('mirrors an authoritative micro-control movement snapshot', async () => {
    api.loadLevel.mockResolvedValue(world());
    await gameStore.getState().loadLevel('pavlov');
    gameStore.getState().setUiMode('micro');
    const moved = world();
    moved.characters.pavlov.position = { x: 28, y: 0 };
    api.moveCharacter.mockResolvedValue({
      CharacterMoved: {
        character_id: 'pavlov',
        from_x: 0,
        from_y: 0,
        to_x: 28,
        to_y: 0,
      },
    });
    api.snapshot.mockResolvedValue(moved);

    await gameStore.getState().moveSelectedActor(28, 0);

    expect(api.moveCharacter).toHaveBeenCalledWith('pavlov', 28, 0);
    expect(gameStore.getState().worldState?.characters.pavlov.position.x).toBe(28);
  });

  it('uses level defaults and starts paused so both mouse and touch players can orient', async () => {
    api.loadLevel.mockResolvedValue(world());
    await gameStore.getState().loadLevel('pavlov');

    const state = gameStore.getState();
    expect(state.page).toBe('game');
    expect(state.selectedActorId).toBe('pavlov');
    expect(state.selectedTargetId).toBe('dog');
    expect(state.worldState).toMatchObject({ paused: true, time_speed: 0 });
    expect(state.availableCommands).toEqual([command]);
  });

  it('clears commands and stops interaction when the backend declares victory', async () => {
    api.loadLevel.mockResolvedValue(world());
    await gameStore.getState().loadLevel('pavlov');
    api.snapshot.mockResolvedValue(world('Won'));

    await gameStore.getState().executeCommand('ring-bell');

    expect(gameStore.getState().worldState?.progress.status).toBe('Won');
    expect(gameStore.getState().availableCommands).toEqual([]);
    expect(api.stepTick).not.toHaveBeenCalled();
  });
});
