import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  ArrowDownward,
  ArrowLeft,
  ArrowRight,
  ArrowUpward,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useGameState } from '../../store/useGameState';

const STEP = 28;

export const MicroControlPad: React.FC = () => {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const uiMode = useGameState((state) => state.uiMode);
  const move = useGameState((state) => state.moveSelectedActor);

  if (layout.isDesktop || uiMode !== 'micro') return null;

  const button = (label: string, dx: number, dy: number, icon: React.ReactNode) => (
    <Tooltip title={label} arrow>
      <IconButton
        aria-label={label}
        onPointerDown={(event) => {
          event.preventDefault();
          void move(dx, dy);
        }}
        sx={{
          width: layout.touchTarget,
          height: layout.touchTarget,
          color: '#f3f5ff',
          bgcolor: 'rgba(18, 22, 44, 0.86)',
          border: '1px solid rgba(135, 153, 255, 0.48)',
          backdropFilter: 'blur(7px)',
          '&:active': { bgcolor: 'rgba(83, 109, 254, 0.75)' },
        }}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <Box
      aria-label={t('micro.pad')}
      sx={{
        position: 'absolute',
        left: 12,
        bottom: `calc(${layout.dialogueHeight}vh + 14px)`,
        display: 'grid',
        gridTemplateColumns: `repeat(3, ${layout.touchTarget}px)`,
        gridTemplateRows: `repeat(2, ${layout.touchTarget}px)`,
        gap: 5,
        pointerEvents: 'auto',
        zIndex: 16,
      }}
    >
      <Box />
      {button(t('micro.move.up'), 0, -STEP, <ArrowUpward />)}
      <Box />
      {button(t('micro.move.left'), -STEP, 0, <ArrowLeft />)}
      {button(t('micro.move.down'), 0, STEP, <ArrowDownward />)}
      {button(t('micro.move.right'), STEP, 0, <ArrowRight />)}
    </Box>
  );
};
