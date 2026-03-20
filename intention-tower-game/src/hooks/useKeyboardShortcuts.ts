/**
 * useKeyboardShortcuts — unified keyboard shortcut handler.
 * Dispatches keys based on current UiMode (observe / micro / graph).
 */
import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameStore } from '../store/useGameState';
import type { UiMode } from '../store/useGameState';
import { modAssetsStore } from '../store/useModAssets';

/**
 * Mode-cycle order: observe → micro → graph → observe
 */
const MODE_CYCLE: UiMode[] = ['observe', 'micro', 'graph'];

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if user is typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) return;

    const key = e.key.toLowerCase();
    const state = gameStore.getState();
    const { uiMode } = state;

    // ── Global shortcuts (all modes) ──

    // ESC: if in graph mode → back to observe; else → menu
    if (key === 'escape') {
      if (uiMode === 'graph') {
        state.setUiMode('observe');
      } else {
        state.reset();
        navigate('/');
      }
      return;
    }

    // Tab: cycle mode
    if (key === 'tab') {
      e.preventDefault();
      const idx = MODE_CYCLE.indexOf(uiMode);
      const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
      state.setUiMode(next);
      return;
    }

    // F1/F2/F3: direct mode switch
    if (key === 'f1') { e.preventDefault(); state.setUiMode('observe'); return; }
    if (key === 'f2') { e.preventDefault(); state.setUiMode('micro'); return; }
    if (key === 'f3') { e.preventDefault(); state.setUiMode('graph'); return; }

    // Space → toggle pause (all modes)
    if (key === ' ') {
      e.preventDefault();
      const speed = state.worldState?.time_speed ?? 1;
      state.setTimeSpeed(speed === 0 ? 1 : 0);
      return;
    }

    // 0-4 → speed control
    if (['1', '2', '3', '4'].includes(key)) { state.setTimeSpeed(parseInt(key)); return; }
    if (key === '0') { state.setTimeSpeed(0); return; }

    // Ctrl+S → quick save
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      state.saveGame();
      return;
    }

    // Ctrl+Shift+R → reload mod textures
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'r') {
      e.preventDefault();
      void modAssetsStore.getState().reload();
      return;
    }

    // Alt+Left/Right: switch actor
    if (e.altKey && (key === 'arrowleft' || key === 'arrowright')) {
      e.preventDefault();
      const ws = state.worldState;
      if (!ws) return;
      const charIds = Object.keys(ws.characters);
      if (charIds.length === 0) return;
      const currentIdx = charIds.indexOf(state.selectedActorId ?? '');
      const delta = key === 'arrowright' ? 1 : -1;
      const nextIdx = (currentIdx + delta + charIds.length) % charIds.length;
      state.selectActor(charIds[nextIdx]);
      state.inspectCharacter(charIds[nextIdx]);
      return;
    }

    // ── Mode-specific shortcuts ──

    if (uiMode === 'observe') {
      // Hotkey-based command execution
      const cmds = state.availableCommands;
      const match = cmds.find((c) => c.hotkey?.toLowerCase() === key);
      if (match) {
        state.executeCommand(match.command_id);
        return;
      }
    }

    if (uiMode === 'micro') {
      // 1-4 also mapped to skill slots (first 4 commands)
      // Already handled by speed above; micro mode uses qwer for skills
      const skillKeys = ['q', 'w', 'e', 'r'];
      const skillIdx = skillKeys.indexOf(key);
      if (skillIdx >= 0) {
        const cmds = state.availableCommands;
        if (cmds[skillIdx]) {
          state.executeCommand(cmds[skillIdx].command_id);
        }
        return;
      }
    }

    if (uiMode === 'graph') {
      // Graph mode: qwer for graph operations (reserved for future)
    }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
