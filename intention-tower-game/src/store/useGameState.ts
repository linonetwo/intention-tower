/**
 * Main game state store — single source of truth, driven by backend.
 *
 * All game data comes from the Rust backend via Tauri commands.
 * The frontend is a thin view layer over this store.
 */
import { createStore, useStore } from 'zustand';
import * as api from '../api/tauriApi';
import { t } from '../i18n';
import type { WorldState, WorldEvent, CommandDef, SaveMeta } from '../types/backend';

export type Page = 'menu' | 'game';
export type UiMode = 'observe' | 'micro' | 'graph';

interface GameState {
  // Navigation
  page: Page;

  // Level
  currentLevelId: string | null;

  // Backend-driven world state
  worldState: WorldState | null;

  // Selection
  selectedActorId: string | null;
  selectedTargetId: string | null;
  inspectedCharacterId: string | null; // for mind graph viewer

  // Commands
  availableCommands: CommandDef[];

  // Events (newest first)
  recentEvents: WorldEvent[];

  // Tick loop
  tickIntervalId: number | null;

  // Save/Load
  saves: SaveMeta[];

  // UI state
  uiMode: UiMode;
  autoStepOnCommand: boolean;
  loading: boolean;
  error: string | null;
}

interface GameActions {
  setPage: (page: Page) => void;
  loadLevel: (levelId: string) => Promise<void>;
  selectActor: (id: string | null) => void;
  selectTarget: (id: string | null) => void;
  inspectCharacter: (id: string | null) => void;
  setUiMode: (mode: UiMode) => void;
  setAutoStepOnCommand: (enabled: boolean) => void;
  refreshCommands: () => Promise<void>;
  executeCommand: (commandId: string) => Promise<void>;
  cancelPendingCommand: (commandId: string) => Promise<void>;
  stepTick: () => Promise<void>;
  moveSelectedActor: (deltaX: number, deltaY: number) => Promise<void>;
  doTick: () => Promise<void>;
  setTimeSpeed: (speed: number) => Promise<void>;
  startTickLoop: () => void;
  stopTickLoop: () => void;
  // Save/Load
  saveGame: (slot?: string) => Promise<void>;
  loadSave: (slot: string) => Promise<void>;
  refreshSaves: () => Promise<void>;
  deleteSave: (slot: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export type GameStore = GameState & GameActions;

function pickInitialSelection(state: WorldState): {
  actorId: string | null;
  targetId: string | null;
  inspectId: string | null;
} {
  const ids = Object.keys(state.characters).sort((a, b) => a.localeCompare(b));
  if (ids.length === 0) return { actorId: null, targetId: null, inspectId: null };
  const actorId = state.default_actor_id && state.characters[state.default_actor_id]
    ? state.default_actor_id
    : ids[0];
  const targetId = state.default_target_id && state.characters[state.default_target_id]
    ? state.default_target_id
    : ids.find((id) => id !== actorId) ?? null;
  return { actorId, targetId, inspectId: targetId ?? actorId };
}

export const gameStore = createStore<GameStore>()((set, get) => ({
  // ── Initial State ──
  page: 'menu',
  currentLevelId: null,
  worldState: null,
  selectedActorId: null,
  selectedTargetId: null,
  inspectedCharacterId: null,
  availableCommands: [],
  recentEvents: [],
  tickIntervalId: null,
  saves: [],
  uiMode: 'observe',
  autoStepOnCommand: true,
  loading: false,
  error: null,

  // ── Actions ──

  setPage: (page) => set({ page }),

  loadLevel: async (levelId) => {
    set({ loading: true, error: null });
    try {
      const state = await api.loadLevel(levelId);
      // Immediately pause so the player can orient before time starts
      await api.setTimeSpeed(0);
      const pausedState = { ...state, time_speed: 0 as 0, paused: true };
      const initial = pickInitialSelection(state);

      set({
        worldState: pausedState,
        currentLevelId: levelId,
        selectedActorId: initial.actorId,
        selectedTargetId: initial.targetId,
        inspectedCharacterId: initial.inspectId,
        uiMode: state.initial_mode ?? 'observe',
        recentEvents: [],
        page: 'game',
        loading: false,
      });

      // Auto-refresh commands after loading
      await get().refreshCommands();
      // Don't start tick loop — game starts paused
    } catch (err) {
      set({ error: t('app.error.loadLevel', { message: String(err) }), loading: false });
    }
  },

  selectActor: (id) => {
    set({ selectedActorId: id });
    // Fire-and-forget refresh
    get().refreshCommands();
  },

  selectTarget: (id) => {
    set({ selectedTargetId: id });
    get().refreshCommands();
  },

  inspectCharacter: (id) => {
    set({ inspectedCharacterId: id });
  },

  setUiMode: (mode) => {
    set({ uiMode: mode });
  },

  setAutoStepOnCommand: (enabled) => {
    set({ autoStepOnCommand: enabled });
  },

  refreshCommands: async () => {
    const { selectedActorId, selectedTargetId, worldState } = get();
    if (!selectedActorId || worldState?.progress.status !== 'InProgress') {
      set({ availableCommands: [] });
      return;
    }
    try {
      const cmds = await api.listCommands(selectedActorId, selectedTargetId);
      set({ availableCommands: cmds });
    } catch {
      set({ availableCommands: [] });
    }
  },

  executeCommand: async (commandId) => {
    const { selectedActorId, selectedTargetId, autoStepOnCommand, worldState } = get();
    if (!selectedActorId || worldState?.progress.status !== 'InProgress') return;
    try {
      const events = await api.executeCommand(commandId, selectedActorId, selectedTargetId);
      // After executing/queueing, refresh the full state
      const state = await api.snapshot();
      const meaningful = events.filter((e) => !('TickCompleted' in e));
      set((prev) => ({
        worldState: state,
        recentEvents: [
          ...meaningful,
          ...prev.recentEvents,
        ].slice(0, 500),
      }));
      if (state.progress.status !== 'InProgress') {
        get().stopTickLoop();
        set({ availableCommands: [] });
      }

      // Auto-step: if paused and autoStep is on, advance one tick so the
      // player immediately sees the effect of the command.
      const ws = get().worldState;
      if (autoStepOnCommand && ws?.paused && ws.progress.status === 'InProgress') {
        await get().stepTick();
      }

      await get().refreshCommands();
    } catch (err) {
      set({ error: t('app.error.executeCommand', { message: String(err) }) });
    }
  },

  cancelPendingCommand: async (commandId) => {
    try {
      await api.cancelPendingCommand(commandId);
      const state = await api.snapshot();
      set({ worldState: state });
    } catch (err) {
      set({ error: t('app.error.executeCommand', { message: String(err) }) });
    }
  },

  stepTick: async () => {
    try {
      const events = await api.stepTick();
      const state = await api.snapshot();
      const meaningful = events.filter((e) => !('TickCompleted' in e));
      set((prev) => ({
        worldState: state,
        recentEvents: [...meaningful, ...prev.recentEvents].slice(0, 500),
      }));
      if (state.progress.status !== 'InProgress') {
        get().stopTickLoop();
        set({ availableCommands: [] });
        return;
      }
      await get().refreshCommands();
    } catch (err) {
      set({ error: t('app.error.executeCommand', { message: String(err) }) });
    }
  },

  moveSelectedActor: async (deltaX, deltaY) => {
    const { selectedActorId, uiMode, worldState } = get();
    if (!selectedActorId || uiMode !== 'micro' || worldState?.progress.status !== 'InProgress') {
      return;
    }
    try {
      const event = await api.moveCharacter(selectedActorId, deltaX, deltaY);
      const state = await api.snapshot();
      set((previous) => ({
        worldState: state,
        recentEvents: [event, ...previous.recentEvents].slice(0, 500),
      }));
    } catch (err) {
      set({ error: t('app.error.moveCharacter', { message: String(err) }) });
    }
  },

  doTick: async () => {
    // Skip tick when paused
    const ws = get().worldState;
    if (ws?.paused || ws?.time_speed === 0 || ws?.progress.status !== 'InProgress') return;
    try {
      const dt = 0.5 * Math.max(1, ws?.time_speed ?? 1);
      const events = await api.tick(dt);
      const state = await api.snapshot();
      // Only add non-TickCompleted events to the log
      const meaningful = events.filter((e) => !('TickCompleted' in e));
      if (meaningful.length > 0) {
        set((prev) => ({
          worldState: state,
          recentEvents: [...meaningful, ...prev.recentEvents].slice(0, 500),
        }));
      } else {
        set({ worldState: state });
      }
      if (state.progress.status !== 'InProgress') {
        get().stopTickLoop();
        set({ availableCommands: [] });
      }
    } catch {
      // Silently ignore tick errors (e.g. during unmount)
    }
  },

  setTimeSpeed: async (speed) => {
    if (speed > 0 && get().worldState?.progress.status !== 'InProgress') return;
    try {
      await api.setTimeSpeed(speed);
      const state = await api.snapshot();
      set({ worldState: state });
      if (speed === 0) {
        get().stopTickLoop();
      } else {
        get().startTickLoop();
      }
    } catch (err) {
      set({ error: t('app.error.setSpeed', { message: String(err) }) });
    }
  },

  startTickLoop: () => {
    const existing = get().tickIntervalId;
    if (existing != null) return;
    const ws = get().worldState;
    if (ws?.paused || ws?.time_speed === 0 || ws?.progress.status !== 'InProgress') return;
    const id = window.setInterval(() => {
      get().doTick();
    }, 500) as unknown as number;
    set({ tickIntervalId: id });
  },

  stopTickLoop: () => {
    const id = get().tickIntervalId;
    if (id != null) {
      window.clearInterval(id);
      set({ tickIntervalId: null });
    }
  },

  // ── Save / Load ──

  saveGame: async (slot?: string) => {
    const levelId = get().currentLevelId ?? 'unknown';
    const tick = get().worldState?.tick ?? 0;
    const slotName = slot ?? `${levelId}-tick${tick}`;
    try {
      await api.saveGame(slotName);
      await get().refreshSaves();
    } catch (err) {
      set({ error: t('app.error.save', { message: String(err) }) });
    }
  },

  loadSave: async (slot: string) => {
    set({ loading: true, error: null });
    try {
      const state = await api.loadSave(slot);
      const initial = pickInitialSelection(state);
      set({
        worldState: state,
        currentLevelId: state.level_id || slot.split('-tick')[0] || null,
        selectedActorId: initial.actorId,
        selectedTargetId: initial.targetId,
        inspectedCharacterId: initial.inspectId,
        uiMode: state.initial_mode ?? 'observe',
        recentEvents: [],
        page: 'game',
        loading: false,
      });
      await get().refreshCommands();
      if (state.progress.status === 'InProgress') get().startTickLoop();
    } catch (err) {
      set({ error: t('app.error.loadSave', { message: String(err) }), loading: false });
    }
  },

  refreshSaves: async () => {
    try {
      const saves = await api.listSaves();
      set({ saves });
    } catch {
      set({ saves: [] });
    }
  },

  deleteSave: async (slot: string) => {
    try {
      await api.deleteSave(slot);
      await get().refreshSaves();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => {
    get().stopTickLoop();
    set({
      page: 'menu',
      currentLevelId: null,
      worldState: null,
      selectedActorId: null,
      selectedTargetId: null,
      inspectedCharacterId: null,
      availableCommands: [],
      recentEvents: [],
      saves: [],
      uiMode: 'observe',
      autoStepOnCommand: true,
      loading: false,
      error: null,
    });
  },
}));

/**
 * Typed React hook for reading game state.
 * Uses createStore + useStore pattern to ensure selector types are inferred correctly.
 */
export function useGameState<T>(selector: (state: GameStore) => T): T {
  return useStore(gameStore, selector);
}
