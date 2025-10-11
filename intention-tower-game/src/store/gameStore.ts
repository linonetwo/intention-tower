/**
 * 游戏核心状态管理
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { GameMode, Position, TimeSpeed } from '../types/game';

interface GameState {
  // 当前模式
  mode: GameMode;

  // 时间流速
  timeSpeed: TimeSpeed;

  // 当前关卡ID
  currentLevelId: string | null;

  // 摄像机位置（观察模式）
  cameraPosition: Position;

  // 选中的角色ID列表
  selectedCharacterIds: string[];

  // 当前查看详情的角色ID
  detailCharacterId: string | null;

  // 最近查看的角色历史
  recentCharacterIds: string[];

  // 控制的角色ID（微操模式）
  controlledCharacterId: string | null;

  // 是否显示命令菜单
  showCommandMenu: boolean;
  commandMenuPosition: Position | null;
  commandMenuTargetId: string | null;

  // 当前教学步骤
  currentTutorialStep: number;
  tutorialVisible: boolean;
}

interface GameActions {
  // 模式切换
  setMode: (mode: GameMode) => void;

  // 时间控制
  setTimeSpeed: (speed: TimeSpeed) => void;

  // 关卡
  setCurrentLevel: (levelId: string) => void;

  // 摄像机
  moveCamera: (delta: Position) => void;
  setCameraPosition: (position: Position) => void;

  // 角色选择
  selectCharacter: (id: string, multiSelect?: boolean) => void;
  deselectCharacter: (id: string) => void;
  clearSelection: () => void;

  // 详情面板
  openCharacterDetail: (id: string) => void;
  closeCharacterDetail: () => void;
  switchToRecentCharacter: (direction: 'prev' | 'next') => void;

  // 微操模式
  setControlledCharacter: (id: string | null) => void;

  // 命令菜单
  openCommandMenu: (position: Position, targetId: string) => void;
  closeCommandMenu: () => void;

  // 教学
  nextTutorialStep: () => void;
  setTutorialStep: (step: number) => void;
  showTutorial: () => void;
  hideTutorial: () => void;

  // 重置
  reset: () => void;
}

const initialState: GameState = {
  mode: 'menu',
  timeSpeed: 1,
  currentLevelId: null,
  cameraPosition: { x: 0, y: 0 },
  selectedCharacterIds: [],
  detailCharacterId: null,
  recentCharacterIds: [],
  controlledCharacterId: null,
  showCommandMenu: false,
  commandMenuPosition: null,
  commandMenuTargetId: null,
  currentTutorialStep: 0,
  tutorialVisible: false,
};

export const useGameStore = create<GameState & GameActions>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setMode: (mode) => set({ mode }),

        setTimeSpeed: (speed) => set({ timeSpeed: speed }),

        setCurrentLevel: (levelId) => set({ currentLevelId: levelId }),

        moveCamera: (delta) =>
          set((state) => ({
            cameraPosition: {
              x: state.cameraPosition.x + delta.x,
              y: state.cameraPosition.y + delta.y,
            },
          })),

        setCameraPosition: (position) => set({ cameraPosition: position }),

        selectCharacter: (id, multiSelect = false) =>
          set((state) => {
            if (multiSelect) {
              if (state.selectedCharacterIds.includes(id)) {
                return state;
              }
              return {
                selectedCharacterIds: [...state.selectedCharacterIds, id],
              };
            }
            return { selectedCharacterIds: [id] };
          }),

        deselectCharacter: (id) =>
          set((state) => ({
            selectedCharacterIds: state.selectedCharacterIds.filter(cid => cid !== id),
          })),

        clearSelection: () => set({ selectedCharacterIds: [] }),

        openCharacterDetail: (id) =>
          set((state) => {
            const recent = [id, ...state.recentCharacterIds.filter(rid => rid !== id)].slice(0, 10);
            return {
              detailCharacterId: id,
              recentCharacterIds: recent,
            };
          }),

        closeCharacterDetail: () => set({ detailCharacterId: null }),

        switchToRecentCharacter: (direction) =>
          set((state) => {
            if (state.recentCharacterIds.length === 0) return state;

            const currentIndex = state.recentCharacterIds.indexOf(state.detailCharacterId || '');
            let nextIndex: number;

            if (direction === 'prev') {
              nextIndex = currentIndex <= 0 ? state.recentCharacterIds.length - 1 : currentIndex - 1;
            } else {
              nextIndex = currentIndex >= state.recentCharacterIds.length - 1 ? 0 : currentIndex + 1;
            }

            return { detailCharacterId: state.recentCharacterIds[nextIndex] };
          }),

        setControlledCharacter: (id) => set({ controlledCharacterId: id }),

        openCommandMenu: (position, targetId) =>
          set({
            showCommandMenu: true,
            commandMenuPosition: position,
            commandMenuTargetId: targetId,
          }),

        closeCommandMenu: () =>
          set({
            showCommandMenu: false,
            commandMenuPosition: null,
            commandMenuTargetId: null,
          }),

        nextTutorialStep: () =>
          set((state) => ({
            currentTutorialStep: state.currentTutorialStep + 1,
          })),

        setTutorialStep: (step) => set({ currentTutorialStep: step }),

        showTutorial: () => set({ tutorialVisible: true }),

        hideTutorial: () => set({ tutorialVisible: false }),

        reset: () => set(initialState),
      }),
      {
        name: 'game-store',
        partialize: (state) => ({
          currentLevelId: state.currentLevelId,
          currentTutorialStep: state.currentTutorialStep,
        }),
      },
    ),
  ),
);
