/**
 * Main game state store — single source of truth, driven by backend.
 *
 * All game data comes from the Rust backend via Tauri commands.
 * The frontend is a thin view layer over this store.
 */
import { createStore, useStore } from 'zustand';
import * as api from '../api/tauriApi';
import type { WorldState, WorldEvent, CommandDef } from '../types/backend';

export type Page = 'menu' | 'game';

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

  // UI state
  loading: boolean;
  error: string | null;
}

interface GameActions {
  setPage: (page: Page) => void;
  loadLevel: (levelId: string) => Promise<void>;
  selectActor: (id: string | null) => void;
  selectTarget: (id: string | null) => void;
  inspectCharacter: (id: string | null) => void;
  refreshCommands: () => Promise<void>;
  executeCommand: (commandId: string) => Promise<void>;
  doTick: () => Promise<void>;
  setTimeSpeed: (speed: number) => Promise<void>;
  startTickLoop: () => void;
  stopTickLoop: () => void;
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
  loading: false,
  error: null,

  // ── Actions ──

  setPage: (page) => set({ page }),

  loadLevel: async (levelId) => {
    set({ loading: true, error: null });
    try {
      const state = await api.loadLevel(levelId);
      const charIds = Object.keys(state.characters);
      const firstCharId = charIds[0] ?? null;

      set({
        worldState: state,
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
      // Start tick loop
      get().startTickLoop();
    } catch (err) {
      set({ error: `关卡加载失败: ${String(err)}`, loading: false });
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
    const { selectedActorId, selectedTargetId } = get();
    if (!selectedActorId) return;
    try {
      const events = await api.executeCommand(commandId, selectedActorId, selectedTargetId);
      // After executing, refresh the full state
      const state = await api.snapshot();
      set((prev) => ({
        worldState: state,
        recentEvents: [
          ...events.filter((e) => !('TickCompleted' in e)),
          ...prev.recentEvents,
        ].slice(0, 500),
      }));
      await get().refreshCommands();
    } catch (err) {
      set({ error: `命令执行失败: ${String(err)}` });
    }
  },

  doTick: async () => {
    try {
      const events = await api.tick(0.5);
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
    } catch (err) {
      set({ error: `速度设置失败: ${String(err)}` });
    }
  },

  startTickLoop: () => {
    const existing = get().tickIntervalId;
    if (existing != null) return;
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
