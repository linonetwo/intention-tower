/**
 * UI 状态管理
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Ability, MemoryNode, Tutorial } from '../types/game';

interface UIState {
  // 左侧详情面板
  detailPanelWidth: number;
  detailPanelTab: 'working-memory' | 'graph' | 'inventory' | 'attributes';

  // 右下角操作提示
  memoryReview: MemoryNode[];
  currentReviewIndex: number;

  // 技能快捷栏
  abilities: Ability[];

  // 教学系统
  tutorials: Tutorial[];
  currentTutorial: Tutorial | null;

  // 对话和选项
  dialogueText: string | null;
  dialogueCharacter: string | null; // 角色立绘

  // Galgame风格背景
  backgroundImage: string | null;

  // 加载状态
  isLoading: boolean;
  loadingMessage: string;
}

interface UIActions {
  // 详情面板
  setDetailPanelWidth: (width: number) => void;
  setDetailPanelTab: (tab: 'working-memory' | 'graph' | 'inventory' | 'attributes') => void;

  // 间隔重复系统
  addMemoryNode: (node: MemoryNode) => void;
  reviewMemory: (id: string) => void;
  updateMemoryReview: () => void;
  nextReview: () => void;

  // 技能系统
  setAbilities: (abilities: Ability[]) => void;
  updateAbilityCooldown: (id: string, cooldown: number) => void;
  useAbility: (id: string) => void;

  // 教学系统
  setTutorials: (tutorials: Tutorial[]) => void;
  showTutorial: (tutorial: Tutorial) => void;
  hideTutorial: () => void;

  // 对话系统
  showDialogue: (text: string, character?: string) => void;
  hideDialogue: () => void;

  // 背景
  setBackground: (image: string | null) => void;

  // 加载状态
  setLoading: (loading: boolean, message?: string) => void;

  // 重置
  reset: () => void;
}

const initialState: UIState = {
  detailPanelWidth: 400,
  detailPanelTab: 'working-memory',
  memoryReview: [],
  currentReviewIndex: 0,
  abilities: [],
  tutorials: [],
  currentTutorial: null,
  dialogueText: null,
  dialogueCharacter: null,
  backgroundImage: null,
  isLoading: false,
  loadingMessage: '',
};

export const useUIStore = create<UIState & UIActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setDetailPanelWidth: (width) => {
        set({ detailPanelWidth: width });
      },

      setDetailPanelTab: (tab) => {
        set({ detailPanelTab: tab });
      },

      addMemoryNode: (node) => {
        set((state) => ({
          memoryReview: [...state.memoryReview, node].sort((a, b) => a.nextReview - b.nextReview).slice(0, 5),
        }));
      },

      reviewMemory: (id) => {
        set((state) => {
          const updated = state.memoryReview.map((node) => {
            if (node.id !== id) return node;

            const now = Date.now();
            const newInterval = Math.min(node.interval * 2, 30); // 最多30天
            const nextReview = now + newInterval * 24 * 60 * 60 * 1000;

            return {
              ...node,
              lastReview: now,
              nextReview,
              interval: newInterval,
              reviewCount: node.reviewCount + 1,
            };
          });

          return {
            memoryReview: updated.sort((a, b) => a.nextReview - b.nextReview),
          };
        });
      },

      updateMemoryReview: () => {
        set((state) => {
          const now = Date.now();
          const review = state.memoryReview.filter((node) => node.nextReview <= now).slice(0, 5);
          return { memoryReview: review };
        });
      },

      nextReview: () => {
        set((state) => ({
          currentReviewIndex: (state.currentReviewIndex + 1) % Math.max(1, state.memoryReview.length),
        }));
      },

      setAbilities: (abilities) => {
        set({ abilities });
      },

      updateAbilityCooldown: (id, cooldown) => {
        set((state) => ({
          abilities: state.abilities.map((ability) =>
            ability.id === id ? { ...ability, currentCooldown: cooldown } : ability,
          ),
        }));
      },

      useAbility: (id) => {
        set((state) => {
          const ability = state.abilities.find((a) => a.id === id);
          if (!ability || (ability.currentCooldown ?? 0) > 0) return state;

          return {
            abilities: state.abilities.map((a) =>
              a.id === id ? { ...a, currentCooldown: ability.cooldown ?? 0 } : a,
            ),
          };
        });
      },

      setTutorials: (tutorials) => {
        set({ tutorials });
      },

      showTutorial: (tutorial) => {
        set({ currentTutorial: tutorial });
      },

      hideTutorial: () => {
        set({ currentTutorial: null });
      },

      showDialogue: (text, character) => {
        set({ dialogueText: text, dialogueCharacter: character ?? null });
      },

      hideDialogue: () => {
        set({ dialogueText: null, dialogueCharacter: null });
      },

      setBackground: (image) => {
        set({ backgroundImage: image });
      },

      setLoading: (loading, message = '') => {
        set({ isLoading: loading, loadingMessage: message });
      },

      reset: () => {
        set(initialState);
      },
    }),
    { name: 'ui-store' },
  ),
);
