/**
 * EventStrip — compact single-line event scroller, sits above the dialogue box.
 */
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useGameState } from '../../store/useGameState';
import { useTranslation } from 'react-i18next';
import { presentEvent } from './eventPresentation';

export const EventStrip: React.FC = () => {
  const { i18n } = useTranslation();
  const recentEvents = useGameState((s) => s.recentEvents);
  const worldState = useGameState((s) => s.worldState);

  const last3 = useMemo(() => {
    return recentEvents
      .filter(e => !('TickCompleted' in e))
      .slice(0, 3)
      .map(e => presentEvent(e, worldState));
  }, [recentEvents, worldState, i18n.language]);

  if (last3.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 1,
        bgcolor: 'rgba(255,248,232,0.94)',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 5,
      }}
    >
      {last3.map((item, i) => (
        <Typography key={i} sx={{ fontSize: 10, color: item.color, whiteSpace: 'nowrap' }}>
          {item.icon} {item.text}
        </Typography>
      ))}
    </Box>
  );
};
