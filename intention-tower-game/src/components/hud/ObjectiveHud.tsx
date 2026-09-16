import React, { useMemo, useState } from 'react';
import {
  Box, Chip, Collapse, IconButton, LinearProgress, Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

/** Compact, backend-driven checklist shared by every level. */
export const ObjectiveHud: React.FC = () => {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const progress = useGameState((state) => state.worldState?.progress);
  const [expanded, setExpanded] = useState(!layout.isMobile);

  const counts = useMemo(() => {
    const required = progress?.objectives.filter((objective) => objective.required) ?? [];
    return {
      completed: required.filter((objective) => objective.completed).length,
      total: required.length,
    };
  }, [progress]);

  if (!progress || counts.total === 0) return null;

  const ratio = counts.total > 0 ? (counts.completed / counts.total) * 100 : 0;

  return (
    <Box
      data-testid="objective-hud"
      sx={{
        position: 'absolute',
        top: layout.isMobile ? 72 : 54,
        left: layout.isMobile ? 8 : `max(${layout.statusBarWidth + 10}px, 18vw)`,
        width: layout.isMobile ? 'calc(100vw - 16px)' : 'min(360px, 38vw)',
        bgcolor: 'rgba(10,10,24,0.88)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(105,118,255,0.42)',
        borderRadius: 1.5,
        pointerEvents: 'auto',
        overflow: 'hidden',
        zIndex: 13,
      }}
    >
      <Box
        onClick={() => setExpanded((value) => !value)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.75, cursor: 'pointer' }}
      >
        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
          {t('objective.title')}
        </Typography>
        <Chip
          label={t('objective.progress', counts)}
          size="small"
          sx={{ height: 18, fontSize: 9, bgcolor: 'rgba(83,109,254,0.18)' }}
        />
        <IconButton size="small" aria-label={t('objective.toggle')} sx={{ p: 0.15, color: '#8794d8' }}>
          <ExpandMoreIcon
            sx={{ fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          />
        </IconButton>
      </Box>
      <LinearProgress
        variant="determinate"
        value={ratio}
        sx={{ height: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: '#7387ff' } }}
      />
      <Collapse in={expanded}>
        <Box sx={{ px: 1.25, py: 0.8, display: 'flex', flexDirection: 'column', gap: 0.65 }}>
          {progress.objectives.map((objective) => (
            <Box key={objective.objective_id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.65 }}>
              {objective.completed
                ? <CheckCircleIcon sx={{ mt: 0.1, fontSize: 15, color: '#65d48a' }} />
                : <RadioButtonUncheckedIcon sx={{ mt: 0.1, fontSize: 15, color: '#66719a' }} />}
              <Typography
                sx={{
                  fontSize: 10.5,
                  lineHeight: 1.45,
                  color: objective.completed ? '#91a19a' : '#d7daf0',
                  textDecoration: objective.completed ? 'line-through' : 'none',
                }}
              >
                {translateLabel(objective.label)}
                {!objective.required && ` · ${t('objective.optional')}`}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
