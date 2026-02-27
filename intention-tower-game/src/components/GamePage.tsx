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
import React, { useEffect, useState } from 'react';
import { Box, Paper, Snackbar, Alert, useMediaQuery, Tabs, Tab } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameState, gameStore } from '../store/useGameState';
import { progressStore } from '../store/useLevelProgress';
import { TimeControls } from './panels/TimeControls';
import { WorldPanel } from './panels/WorldPanel';
import { MindGraphPanel } from './panels/MindGraphPanel';
import { CommandPanel } from './panels/CommandPanel';
import { EventLog } from './panels/EventLog';
import { TutorialGuidePanel } from './panels/TutorialGuidePanel';

export const GamePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const worldState = useGameState((s) => s.worldState);
  const error = useGameState((s) => s.error);
  const clearError = useGameState((s) => s.clearError);
  const setTimeSpeed = useGameState((s) => s.setTimeSpeed);
  const uiMode = useGameState((s) => s.uiMode);
  const currentLevelId = useGameState((s) => s.currentLevelId);

  // Responsive breakpoints: mobile < 768, tablet < 1024
  const isMobile = useMediaQuery('(max-width:767px)');
  const isTablet = useMediaQuery('(min-width:768px) and (max-width:1023px)');
  const [mobileTab, setMobileTab] = useState(1); // default to graph tab on mobile

  // Track level progress
  useEffect(() => {
    if (currentLevelId) {
      progressStore.getState().markPlayed(currentLevelId);
    }
  }, [currentLevelId]);

  useEffect(() => {
    const tick = worldState?.tick;
    if (currentLevelId && tick != null && tick > 0) {
      progressStore.getState().updateTick(currentLevelId, tick);
    }
  }, [currentLevelId, worldState?.tick]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      // ESC → back to menu
      if (key === 'escape') {
        gameStore.getState().reset();
        navigate('/');
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

      // Ctrl+S → quick save
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        gameStore.getState().saveGame();
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
  }, [navigate, setTimeSpeed]);

  useEffect(() => {
    if (!worldState) {
      navigate('/');
    }
  }, [navigate, worldState]);

  // Cleanup tick loop on unmount
  useEffect(() => {
    return () => {
      gameStore.getState().stopTickLoop();
    };
  }, []);

  return (
    <Box sx={{
      width: '100vw', height: '100dvh',
      display: 'flex', flexDirection: 'column',
      bgcolor: '#0e0e1a', color: '#ddd',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <TimeControls />

      {/* Tutorial guide (only visible in tutorial levels) */}
      <TutorialGuidePanel />

      {/* ─── Mobile layout: tab-based ─── */}
      {isMobile && (
        <>
          <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            {mobileTab === 0 && <WorldPanel />}
            {mobileTab === 1 && <MindGraphPanel />}
            {mobileTab === 2 && <CommandPanel />}
            {mobileTab === 3 && <EventLog />}
          </Box>
          <Tabs
            value={mobileTab}
            onChange={(_, v) => setMobileTab(v)}
            variant='fullWidth'
            sx={{
              minHeight: 40,
              bgcolor: '#141428',
              borderTop: '1px solid #2a2a4e',
              '& .MuiTab-root': {
                minHeight: 40, fontSize: 10, textTransform: 'none',
                color: '#888', py: 0.5,
              },
              '& .Mui-selected': { color: '#c5cae9 !important' },
              '& .MuiTabs-indicator': { bgcolor: '#536dfe' },
            }}
          >
            <Tab icon={<PublicIcon sx={{ fontSize: 16 }} />} label={t('game.mobileTab.world')} />
            <Tab icon={<AccountTreeIcon sx={{ fontSize: 16 }} />} label={t('game.mobileTab.graph')} />
            <Tab icon={<SportsEsportsIcon sx={{ fontSize: 16 }} />} label={t('game.mobileTab.cmd')} />
            <Tab icon={<FormatListBulletedIcon sx={{ fontSize: 16 }} />} label={t('game.mobileTab.log')} />
          </Tabs>
        </>
      )}

      {/* ─── Tablet layout: 2-panel (world+graph or graph+cmd) + bottom log ─── */}
      {isTablet && (
        <>
          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            {uiMode !== 'graph' && (
              <Paper elevation={0} sx={{ width: 220, flexShrink: 0, bgcolor: '#141428', borderRight: '1px solid #2a2a4e', overflow: 'hidden' }}>
                <WorldPanel />
              </Paper>
            )}
            <Paper elevation={0} sx={{ flex: 1, bgcolor: '#0e0e1a', overflow: 'hidden' }}>
              <MindGraphPanel />
            </Paper>
            {uiMode !== 'graph' && (
              <Paper elevation={0} sx={{ width: 200, flexShrink: 0, bgcolor: '#141428', borderLeft: '1px solid #2a2a4e', overflow: 'hidden' }}>
                <CommandPanel />
              </Paper>
            )}
          </Box>
          <Paper elevation={0} sx={{ height: 130, flexShrink: 0, bgcolor: '#0a0a16', borderTop: '1px solid #2a2a4e', overflow: 'hidden' }}>
            <EventLog />
          </Paper>
        </>
      )}

      {/* ─── Desktop layout: full 3-panel + bottom log ─── */}
      {!isMobile && !isTablet && (
        <>
          <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
            {uiMode !== 'graph' && (
              <Paper
                elevation={0}
                sx={{
                  width: uiMode === 'micro' ? 270 : 240,
                  flexShrink: 0,
                  bgcolor: '#141428',
                  borderRight: '1px solid #2a2a4e',
                  overflow: 'hidden',
                }}
              >
                <WorldPanel />
              </Paper>
            )}
            <Paper elevation={0} sx={{ flex: 1, bgcolor: '#0e0e1a', overflow: 'hidden' }}>
              <MindGraphPanel />
            </Paper>
            {uiMode !== 'graph' && (
              <Paper
                elevation={0}
                sx={{
                  width: uiMode === 'micro' ? 280 : 220,
                  flexShrink: 0,
                  bgcolor: '#141428',
                  borderLeft: '1px solid #2a2a4e',
                  overflow: 'hidden',
                }}
              >
                <CommandPanel />
              </Paper>
            )}
          </Box>
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
        </>
      )}

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
