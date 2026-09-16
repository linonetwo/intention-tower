/**
 * GamePage — map-centric game interface with PixiJS scene and HUD overlays.
 *
 * Layout (desktop):
 * ┌──────────────────────────────────────────────────────────┐
 * │ TimeControlsHud (floating top bar)                       │
 * ├──────────┬───────────────────────────────────────────────┤
 * │ ActorBar │  PixiJS Canvas (full screen)      MiniMap ┐  │
 * │  (left)  │                                           │  │
 * │          │  CharacterPortrait      CharacterPortrait  │  │
 * │          │  (left actor)           (right target)     │  │
 * │          ├───────────────────────────────────────────┘  │
 * │          │  DialogueBox (bottom, Galgame-style)         │
 * └──────────┴──────────────────────────────────────────────┘
 *
 * Graph mode: MindGraphOverlay covers everything (semi-transparent)
 * Mobile: No side bars, top status bar, bottom dialogue, graph as overlay.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Snackbar, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useGameState, gameStore } from '../store/useGameState';
import { progressStore } from '../store/useLevelProgress';

// HUD components
import { TimeControlsHud } from './hud/TimeControlsHud';
import { ActorStatusBar } from './hud/ActorStatusBar';
import { MiniMapHud } from './hud/MiniMapHud';
import { DialogueBox } from './hud/DialogueBox';
import { MobileStatusBar } from './hud/MobileStatusBar';
import { ObjectiveHud } from './hud/ObjectiveHud';
import { MicroControlPad } from './hud/MicroControlPad';
import { EconomyHud } from './hud/EconomyHud';

// Overlay components
import { MindGraphOverlay } from './overlay/MindGraphOverlay';
import { CharacterPortrait } from './overlay/CharacterPortrait';
import { SceneContextMenu } from './overlay/SceneContextMenu';
import { LevelOutcomeOverlay } from './overlay/LevelOutcomeOverlay';

// Scene
import { GameScene } from './scene/GameScene';

// Tutorial
import { TutorialGuidePanel } from './panels/TutorialGuidePanel';

// Hooks
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { modAssetsStore } from '../store/useModAssets';

export const GamePage: React.FC = () => {
  const navigate = useNavigate();
  useResponsiveLayout(); // initialize layout detection
  const worldState = useGameState((s) => s.worldState);
  const error = useGameState((s) => s.error);
  const clearError = useGameState((s) => s.clearError);
  const currentLevelId = useGameState((s) => s.currentLevelId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Unified keyboard shortcuts
  useKeyboardShortcuts();

  // Track level progress
  useEffect(() => {
    if (currentLevelId) {
      progressStore.getState().markPlayed(currentLevelId);
    }
  }, [currentLevelId]);

  useEffect(() => {
    modAssetsStore.getState().init();
  }, []);

  useEffect(() => {
    const tick = worldState?.tick;
    if (currentLevelId && tick != null && tick > 0) {
      progressStore.getState().updateTick(currentLevelId, tick);
    }
  }, [currentLevelId, worldState?.tick]);

  useEffect(() => {
    if (currentLevelId && worldState?.progress.status === 'Won') {
      progressStore.getState().markCompleted(currentLevelId);
    }
  }, [currentLevelId, worldState?.progress.status]);

  // Redirect if no world state
  useEffect(() => {
    if (!worldState) navigate('/');
  }, [navigate, worldState]);

  // Cleanup tick loop on unmount
  useEffect(() => {
    return () => { gameStore.getState().stopTickLoop(); };
  }, []);

  // Resize canvas to fill container
  const updateSize = useCallback(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setCanvasSize({ width: clientWidth, height: clientHeight });
    }
  }, []);

  useEffect(() => {
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateSize]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100vw',
        height: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: '#0e0e1a',
        color: '#ddd',
      }}
    >
      {/* ── Layer 0: PixiJS Scene (full screen canvas) ── */}
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <GameScene width={canvasSize.width} height={canvasSize.height} />
      </Box>

      {/* ── Layer 1: HUD overlay (pointer-events: none container) ── */}
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
        {/* Top bar */}
        <TimeControlsHud />

        {/* Left status bar (desktop/tablet) */}
        <ActorStatusBar />

        {/* Mini-map (desktop/tablet) */}
        <MiniMapHud />

        {/* Mobile status bar */}
        <MobileStatusBar />

        {/* Backend-driven level goals */}
        <ObjectiveHud />

        {/* Touch movement in micro-control mode */}
        <MicroControlPad />

        {/* Data-driven economy appears only in levels with authored assets */}
        <EconomyHud />

        {/* Character portraits */}
        <CharacterPortrait />

        {/* Dialogue box (bottom) */}
        <DialogueBox />
      </Box>

      {/* ── Layer 2: Graph overlay (when graph mode active) ── */}
      <MindGraphOverlay />

      {/* ── Layer 3: Context menus ── */}
      <SceneContextMenu />

      {/* ── Terminal level result ── */}
      <LevelOutcomeOverlay />

      {/* ── Tutorial guide ── */}
      <TutorialGuidePanel />

      {/* ── Error snackbar ── */}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={clearError}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={clearError} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};
