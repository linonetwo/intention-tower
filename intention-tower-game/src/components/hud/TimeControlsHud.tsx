/**
 * TimeControlsHud — floating top-bar HUD for time/mode control.
 * Transparent background, overlays the scene.
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
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../../store/useGameState';
import { allLevels } from '../../data/levels/allLevels';
import { translateLabel } from '../../i18n';
import { SaveManager } from '../panels/SaveManager';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useModAssets } from '../../store/useModAssets';

export const TimeControlsHud: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
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
  const reloadMods = useModAssets((s) => s.reload);
  const modLoading = useModAssets((s) => s.loading);

  const tick = worldState?.tick ?? 0;
  const speed = worldState?.time_speed ?? 0;
  const paused = worldState?.paused ?? true;

  const levelMeta = allLevels.find((l) => l.id === currentLevelId);
  const levelName = levelMeta?.id ? translateLabel(`level.${levelMeta.id}.name`) : (currentLevelId ?? t('game.unknownLevel'));

  const handleSpeedChange = (_: React.MouseEvent, newSpeed: number | null) => {
    if (newSpeed != null) setTimeSpeed(newSpeed);
  };

  const handleStep = async () => {
    if (stepping) return;
    setStepping(true);
    try { await stepTick(); } finally { setStepping(false); }
  };

  const modeIcons: Record<string, React.ReactElement> = {
    observe: <VisibilityIcon sx={{ fontSize: 15 }} />,
    micro: <GpsFixedIcon sx={{ fontSize: 15 }} />,
    graph: <AccountTreeIcon sx={{ fontSize: 15 }} />,
  };

  return (
    <>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: layout.isMobile ? 0.5 : 1.5,
          bgcolor: 'rgba(26,26,46,0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(42,42,78,0.5)',
          zIndex: 20,
          pointerEvents: 'auto',
        }}
      >
        {/* Back */}
        <Tooltip title={t('game.backToMenu')} arrow>
          <IconButton size="small" onClick={() => { reset(); navigate('/'); }} sx={{ color: '#aaa' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Level name */}
        <Typography sx={{ fontSize: layout.isMobile ? 11 : 13, fontWeight: 600, color: '#ddd', maxWidth: layout.isMobile ? 60 : 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {levelName}
        </Typography>

        {/* Tick */}
        <Chip
          label={`T${tick}`}
          size="small"
          sx={{ height: 20, fontSize: 10, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.06)' }}
        />

        {/* Save */}
        <Tooltip title={t('save.title')} arrow>
          <IconButton size="small" onClick={() => setSaveOpen(true)} sx={{ color: '#aaa' }}>
            <SaveIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Reload mods */}
        <Tooltip title={t('game.reloadMods')} arrow>
          <span>
            <IconButton
              size="small"
              onClick={() => void reloadMods()}
              disabled={modLoading}
              aria-label="Reload Mods"
              data-testid="reload-mods-btn"
              sx={{ color: modLoading ? '#666' : '#aaa' }}
            >
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* Mode selector — icon buttons */}
        <ToggleButtonGroup
          value={uiMode}
          exclusive
          onChange={(_, mode) => mode && setUiMode(mode)}
          size="small"
          sx={{
            mr: 0.5,
            '& .MuiToggleButton-root': {
              color: '#8aa0b4', borderColor: '#2f3540',
              px: 0.7, py: 0.2,
              '&.Mui-selected': { color: '#fff', bgcolor: 'rgba(83,109,254,0.28)' },
            },
          }}
        >
          <ToggleButton value="observe">
            <Tooltip title={`${t('mode.observe')} (F1)`} arrow>{modeIcons.observe}</Tooltip>
          </ToggleButton>
          <ToggleButton value="micro">
            <Tooltip title={`${t('mode.micro')} (F2)`} arrow>{modeIcons.micro}</Tooltip>
          </ToggleButton>
          <ToggleButton value="graph">
            <Tooltip title={`${t('mode.graph')} (F3/Tab)`} arrow>{modeIcons.graph}</Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Step button (paused only) */}
        {paused && (
          <>
            <Tooltip title={t('game.autoStep')} arrow>
              <IconButton
                size="small"
                onClick={() => setAutoStepOnCommand(!autoStepOnCommand)}
                sx={{
                  color: autoStepOnCommand ? '#90caf9' : '#555',
                  border: '1px solid',
                  borderColor: autoStepOnCommand ? '#536dfe' : '#333',
                  borderRadius: 1,
                  mx: 0.2,
                  bgcolor: autoStepOnCommand ? 'rgba(83,109,254,0.18)' : 'transparent',
                }}
              >
                <FlashAutoIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('game.stepTick')} arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={handleStep}
                  disabled={stepping}
                  sx={{ color: '#888', border: '1px solid #333', borderRadius: 1, mx: 0.2 }}
                >
                  <SkipNextIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </>
        )}

        {/* Speed */}
        <ToggleButtonGroup
          value={speed}
          exclusive
          onChange={handleSpeedChange}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: '#888', borderColor: '#333',
              fontSize: 11, py: 0.2, px: 0.7,
              '&.Mui-selected': { color: '#fff', bgcolor: 'rgba(100,100,255,0.2)' },
            },
          }}
        >
          <ToggleButton value={0}><PauseIcon sx={{ fontSize: 13 }} /></ToggleButton>
          <ToggleButton value={1}>1×</ToggleButton>
          <ToggleButton value={2}>2×</ToggleButton>
          <ToggleButton value={3}>3×</ToggleButton>
          <ToggleButton value={4}>4×</ToggleButton>
        </ToggleButtonGroup>

        {paused && (
          <Chip
            icon={<PauseIcon sx={{ fontSize: 10 }} />}
            label={t('game.paused')}
            size="small"
            color="warning"
            sx={{ height: 18, fontSize: 9, ml: 0.3 }}
          />
        )}
      </Box>

      <SaveManager open={saveOpen} onClose={() => setSaveOpen(false)} />
    </>
  );
};
