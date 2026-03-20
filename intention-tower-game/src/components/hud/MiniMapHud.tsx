/**
 * MiniMapHud — small overview map in the top-right corner.
 * Shows all characters/items as dots and the current viewport rectangle.
 */
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useGameState } from '../../store/useGameState';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const DOT_COLORS = {
  actor: '#4caf50',
  target: '#ff9800',
  char: '#5c6bc0',
  item: '#ffca28',
};

export const MiniMapHud: React.FC = () => {
  const layout = useResponsiveLayout();
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);

  const { w, h } = layout.miniMapSize;

  const characters = useMemo(() =>
    worldState ? Object.values(worldState.characters) : [],
    [worldState]
  );
  const items = useMemo(() =>
    worldState ? Object.values(worldState.items) : [],
    [worldState]
  );

  const bounds = useMemo(() => {
    const all = [
      ...characters.map(c => c.position),
      ...items.map(i => i.position),
    ];
    if (all.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    const pad = 2;
    return {
      minX: Math.min(...all.map(p => p.x)) - pad,
      maxX: Math.max(...all.map(p => p.x)) + pad,
      minY: Math.min(...all.map(p => p.y)) - pad,
      maxY: Math.max(...all.map(p => p.y)) + pad,
    };
  }, [characters, items]);

  const toPercent = (val: number, min: number, max: number) => {
    if (Math.abs(max - min) < 0.01) return 50;
    return ((val - min) / (max - min)) * 100;
  };

  if (w === 0 || h === 0) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 56,
        right: 8,
        width: w,
        height: h,
        bgcolor: 'rgba(14,14,26,0.85)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(42,42,78,0.6)',
        borderRadius: 1,
        overflow: 'hidden',
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    >
      {/* Grid reference */}
      <Box sx={{ position: 'absolute', inset: 0, opacity: 0.06 }}>
        <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '1px dashed #fff' }} />
        <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed #fff' }} />
      </Box>

      {/* Items */}
      {items.map(item => (
        <Box
          key={item.id}
          sx={{
            position: 'absolute',
            width: 5,
            height: 5,
            borderRadius: '50%',
            bgcolor: DOT_COLORS.item,
            left: `${toPercent(item.position.x, bounds.minX, bounds.maxX)}%`,
            top: `${toPercent(item.position.y, bounds.minY, bounds.maxY)}%`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.7,
          }}
        />
      ))}

      {/* Characters */}
      {characters.map(char => {
        const isActor = char.id === selectedActorId;
        const isTarget = char.id === selectedTargetId;
        const color = isActor ? DOT_COLORS.actor : isTarget ? DOT_COLORS.target : DOT_COLORS.char;
        return (
          <Box
            key={char.id}
            sx={{
              position: 'absolute',
              width: isActor || isTarget ? 9 : 7,
              height: isActor || isTarget ? 9 : 7,
              borderRadius: '50%',
              bgcolor: color,
              border: isActor ? '1.5px solid #81c784' : isTarget ? '1.5px solid #ffcc80' : 'none',
              left: `${toPercent(char.position.x, bounds.minX, bounds.maxX)}%`,
              top: `${toPercent(char.position.y, bounds.minY, bounds.maxY)}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isActor || isTarget ? 2 : 1,
            }}
          />
        );
      })}

      {/* Label */}
      <Typography sx={{ position: 'absolute', bottom: 1, right: 3, fontSize: 7, color: '#444' }}>
        MAP
      </Typography>
    </Box>
  );
};
