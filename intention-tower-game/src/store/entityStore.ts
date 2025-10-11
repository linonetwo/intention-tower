/**
 * 角色和物品状态管理
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ActionQueueItem, Character, Item } from '../types/game';

interface EntityState {
  // 角色列表
  characters: Record<string, Character>;

  // 物品列表
  items: Record<string, Item>;

  // 动作队列
  actionQueue: ActionQueueItem[];
}

interface EntityActions {
  // 角色管理
  addCharacter: (character: Character) => void;
  removeCharacter: (id: string) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  getCharacter: (id: string) => Character | undefined;

  // 物品管理
  addItem: (item: Item) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;

  // 动作队列
  addAction: (action: ActionQueueItem) => void;
  removeAction: (id: string) => void;
  updateAction: (id: string, updates: Partial<ActionQueueItem>) => void;
  clearActionQueue: (characterId?: string) => void;

  // 批量操作
  setCharacters: (characters: Character[]) => void;
  setItems: (items: Item[]) => void;

  // 重置
  reset: () => void;
}

const initialState: EntityState = {
  characters: {},
  items: {},
  actionQueue: [],
};

export const useEntityStore = create<EntityState & EntityActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      addCharacter: (character) =>
        set((state) => ({
          characters: { ...state.characters, [character.id]: character },
        })),

      removeCharacter: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.characters;
          return { characters: rest };
        }),

      updateCharacter: (id, updates) =>
        set((state) => {
          const character = state.characters[id];
          if (!character) return state;
          return {
            characters: {
              ...state.characters,
              [id]: { ...character, ...updates },
            },
          };
        }),

      getCharacter: (id) => get().characters[id],

      addItem: (item) =>
        set((state) => ({
          items: { ...state.items, [item.id]: item },
        })),

      removeItem: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.items;
          return { items: rest };
        }),

      updateItem: (id, updates) =>
        set((state) => {
          const item = state.items[id];
          if (!item) return state;
          return {
            items: {
              ...state.items,
              [id]: { ...item, ...updates },
            },
          };
        }),

      addAction: (action) =>
        set((state) => ({
          actionQueue: [...state.actionQueue, action],
        })),

      removeAction: (id) =>
        set((state) => ({
          actionQueue: state.actionQueue.filter((a) => a.id !== id),
        })),

      updateAction: (id, updates) =>
        set((state) => ({
          actionQueue: state.actionQueue.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      clearActionQueue: (characterId) =>
        set((state) => ({
          actionQueue: characterId ? state.actionQueue.filter((a) => a.characterId !== characterId) : [],
        })),

      setCharacters: (characters) =>
        set({
          characters: characters.reduce(
            (acc, char) => {
              acc[char.id] = char;
              return acc;
            },
            {} as Record<string, Character>,
          ),
        }),

      setItems: (items) =>
        set({
          items: items.reduce(
            (acc, item) => {
              acc[item.id] = item;
              return acc;
            },
            {} as Record<string, Item>,
          ),
        }),

      reset: () => set(initialState),
    }),
    { name: 'entity-store' },
  ),
);
