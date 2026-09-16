/**
 * LevelSelectPage — level selection screen.
 * Displays all levels grouped by category. Clicking a level loads it via Tauri backend.
 */
import React, { useMemo } from 'react';
import {
  Box, Typography, Paper, CircularProgress, Chip, IconButton,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { useLevelProgress } from '../../store/useLevelProgress';
import { allLevels, type LevelMeta } from '../../data/levels/allLevels';
import { t as translate } from '../../i18n';

const LevelCard: React.FC<{ level: LevelMeta; onSelect: (id: string) => void; loading: boolean; progress: { played: boolean; maxTick: number; completed: boolean } | undefined }> = ({ level, onSelect, loading, progress }) => {
  const { t } = useTranslation();
  const played = progress?.played ?? false;
  const completed = progress?.completed ?? false;
  const maxTick = progress?.maxTick ?? 0;

  return (
    <Paper
      elevation={0}
      onClick={() => !loading && onSelect(level.id)}
      sx={{
        bgcolor: completed ? '#1a2e1a' : '#1a1a3e',
        borderRadius: 2,
        p: 2.5,
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        border: completed ? '1px solid #2e7d32' : '1px solid #2a2a5e',
        position: 'relative',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: completed
            ? '0 8px 24px rgba(46, 125, 50, 0.2)'
            : '0 8px 24px rgba(100, 100, 255, 0.2)',
          borderColor: completed ? '#43a047' : '#4a4aff',
        },
      }}
    >
      {/* Progress badge */}
      {completed && (
        <CheckCircleIcon sx={{ position: 'absolute', top: 10, right: 10, fontSize: 20, color: '#66bb6a' }} />
      )}
      {played && !completed && (
        <PlayCircleOutlineIcon sx={{ position: 'absolute', top: 10, right: 10, fontSize: 20, color: '#ffa726' }} />
      )}

      <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1, color: '#fff', pr: 3 }}>
        {translate(`level.${level.id}.name`) !== `level.${level.id}.name` ? translate(`level.${level.id}.name`) : level.name}
      </Typography>
      <Typography sx={{ fontSize: 12, color: '#999', lineHeight: 1.5, mb: 1.5 }}>
        {translate(`level.${level.id}.description`) !== `level.${level.id}.description` ? translate(`level.${level.id}.description`) : level.description}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
        {level.objectives.slice(0, 3).map((obj, i) => (
          <Chip
            key={i}
            label={translate(`level.${level.id}.objective.${i}`) !== `level.${level.id}.objective.${i}` ? translate(`level.${level.id}.objective.${i}`) : obj}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 10, borderColor: '#3a3a6e', color: '#888' }}
          />
        ))}
        {played && maxTick > 0 && (
          <Chip
            label={t('menu.maxTick', { tick: maxTick })}
            size="small"
            sx={{ height: 18, fontSize: 9, bgcolor: 'rgba(255,255,255,0.05)', color: '#666' }}
          />
        )}
      </Box>
    </Paper>
  );
};

export const LevelSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const loadLevel = useGameState((s) => s.loadLevel);
  const loading = useGameState((s) => s.loading);
  const error = useGameState((s) => s.error);
  const levelProgress = useLevelProgress((s) => s.levels);

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
      width: '100vw', minHeight: '100dvh',
      bgcolor: '#0a0a1e', color: '#fff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      overflow: 'auto',
      p: { xs: 2, sm: 4 },
    }}>
      <Typography sx={{ fontSize: { xs: 30, sm: 42 }, fontWeight: 700, mb: 1, letterSpacing: { xs: 2, sm: 4 }, textAlign: 'center' }}>
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
                <LevelCard key={level.id} level={level} onSelect={onSelectLevel} loading={loading} progress={levelProgress[level.id]} />
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
