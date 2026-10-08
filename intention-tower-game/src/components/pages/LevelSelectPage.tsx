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

const CATEGORY_KEYS: Record<string, string> = {
  '教程': 'tutorial', '先验本能': 'instinct', '社交与归属': 'belonging',
  '动机链': 'motivation', '虚拟与现实': 'reality', '信念': 'belief',
  '地位与面子': 'status', '模因': 'meme', '终局': 'finale',
};

const LevelCard: React.FC<{ level: LevelMeta; onSelect: (id: string) => void; loading: boolean; progress: { played: boolean; maxTick: number; completed: boolean } | undefined }> = ({ level, onSelect, loading, progress }) => {
  const { t } = useTranslation();
  const played = progress?.played ?? false;
  const completed = progress?.completed ?? false;
  const maxTick = progress?.maxTick ?? 0;

  return (
    <Paper
      data-testid={`level-card-${level.id}`}
      elevation={0}
      role="button"
      tabIndex={loading ? -1 : 0}
      aria-disabled={loading}
      onClick={() => !loading && onSelect(level.id)}
      onKeyDown={event => { if (!loading && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(level.id); } }}
      sx={{
        bgcolor: completed ? '#edf1dd' : '#fff8e9',
        borderRadius: '8px 24px 24px 8px',
        backgroundImage: 'linear-gradient(100deg, rgba(160,120,65,.09), transparent 22%)',
        boxShadow: '0 4px 0 #d3bd97, 0 9px 18px #84683a15',
        p: 2.5,
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s',
        border: completed ? '2px solid #93aa75' : '2px solid #d6bf99',
        position: 'relative',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: completed
            ? '0 8px 24px rgba(46, 125, 50, 0.2)'
            : '0 8px 24px rgba(154,113,62,0.2)',
          borderColor: completed ? '#779257' : '#a57949',
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

      <Typography sx={{ fontSize: 18, fontWeight: 600, mb: 1, color: '#443627', pr: 3 }}>
        {translate(`level.${level.id}.name`) !== `level.${level.id}.name` ? translate(`level.${level.id}.name`) : level.name}
      </Typography>
      <Typography sx={{ fontSize: 12, color: '#806c55', lineHeight: 1.5, mb: 1.5 }}>
        {translate(`level.${level.id}.description`) !== `level.${level.id}.description` ? translate(`level.${level.id}.description`) : level.description}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
        {level.objectives.slice(0, 3).map((obj, i) => (
          <Chip
            key={i}
            label={translate(`level.${level.id}.objective.${i}`) !== `level.${level.id}.objective.${i}` ? translate(`level.${level.id}.objective.${i}`) : obj}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 10, borderColor: '#d6bf99', color: '#79644d' }}
          />
        ))}
        {played && maxTick > 0 && (
          <Chip
            label={t('menu.maxTick', { tick: maxTick })}
            size="small"
            sx={{ height: 18, fontSize: 9, bgcolor: 'rgba(149,112,64,0.05)', color: '#666' }}
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
      bgcolor: '#868074', color: '#443627',
      backgroundImage: 'radial-gradient(ellipse at 50% 0%, #fffaf0 0%, #f0e4ca 70%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      overflow: 'auto',
      p: { xs: 2, sm: 4 },
      pt: { xs: 8, sm: 7 },
    }}>
      <Box aria-hidden sx={{ fontSize: 46, lineHeight: 1, color: '#a37b46', mb: 2 }}>♜</Box>
      <Typography sx={{ fontSize: { xs: 30, sm: 42 }, fontWeight: 700, mb: 1, letterSpacing: { xs: 2, sm: 4 }, textAlign: 'center' }}>
        {t('app.title')}
      </Typography>
      <Typography sx={{ fontSize: 13, color: '#666', mb: 4 }}>
        {t('menu.subtitle', { count: allLevels.length })}
      </Typography>

      <IconButton
        onClick={() => navigate('/settings')}
        sx={{ position: 'fixed', top: 16, right: 16, color: '#78634d' }}
        aria-label={t('menu.settings')}
      >
        <SettingsIcon />
      </IconButton>

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={20} />
          <Typography sx={{ fontSize: 13, color: '#806c55' }}>{t('app.loading')}</Typography>
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
              fontSize: 16, fontWeight: 600, color: '#8b5735',
              display: 'inline-block', bgcolor: '#7f745f', px: 2, py: 1, borderRadius: '6px 18px 18px 6px', mb: 2,
            }}>
              {t(`menu.category.${CATEGORY_KEYS[category] ?? 'finale'}`)}
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
