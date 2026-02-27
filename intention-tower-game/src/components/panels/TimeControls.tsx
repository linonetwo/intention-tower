/**
 * TimeControls — top bar controls for time speed, pause, step, tick count, save, and back.
 */
import React, { useState } from 'react';
import {
  Box, Typography, IconButton, ToggleButtonGroup, ToggleButton, Chip, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import FlashAutoIcon from '@mui/icons-material/FlashAuto';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../../store/useGameState';
import { allLevels } from '../../data/levels/allLevels';
import { t as translateLabel } from '../../i18n';
import { SaveManager } from './SaveManager';

export const TimeControls: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const worldState = useGameState((s) => s.worldState);
  const currentLevelId = useGameState((s) => s.currentLevelId);
  const setTimeSpeed = useGameState((s) => s.setTimeSpeed);
  const stepTick = useGameState((s) => s.stepTick);
  const autoStepOnCommand = useGameState((s) => s.autoStepOnCommand);
  const setAutoStepOnCommand = useGameState((s) => s.setAutoStepOnCommand);
  const uiMode = useGameState((s) => s.uiMode);
  const setUiMode = useGameState((s) => s.setUiMode);
  const reset = useGameState((s) => s.reset);
  const [saveOpen, setSaveOpen] = useState(false);
  const [stepping, setStepping] = useState(false);

  const tick = worldState?.tick ?? 0;
  const speed = worldState?.time_speed ?? 0;
  const paused = worldState?.paused ?? true;

  const levelMeta = allLevels.find((l) => l.id === currentLevelId);
  const levelName = levelMeta?.id ? translateLabel(`level.${levelMeta.id}.name`) : (currentLevelId ?? t('game.unknownLevel'));

  const handleSpeedChange = (_: React.MouseEvent, newSpeed: number | null) => {
    if (newSpeed != null) setTimeSpeed(newSpeed);
  };

  const handleModeChange = (_: React.MouseEvent, mode: 'observe' | 'micro' | 'graph' | null) => {
    if (mode) setUiMode(mode);
  };

  const handleStep = async () => {
    if (stepping) return;
    setStepping(true);
    try {
      await stepTick();
    } finally {
      setStepping(false);
    }
  };

  return (
    <>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 },
        px: { xs: 1, sm: 2 }, py: 0.5,
        bgcolor: '#1a1a2e',
        borderBottom: '1px solid #2a2a4e',
        minHeight: 44,
        flexWrap: 'wrap',
        overflow: 'hidden',
      }}>
        {/* Back button */}
        <Tooltip title={t('game.backToMenu')} arrow>
          <IconButton size="small" onClick={() => { reset(); navigate('/'); }} sx={{ color: '#aaa' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Level name */}
        <Typography sx={{ fontSize: { xs: 12, sm: 14 }, fontWeight: 600, color: '#ddd', mx: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 80, sm: 200 } }}>
          {levelName}
        </Typography>

        {/* Tick counter */}
        <Chip
          label={`T${tick}`}
          size="small"
          sx={{ height: 22, fontSize: 11, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.05)' }}
        />

        {/* Save button */}
        <Tooltip title={t('save.title')} arrow>
          <IconButton size="small" onClick={() => setSaveOpen(true)} sx={{ color: '#aaa' }}>
            <SaveIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* UI Mode selector — hidden on mobile (bottom tabs replace it) */}
        <ToggleButtonGroup
          value={uiMode}
          exclusive
          onChange={handleModeChange}
          size='small'
          sx={{
            mr: 1,
            display: { xs: 'none', sm: 'flex' },
            '& .MuiToggleButton-root': {
              color: '#8aa0b4', borderColor: '#2f3540',
              fontSize: 11, textTransform: 'none', px: 0.9, py: 0.25,
              '&.Mui-selected': { color: '#fff', bgcolor: 'rgba(83,109,254,0.28)' },
            },
          }}
        >
          <ToggleButton value='observe'>{t('mode.observe')}</ToggleButton>
          <ToggleButton value='micro'>{t('mode.micro')}</ToggleButton>
          <ToggleButton value='graph'>{t('mode.graph')}</ToggleButton>
        </ToggleButtonGroup>

        {/* Single-step button — only visible when paused */}
        {paused && (
          <>
            <Tooltip title={t('game.autoStep')} arrow>
              <IconButton
                size="small"
                onClick={() => setAutoStepOnCommand(!autoStepOnCommand)}
                sx={{
                  color: autoStepOnCommand ? '#90caf9' : '#555',
                  borderColor: autoStepOnCommand ? '#536dfe' : '#333',
                  border: '1px solid',
                  borderRadius: 1,
                  mx: 0.25,
                  transition: 'all 0.2s',
                  bgcolor: autoStepOnCommand ? 'rgba(83,109,254,0.18)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(100,100,255,0.15)', color: '#fff' },
                }}
              >
                <FlashAutoIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('game.stepTick')} arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={handleStep}
                  disabled={stepping}
                  data-tutorial="step-button"
                  sx={{
                    color: '#888',
                    borderColor: '#333',
                    border: '1px solid #333',
                    borderRadius: 1,
                    mx: 0.25,
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: 'rgba(100,100,255,0.15)', color: '#fff' },
                  }}
                >
                  <SkipNextIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}

        {/* Speed controls */}
        <ToggleButtonGroup
          value={speed}
          exclusive
          onChange={handleSpeedChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: '#888', borderColor: '#333',
              fontSize: 12, py: 0.25, px: 1,
              '&.Mui-selected': { color: '#fff', bgcolor: 'rgba(100,100,255,0.2)' },
            },
          }}
        >
          <ToggleButton value={0}>
            <PauseIcon sx={{ fontSize: 14 }} />
          </ToggleButton>
          <ToggleButton value={1}>1×</ToggleButton>
          <ToggleButton value={2}>2×</ToggleButton>
          <ToggleButton value={3}>3×</ToggleButton>
          <ToggleButton value={4}>4×</ToggleButton>
        </ToggleButtonGroup>

        {/* Paused badge */}
        {paused && (
          <Chip
            icon={<PauseIcon sx={{ fontSize: 12 }} />}
            label={t('game.paused')}
            size="small"
            color="warning"
            sx={{ height: 20, fontSize: 10, ml: 0.5 }}
          />
        )}
      </Box>

      <SaveManager open={saveOpen} onClose={() => setSaveOpen(false)} />
    </>
  );
};
