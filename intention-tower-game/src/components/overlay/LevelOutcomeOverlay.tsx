import React from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import HomeIcon from '@mui/icons-material/Home';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { allLevels } from '../../data/levels/allLevels';
import { translateLabel } from '../../i18n';

/** Terminal level result. It deliberately cannot be dismissed into a frozen game. */
export const LevelOutcomeOverlay: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const worldState = useGameState((state) => state.worldState);
  const currentLevelId = useGameState((state) => state.currentLevelId);
  const loadLevel = useGameState((state) => state.loadLevel);
  const reset = useGameState((state) => state.reset);

  const status = worldState?.progress.status ?? 'InProgress';
  const currentIndex = allLevels.findIndex((level) => level.id === currentLevelId);
  const nextLevel = status === 'Won' && currentIndex >= 0 ? allLevels[currentIndex + 1] : undefined;

  const goToMenu = () => {
    reset();
    navigate('/');
  };

  const replay = async () => {
    if (currentLevelId) await loadLevel(currentLevelId);
  };

  const continueToNext = async () => {
    if (nextLevel) await loadLevel(nextLevel.id);
  };

  return (
    <Dialog
      open={status !== 'InProgress'}
      disableEscapeKeyDown
      aria-labelledby="level-outcome-title"
      PaperProps={{
        sx: {
          width: 'min(92vw, 480px)',
          bgcolor: 'rgba(16,16,36,0.98)',
          backgroundImage: 'linear-gradient(145deg, rgba(83,109,254,0.14), rgba(15,15,32,0.2))',
          border: `1px solid ${status === 'Won' ? 'rgba(101,212,138,0.6)' : 'rgba(239,83,80,0.55)'}`,
        },
      }}
    >
      <DialogTitle id="level-outcome-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pb: 1 }}>
        {status === 'Won'
          ? <CheckCircleOutlineIcon sx={{ color: '#65d48a', fontSize: 34 }} />
          : <ErrorOutlineIcon sx={{ color: '#ef5350', fontSize: 34 }} />}
        <Box>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>
            {t(status === 'Won' ? 'outcome.won' : 'outcome.lost')}
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#8d93aa' }}>
            {translateLabel(worldState?.level_label ?? currentLevelId ?? '')} · T{worldState?.progress.completed_at_tick ?? worldState?.tick ?? 0}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 13, color: '#c6c9d8', lineHeight: 1.7 }}>
          {status === 'Won'
            ? t('outcome.wonDescription')
            : (translateLabel(worldState?.progress.outcome_label ?? '') || t('outcome.lostDescription'))}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2, pt: 0, flexWrap: 'wrap', gap: 0.75 }}>
        <Button onClick={goToMenu} startIcon={<HomeIcon />} color="inherit">
          {t('outcome.menu')}
        </Button>
        <Button onClick={() => void replay()} startIcon={<ReplayIcon />} color="inherit">
          {t('outcome.retry')}
        </Button>
        {nextLevel && (
          <Button onClick={() => void continueToNext()} startIcon={<SkipNextIcon />} variant="contained">
            {t('outcome.next')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
