import React, { useMemo, useCallback } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { t as translateLabel } from '../../i18n';

export const WorldSceneMiniMap: React.FC = () => {
  const { t } = useTranslation();
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const inspectCharacter = useGameState((s) => s.inspectCharacter);
  const selectActor = useGameState((s) => s.selectActor);
  const selectTarget = useGameState((s) => s.selectTarget);

  const scene = useMemo(() => {
    if (!worldState) return null;

    const characters = Object.values(worldState.characters);
    const items = Object.values(worldState.items);
    const all = [
      ...characters.map((c) => ({ x: c.position.x, y: c.position.y })),
      ...items.map((i) => ({ x: i.position.x, y: i.position.y })),
    ];

    if (all.length === 0) {
      return { characters, items, minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }

    const padding = 40;
    const minX = Math.min(...all.map((p) => p.x)) - padding;
    const maxX = Math.max(...all.map((p) => p.x)) + padding;
    const minY = Math.min(...all.map((p) => p.y)) - padding;
    const maxY = Math.max(...all.map((p) => p.y)) + padding;

    return { characters, items, minX, maxX, minY, maxY };
  }, [worldState]);

  const handleCharClick = useCallback((charId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      // Shift+click to set target
      selectTarget(charId);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click to set actor
      selectActor(charId);
    } else {
      // Regular click: inspect
      inspectCharacter(charId);
    }
  }, [inspectCharacter, selectActor, selectTarget]);

  if (!scene) return null;

  const toPercent = (value: number, min: number, max: number) => {
    if (Math.abs(max - min) < 1e-6) return 50;
    return ((value - min) / (max - min)) * 100;
  };

  return (
    <Box sx={{ px: 1, pt: 0.7, pb: 0.8 }}>
      <Typography sx={{ fontSize: 10, color: '#888', mb: 0.4 }}>{t('world.scene')}</Typography>
      <Box
        sx={{
          position: 'relative',
          height: 120,
          border: '1px solid #2a2a4e',
          borderRadius: 1,
          bgcolor: '#0f1022',
          overflow: 'hidden',
        }}
      >
        {/* Grid lines for reference */}
        <Box sx={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
          <Box sx={{ position: 'absolute', left: '25%', top: 0, bottom: 0, borderLeft: '1px dashed #fff' }} />
          <Box sx={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '1px dashed #fff' }} />
          <Box sx={{ position: 'absolute', left: '75%', top: 0, bottom: 0, borderLeft: '1px dashed #fff' }} />
          <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed #fff' }} />
        </Box>

        {/* Items as small dots */}
        {scene.items.map((item) => (
          <Tooltip key={item.id} title={translateLabel(item.label)} placement='top' arrow>
            <Box
              sx={{
                position: 'absolute',
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: '#ffca28',
                left: `${toPercent(item.position.x, scene.minX, scene.maxX)}%`,
                top: `${toPercent(item.position.y, scene.minY, scene.maxY)}%`,
                transform: 'translate(-50%, -50%)',
                opacity: 0.85,
                cursor: 'default',
                '&:hover': { opacity: 1, transform: 'translate(-50%, -50%) scale(1.3)' },
                transition: 'all 0.15s',
              }}
            />
          </Tooltip>
        ))}

        {/* Characters as interactive dots */}
        {scene.characters.map((char) => {
          const isActor = char.id === selectedActorId;
          const isTarget = char.id === selectedTargetId;
          return (
            <Tooltip key={char.id} title={`${translateLabel(char.label)}${isActor ? ' [A]' : ''}${isTarget ? ' [T]' : ''}`} placement='top' arrow>
              <Box
                onClick={(e) => handleCharClick(char.id, e)}
                sx={{
                  position: 'absolute',
                  width: isActor || isTarget ? 13 : 10,
                  height: isActor || isTarget ? 13 : 10,
                  borderRadius: '50%',
                  border: isActor
                    ? '2px solid #66bb6a'
                    : isTarget
                      ? '2px solid #ffa726'
                      : '1.5px solid #9fa8da',
                  bgcolor: '#3949ab',
                  left: `${toPercent(char.position.x, scene.minX, scene.maxX)}%`,
                  top: `${toPercent(char.position.y, scene.minY, scene.maxY)}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translate(-50%, -50%) scale(1.4)',
                    bgcolor: '#5c6bc0',
                    boxShadow: '0 0 8px rgba(92,107,192,0.6)',
                  },
                  zIndex: isActor || isTarget ? 2 : 1,
                }}
              />
            </Tooltip>
          );
        })}

        {/* Mini tip */}
        <Typography sx={{ position: 'absolute', bottom: 2, right: 4, fontSize: 8, color: '#444' }}>
          {t('world.scene.tip')}
        </Typography>
      </Box>
    </Box>
  );
};
