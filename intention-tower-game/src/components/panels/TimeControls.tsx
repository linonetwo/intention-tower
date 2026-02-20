/**
 * TimeControls — top bar controls for time speed, pause, tick count, and back button.
 */
import React from 'react';
import {
  Box, Typography, IconButton, ToggleButtonGroup, ToggleButton, Chip, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PauseIcon from '@mui/icons-material/Pause';
import { useGameState } from '../../store/useGameState';
import { allLevels } from '../../data/levels/allLevels';

export const TimeControls: React.FC = () => {
  const worldState = useGameState((s) => s.worldState);
  const currentLevelId = useGameState((s) => s.currentLevelId);
  const setTimeSpeed = useGameState((s) => s.setTimeSpeed);
  const reset = useGameState((s) => s.reset);

  const tick = worldState?.tick ?? 0;
  const speed = worldState?.time_speed ?? 1;
  const paused = worldState?.paused ?? false;

  const levelMeta = allLevels.find((l) => l.id === currentLevelId);
  const levelName = levelMeta?.name ?? currentLevelId ?? '未知关卡';

  const handleSpeedChange = (_: React.MouseEvent, newSpeed: number | null) => {
    if (newSpeed != null) {
      setTimeSpeed(newSpeed);
    }
  };

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      px: 2, py: 0.5,
      bgcolor: '#1a1a2e',
      borderBottom: '1px solid #2a2a4e',
      minHeight: 44,
    }}>
      {/* Back button */}
      <Tooltip title="返回关卡选择" arrow>
        <IconButton size="small" onClick={reset} sx={{ color: '#aaa' }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Level name */}
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#ddd', mr: 2 }}>
        {levelName}
      </Typography>

      {/* Tick counter */}
      <Chip
        label={`Tick ${tick}`}
        size="small"
        sx={{ height: 22, fontSize: 11, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.05)' }}
      />

      <Box sx={{ flex: 1 }} />

      {/* Speed controls */}
      <ToggleButtonGroup
        value={speed}
        exclusive
        onChange={handleSpeedChange}
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            color: '#888',
            borderColor: '#333',
            fontSize: 12,
            py: 0.25,
            px: 1,
            '&.Mui-selected': {
              color: '#fff',
              bgcolor: 'rgba(100,100,255,0.2)',
            },
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

      {/* Paused indicator */}
      {paused && (
        <Chip
          icon={<PauseIcon sx={{ fontSize: 12 }} />}
          label="已暂停"
          size="small"
          color="warning"
          sx={{ height: 20, fontSize: 10 }}
        />
      )}
    </Box>
  );
};
