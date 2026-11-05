import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef, LayeredState, MindNode, WorldEvent, WorldState } from '../types/backend';

const api = vi.hoisted(() => ({
  loadLevel: vi.fn(),
  setTimeSpeed: vi.fn(),
  listCommands: vi.fn(),
  executeCommand: vi.fn(),
  snapshot: vi.fn(),
  stepTick: vi.fn(),
  moveCharacter: vi.fn(),
  setCharacterPosture: vi.fn(),
  traverseConnector: vi.fn(),
  loadSave: vi.fn(),
}));

vi.mock('../api/tauriApi', () => ({
  ...api,
  cancelPendingCommand: vi.fn(),
  tick: vi.fn(),
  setPaused: vi.fn(),
  saveGame: vi.fn(),
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
    api.setCharacterPosture.mockReset();
    api.traverseConnector.mockReset();
    api.loadSave.mockReset();
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
    expect(gameStore.getState().sceneMotions.pavlov).toMatchObject({ clip: 'walk', from: { x: 0, y: 0 }, to: { x: 28, y: 0 } });
  });

  it('consumes only new successful events and replaces the current motion', async () => {
    api.loadLevel.mockResolvedValue(world());
    await gameStore.getState().loadLevel('pavlov');
    gameStore.getState().setAutoStepOnCommand(false);
    api.snapshot.mockResolvedValue(world());
    api.executeCommand.mockResolvedValue([{ CommandRejected: { actor_id: 'pavlov', command_id: 'ring-bell', target_id: 'dog', reason: 'blocked' } }]);
    await gameStore.getState().executeCommand('ring-bell');
    expect(gameStore.getState().sceneMotions).toEqual({});
    api.executeCommand.mockResolvedValue([{ CommandExecuted: { actor_id: 'pavlov', command_id: 'ring-bell', target_id: 'dog' } }]);
    await gameStore.getState().executeCommand('ring-bell');
    const motion = gameStore.getState().sceneMotions.pavlov;
    expect(motion.clip).toBe('interact');
    gameStore.getState().acceptWorld(world());
    expect(gameStore.getState().sceneMotions.pavlov).toBe(motion);
    api.executeCommand.mockResolvedValue([{ CommandExecuted: { actor_id: 'pavlov', command_id: 'offer-water', target_id: 'dog' } }]);
    await gameStore.getState().executeCommand('offer-water');
    expect(gameStore.getState().sceneMotions.pavlov.clip).toBe('offer');
    expect(gameStore.getState().sceneMotions.pavlov.sequence).toBe(motion.sequence + 1);
    expect(gameStore.getState().sceneMotions.dog).toBeUndefined();
    await gameStore.getState().loadLevel('pavlov');
    expect(gameStore.getState().sceneMotions).toEqual({});
  });

  it('uses connector metadata and clears motion on load, layer jumps and character removal', async () => {
    const initial = world();
    initial.scene = { platforms: [{ id: 'a', x_min: -100, x_max: 100, y: 0 }, { id: 'b', x_min: -100, x_max: 100, y: 100 }], connectors: [{ id: 'ladder', kind: 'ladder', from_platform: 'a', to_platform: 'b', from_x: 10, to_x: 30 }] };
    api.loadLevel.mockResolvedValue(initial);
    await gameStore.getState().loadLevel('pavlov');
    const climbed = world();
    climbed.scene = initial.scene;
    climbed.characters.pavlov.position = { x: 30, y: 100 };
    api.snapshot.mockResolvedValue(climbed);
    api.traverseConnector.mockResolvedValue({ CharacterMoved: { character_id: 'pavlov', from_x: 0, from_y: 0, to_x: 30, to_y: 100 } });
    await gameStore.getState().traverseSelectedConnector('ladder');
    expect(gameStore.getState().sceneMotions.pavlov).toMatchObject({ clip: 'climb', from: { x: 0, y: 0 }, via: { x: 10, y: 0 }, to: { x: 30, y: 100 }, durationMs: (10 + Math.hypot(20, 100)) * 4 });
    const nearTop = structuredClone(climbed);
    nearTop.characters.pavlov.position.x = 40;
    gameStore.getState().acceptWorld(nearTop);
    const descended = structuredClone(initial);
    descended.characters.pavlov.position.x = 10;
    api.snapshot.mockResolvedValue(descended);
    api.traverseConnector.mockResolvedValue({ CharacterMoved: { character_id: 'pavlov', from_x: 40, from_y: 100, to_x: 10, to_y: 0 } });
    await gameStore.getState().traverseSelectedConnector('ladder');
    expect(gameStore.getState().sceneMotions.pavlov).toMatchObject({ clip: 'climb', from: { x: 40, y: 100 }, via: { x: 30, y: 100 }, to: { x: 10, y: 0 } });
    api.loadSave.mockResolvedValue(initial);
    await gameStore.getState().loadSave('slot');
    expect(gameStore.getState().sceneMotions).toEqual({});
    gameStore.getState().acceptWorld(initial, [{ CommandExecuted: { actor_id: 'pavlov', command_id: 'ring-bell', target_id: 'dog' } }]);
    gameStore.getState().acceptWorld({ ...initial, in_virtual_context: true });
    expect(gameStore.getState().sceneMotions).toEqual({});
    const modern = { ...initial, layered_world: { pavlov: { context_id: 'real' } as LayeredState, dog: { context_id: 'real' } as LayeredState } };
    gameStore.getState().acceptWorld(modern);
    gameStore.getState().acceptWorld(modern, [{ CommandExecuted: { actor_id: 'pavlov', command_id: 'ring-bell', target_id: 'dog' } }]);
    const ongoing = gameStore.getState().sceneMotions.pavlov;
    gameStore.getState().acceptWorld({ ...modern, in_virtual_context: true, virtual_context_stack: ['dream'], layered_world: { ...modern.layered_world, dog: { context_id: 'dream' } as LayeredState } });
    expect(gameStore.getState().sceneMotions.pavlov).toBe(ongoing);
    const removed = world();
    delete removed.characters.pavlov;
    gameStore.getState().acceptWorld(removed);
    expect(gameStore.getState().sceneMotions).toEqual({});
    gameStore.getState().reset();
    expect(gameStore.getState().sceneMotions).toEqual({});
  });

  it('animates authoritative posture, executed action schemas and actual feeding results', async () => {
    const initial = world();
    initial.characters.dog.mind_graph.nodes.hunger = { instance_id: 'hunger', schema_id: 'it:concept/hunger', value: 0.8 } as MindNode;
    initial.characters.dog.mind_graph.nodes.press = { instance_id: 'press', schema_id: 'it:concept/press-button' } as MindNode;
    api.loadLevel.mockResolvedValue(initial);
    await gameStore.getState().loadLevel('pavlov');
    const sitting = { ...initial, character_postures: { pavlov: 'sitting' as const } };
    api.snapshot.mockResolvedValue(sitting);
    await gameStore.getState().setSelectedPosture('sitting');
    expect(gameStore.getState().sceneMotions.pavlov).toMatchObject({ clip: 'sit-down', fromPosture: 'standing', toPosture: 'sitting' });
    gameStore.getState().acceptWorld(sitting, [{ ActionExecuted: { character_id: 'dog', instance_id: 'press', executed_at: 1, autonomous: true } }]);
    expect(gameStore.getState().sceneMotions.dog.clip).toBe('interact');
    const fed = structuredClone(sitting);
    fed.characters.dog.mind_graph.nodes.hunger.value = 0.4;
    gameStore.getState().acceptWorld(fed, [
      { CommandExecuted: { actor_id: 'pavlov', command_id: 'feed', target_id: 'dog' } },
      { LearningUpdated: { character_id: 'dog', edge_id: 'food-hunger', source_id: 'food', target_id: 'hunger', reward: 0.4, prediction: 0, prediction_error: 0.4, dopamine_spent: 0.1, old_weight: 0.1, new_weight: 0.2, phase: 'reinforced' } },
    ]);
    expect(gameStore.getState().sceneMotions.dog.clip).toBe('eat');
    const activated = structuredClone(fed);
    activated.characters.dog.mind_graph.nodes.salivate = { instance_id: 'salivate', schema_id: 'it:concept/salivate', node_type: 'Action', active: true, action: { innate: true } } as MindNode;
    gameStore.getState().acceptWorld(activated, [{ NodeActivated: { character_id: 'dog', instance_id: 'salivate' } }]);
    const innateMotion = gameStore.getState().sceneMotions.dog;
    expect(innateMotion.clip).toBe('observe');
    gameStore.getState().acceptWorld(activated);
    expect(gameStore.getState().sceneMotions.dog).toBe(innateMotion);
    const perceived = structuredClone(activated);
    perceived.characters.dog.mind_graph.nodes.observation = { instance_id: 'observation', schema_id: 'it:concept/drink', node_type: 'Observation', active: true, action: null } as MindNode;
    gameStore.getState().acceptWorld(perceived, [{ NodeActivated: { character_id: 'dog', instance_id: 'observation' } }]);
    expect(gameStore.getState().sceneMotions.dog).toBe(innateMotion);
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
  it('closes notebook on repeated same-level load, not on ordinary snapshots', async () => {
    api.loadLevel.mockResolvedValue(world());
    await gameStore.getState().loadLevel('pavlov');
    gameStore.setState({ sceneNotebookOpen: true });
    api.snapshot.mockResolvedValue({ ...world(), layered_world: { pavlov: { context_id: 'inner' } } } as unknown as WorldState);
    await gameStore.getState().executeCommand('ring-bell');
    expect(gameStore.getState().sceneNotebookOpen).toBe(true);
    await gameStore.getState().loadLevel('pavlov');
    expect(gameStore.getState().sceneNotebookOpen).toBe(false);
  });
  it('refreshes backend proximity commands after moving while paused in a layered world', async () => {
    api.loadLevel.mockResolvedValue(world());
    await gameStore.getState().loadLevel('pavlov');
    gameStore.getState().setUiMode('micro');
    const moved = { ...world(), paused: true, scene: { platforms: [], connectors: [], layered_world: { actor_ids: ['pavlov'], contexts: [], interaction_range: 60, need_schema_id: 'hunger', meal_item_id: 'meal', need_relief: .8, need_max: .2 } } } as WorldState;
    api.snapshot.mockResolvedValue(moved);
    api.moveCharacter.mockResolvedValue({ CharacterMoved: { character_id: 'pavlov', from_x: 0, from_y: 0, to_x: 28, to_y: 0 } });
    const enter = { ...command, command_id: 'enter-vr', targeting: 'NoTarget' } as CommandDef;
    api.listCommands.mockClear().mockResolvedValue([enter]);
    await gameStore.getState().moveSelectedActor(28, 0);
    expect(api.listCommands).toHaveBeenCalledWith('pavlov', 'dog');
    expect(gameStore.getState().availableCommands).toEqual([enter]);
  });
  it('presents direct room perception immediately without replaying earlier memory history', async () => {
    const oldMemory: WorldEvent = { RoomMemoryChanged: { observer_id: 'pavlov', room_id: 'archive', variant_id: 'archive', kind: 'room_left', tick: 0 } };
    const initial = { ...world(), event_log: [oldMemory] };
    api.loadLevel.mockResolvedValue(initial);
    await gameStore.getState().loadLevel('pavlov');
    gameStore.getState().setUiMode('micro');
    const perception: WorldEvent = { RoomMemoryChanged: { observer_id: 'pavlov', room_id: 'archive', variant_id: 'maproom', kind: 'forgotten_room_revisited', tick: 6 } };
    const movement: WorldEvent = { CharacterMoved: { character_id: 'pavlov', from_x: 0, from_y: 0, to_x: 28, to_y: 0 } };
    api.moveCharacter.mockResolvedValue(movement);
    const moved = { ...initial, event_log: [oldMemory, perception, movement] };
    api.snapshot.mockResolvedValue(moved);
    await gameStore.getState().moveSelectedActor(28, 0);
    expect(gameStore.getState().recentEvents).toEqual([perception, movement]);
    api.snapshot.mockResolvedValue({ ...moved, event_log: [...moved.event_log, movement] });
    await gameStore.getState().moveSelectedActor(28, 0);
    expect(gameStore.getState().recentEvents.filter(event => 'RoomMemoryChanged' in event)).toEqual([perception]);
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
