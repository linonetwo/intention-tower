/**
 * Lightweight level progress tracking with localStorage persistence.
 * Tracks which levels have been played, their max tick reached, and completion status.
 */
import { createStore, useStore } from 'zustand';

export interface LevelProgress {
  played: boolean;
  maxTick: number;
  completed: boolean;
}

interface ProgressState {
  levels: Record<string, LevelProgress>;
  markPlayed: (levelId: string) => void;
  updateTick: (levelId: string, tick: number) => void;
  markCompleted: (levelId: string) => void;
}

const STORAGE_KEY = 'intention-tower-progress';

function loadFromStorage(): Record<string, LevelProgress> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToStorage(levels: Record<string, LevelProgress>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  } catch {
    // Silently ignore storage errors
  }
}

export const progressStore = createStore<ProgressState>()((set) => ({
  levels: loadFromStorage(),

  markPlayed: (levelId) => {
    set((state) => {
      const existing = state.levels[levelId] ?? { played: false, maxTick: 0, completed: false };
      const next = { ...state.levels, [levelId]: { ...existing, played: true } };
      saveToStorage(next);
      return { levels: next };
    });
  },

  updateTick: (levelId, tick) => {
    set((state) => {
      const existing = state.levels[levelId] ?? { played: false, maxTick: 0, completed: false };
      if (tick <= existing.maxTick) return state;
      const next = { ...state.levels, [levelId]: { ...existing, played: true, maxTick: tick } };
      saveToStorage(next);
      return { levels: next };
    });
  },

  markCompleted: (levelId) => {
    set((state) => {
      const existing = state.levels[levelId] ?? { played: false, maxTick: 0, completed: false };
      const next = { ...state.levels, [levelId]: { ...existing, played: true, completed: true } };
      saveToStorage(next);
      return { levels: next };
    });
  },
}));

export function useLevelProgress<T>(selector: (state: ProgressState) => T): T {
  return useStore(progressStore, selector);
}
