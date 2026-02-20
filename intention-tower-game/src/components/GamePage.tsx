/**
 * GamePage — main game interface with 3-panel layout.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │ TimeControls (back, level name, tick, speed)             │
 * ├─────────────┬──────────────────────┬─────────────────────┤
 * │ WorldPanel  │   MindGraphPanel     │   CommandPanel      │
 * │ (chars,     │   (selected char's   │   (available cmds)  │
 * │  items,     │    nodes & edges)    │                     │
 * │  selectors) │                      │                     │
 * ├─────────────┴──────────────────────┴─────────────────────┤
 * │ EventLog (recent events)                                 │
 * └──────────────────────────────────────────────────────────┘
 */
import React, { useEffect } from 'react';
import { Box, Paper, Snackbar, Alert } from '@mui/material';
import { useGameState, gameStore } from '../store/useGameState';
import { TimeControls } from './panels/TimeControls';
import { WorldPanel } from './panels/WorldPanel';
import { MindGraphPanel } from './panels/MindGraphPanel';
import { CommandPanel } from './panels/CommandPanel';
import { EventLog } from './panels/EventLog';

export const GamePage: React.FC = () => {
  const error = useGameState((s) => s.error);
  const clearError = useGameState((s) => s.clearError);
  const setTimeSpeed = useGameState((s) => s.setTimeSpeed);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      // ESC → back to menu
      if (key === 'escape') {
        gameStore.getState().reset();
        return;
      }

      // Space → toggle pause
      if (key === ' ') {
        e.preventDefault();
        const speed = gameStore.getState().worldState?.time_speed ?? 1;
        setTimeSpeed(speed === 0 ? 1 : 0);
        return;
      }

      // 1-4 → speed
      if (['1', '2', '3', '4'].includes(key)) {
        setTimeSpeed(parseInt(key));
        return;
      }

      // 0 → pause
      if (key === '0') {
        setTimeSpeed(0);
        return;
      }

      // Hotkey-based command execution
      const cmds = gameStore.getState().availableCommands;
      const match = cmds.find((c) => c.hotkey?.toLowerCase() === key);
      if (match) {
        gameStore.getState().executeCommand(match.command_id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTimeSpeed]);

  // Cleanup tick loop on unmount
  useEffect(() => {
    return () => {
      gameStore.getState().stopTickLoop();
    };
  }, []);

  return (
    <Box sx={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'column',
      bgcolor: '#0e0e1a', color: '#ddd',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <TimeControls />

      {/* Main 3-panel area */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: World Panel */}
        <Paper
          elevation={0}
          sx={{
            width: 240, flexShrink: 0,
            bgcolor: '#141428',
            borderRight: '1px solid #2a2a4e',
            overflow: 'hidden',
          }}
        >
          <WorldPanel />
        </Paper>

        {/* Center: Mind Graph */}
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            bgcolor: '#0e0e1a',
            overflow: 'hidden',
          }}
        >
          <MindGraphPanel />
        </Paper>

        {/* Right: Commands */}
        <Paper
          elevation={0}
          sx={{
            width: 220, flexShrink: 0,
            bgcolor: '#141428',
            borderLeft: '1px solid #2a2a4e',
            overflow: 'hidden',
          }}
        >
          <CommandPanel />
        </Paper>
      </Box>

      {/* Bottom: Event Log */}
      <Paper
        elevation={0}
        sx={{
          height: 160, flexShrink: 0,
          bgcolor: '#0a0a16',
          borderTop: '1px solid #2a2a4e',
          overflow: 'hidden',
        }}
      >
        <EventLog />
      </Paper>

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={clearError} sx={{ fontSize: 12 }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};
