/**
 * LevelSelectPage — level selection screen.
 * Displays all levels grouped by category. Clicking a level loads it via Tauri backend.
 */
import React, { useMemo } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Chip, IconButton,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { allLevels, type LevelMeta } from '../../data/levels/allLevels';
import { t as translate } from '../../i18n';

const LevelCard: React.FC<{ level: LevelMeta; onSelect: (id: string) => void; loading: boolean }> = ({ level, onSelect, loading }) => (
  <Paper
    elevation={0}
    onClick={() => !loading && onSelect(level.id)}
    sx={{
      bgcolor: '#1a1a3e',
      borderRadius: 2,
      p: 2.5,
      cursor: loading ? 'wait' : 'pointer',
      transition: 'all 0.2s',
      border: '1px solid #2a2a5e',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 8px 24px rgba(100, 100, 255, 0.2)',
        borderColor: '#4a4aff',
      },
    }}
  >
    <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1, color: '#fff' }}>
    {translate(`level.${level.id}.name`) !== `level.${level.id}.name` ? translate(`level.${level.id}.name`) : level.name}
    </Typography>
    <Typography sx={{ fontSize: 12, color: '#999', lineHeight: 1.5, mb: 1.5 }}>
    {translate(`level.${level.id}.description`) !== `level.${level.id}.description` ? translate(`level.${level.id}.description`) : level.description}
    </Typography>
    {level.objectives.length > 0 && (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {level.objectives.slice(0, 3).map((obj, i) => (
          <Chip
            key={i}
            label={translate(`level.${level.id}.objective.${i}`) !== `level.${level.id}.objective.${i}` ? translate(`level.${level.id}.objective.${i}`) : obj}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 10, borderColor: '#3a3a6e', color: '#888' }}
          />
        ))}
      </Box>
    )}
  </Paper>
);

export const LevelSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const loadLevel = useGameState((s) => s.loadLevel);
  const loading = useGameState((s) => s.loading);
  const error = useGameState((s) => s.error);

  const onSelectLevel = async (id: string) => {
    await loadLevel(id);
    navigate('/game');
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, LevelMeta[]>();
    for (const level of allLevels) {
      if (!groups.has(level.category)) groups.set(level.category, []);
      groups.get(level.category)!.push(level);
    }
    return groups;
  }, []);

  return (
    <Box sx={{
      width: '100vw', height: '100vh',
      bgcolor: '#0a0a1e', color: '#fff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      overflow: 'auto',
      p: 4,
    }}>
      <Typography sx={{ fontSize: 42, fontWeight: 700, mb: 1, letterSpacing: 4 }}>
        {t('app.title')}
      </Typography>
      <Typography sx={{ fontSize: 13, color: '#666', mb: 4 }}>
        {t('menu.subtitle', { count: allLevels.length })}
      </Typography>

      <IconButton
        onClick={() => navigate('/settings')}
        sx={{ position: 'fixed', top: 16, right: 16, color: '#bbb' }}
        aria-label={t('menu.settings')}
      >
        <SettingsIcon />
      </IconButton>

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={20} />
          <Typography sx={{ fontSize: 13, color: '#aaa' }}>{t('app.loading')}</Typography>
        </Box>
      )}

      {error && (
        <Typography sx={{ fontSize: 12, color: '#ef5350', mb: 2 }}>
          {error}
        </Typography>
      )}

      <Box sx={{ maxWidth: 1100, width: '100%' }}>
        {Array.from(grouped.entries()).map(([category, levels]) => (
          <Box key={category} sx={{ mb: 4 }}>
            <Typography sx={{
              fontSize: 16, fontWeight: 600, color: '#8888ff',
              borderBottom: '1px solid #2a2a5e', pb: 0.5, mb: 2,
            }}>
              {category}
            </Typography>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 2,
            }}>
              {levels.map((level) => (
                <LevelCard key={level.id} level={level} onSelect={onSelectLevel} loading={loading} />
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 4, mb: 2 }}>
        <Typography sx={{ fontSize: 12, color: '#444' }}>
          {t('menu.hotkeys')}
        </Typography>
      </Box>
    </Box>
  );
};
