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
      const charIds = Object.keys(state.characters);
      const firstCharId = charIds[0] ?? null;

      set({
        worldState: pausedState,
        currentLevelId: levelId,
        selectedActorId: firstCharId,
        selectedTargetId: charIds.length > 1 ? charIds[1] : null,
        inspectedCharacterId: charIds.length > 1 ? charIds[1] : firstCharId,
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
    const { selectedActorId, selectedTargetId } = get();
    if (!selectedActorId) {
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
    const { selectedActorId, selectedTargetId, autoStepOnCommand } = get();
    if (!selectedActorId) return;
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

      // Auto-step: if paused and autoStep is on, advance one tick so the
      // player immediately sees the effect of the command.
      const ws = get().worldState;
      if (autoStepOnCommand && ws?.paused) {
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
      await get().refreshCommands();
    } catch (err) {
      set({ error: t('app.error.executeCommand', { message: String(err) }) });
    }
  },

  doTick: async () => {
    // Skip tick when paused
    const ws = get().worldState;
    if (ws?.paused || ws?.time_speed === 0) return;
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
    } catch {
      // Silently ignore tick errors (e.g. during unmount)
    }
  },

  setTimeSpeed: async (speed) => {
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
    if (ws?.paused || ws?.time_speed === 0) return;
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
      const charIds = Object.keys(state.characters);
      const firstCharId = charIds[0] ?? null;
      set({
        worldState: state,
        currentLevelId: state.level_id || slot.split('-tick')[0] || null,
        selectedActorId: firstCharId,
        selectedTargetId: charIds.length > 1 ? charIds[1] : null,
        inspectedCharacterId: charIds.length > 1 ? charIds[1] : firstCharId,
        recentEvents: [],
        page: 'game',
        loading: false,
      });
      await get().refreshCommands();
      get().startTickLoop();
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
