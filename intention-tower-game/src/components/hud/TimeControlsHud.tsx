import React, { useEffect, useState } from 'react';
import { Box, Typography, IconButton, Button, Drawer, ToggleButtonGroup, ToggleButton, Tooltip, Divider } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../../store/useGameState';
import { allLevels } from '../../data/levels/allLevels';
import { translateLabel } from '../../i18n';
import { SaveManager } from '../panels/SaveManager';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useModAssets } from '../../store/useModAssets';
import { ActorStatusBar } from './ActorStatusBar';
import { EconomyHud } from './EconomyHud';
import { MiniMapHud } from './MiniMapHud';

/** Only essential controls stay above the stage; the notebook holds the rest. */
export const TimeControlsHud: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useResponsiveLayout();
  const world = useGameState(s => s.worldState);
  const levelId = useGameState(s => s.currentLevelId);
  const setSpeed = useGameState(s => s.setTimeSpeed);
  const stepTick = useGameState(s => s.stepTick);
  const autoStep = useGameState(s => s.autoStepOnCommand);
  const setAutoStep = useGameState(s => s.setAutoStepOnCommand);
  const mode = useGameState(s => s.uiMode);
  const setMode = useGameState(s => s.setUiMode);
  const reset = useGameState(s => s.reset);
  const reload = useModAssets(s => s.reload);
  const loading = useModAssets(s => s.loading);
  const [menu, setMenu] = useState(false);
  const [save, setSave] = useState(false);
  const [stepping, setStepping] = useState(false);
  // Loading another experiment or changing modes outside the notebook must
  // return focus to the stage rather than leave its modal backdrop in place.
  useEffect(() => { setMenu(false); }, [levelId, mode]);
  const paused = world?.paused ?? true;
  const level = allLevels.find(l => l.id === levelId);
  const handleStep = async () => { if (stepping) return; setStepping(true); try { await stepTick(); } finally { setStepping(false); } };
  return <>
    <Box data-testid="game-topbar" sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, px: 1, display: 'flex', alignItems: 'center', gap: .75, bgcolor: '#f4ead5', color: '#513b29', borderBottom: '3px solid #bd9768', boxShadow: '0 3px 12px #6c4e2520', pointerEvents: 'auto', zIndex: 20, '& button': { minWidth: 44, minHeight: 44 } }}>
      <IconButton data-testid="experiment-menu-open" aria-label={t('game.notebook')} onClick={() => setMenu(true)} sx={{ bgcolor: '#e9dabc', borderRadius: 2 }}><MenuIcon /></IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontWeight: 800, fontSize: layout.isMobile ? 12 : 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{level ? translateLabel(`level.${level.id}.name`) : t('game.unknownLevel')}</Typography><Typography sx={{ fontSize: 11, color: '#856e53' }}>{t('game.tick', { tick: world?.tick ?? 0 })}</Typography></Box>
      <Tooltip title={paused ? t('game.resume') : t('game.pause')}><IconButton data-testid="pause-time" aria-label={paused ? t('game.resume') : t('game.pause')} onClick={() => setSpeed(paused ? 1 : 0)} sx={{ bgcolor: '#e4ead3', color: '#4f6e47' }}>{paused ? <PlayArrowIcon /> : <PauseIcon />}</IconButton></Tooltip>
      {paused && <Tooltip title={t('game.stepTick')}><span><IconButton data-testid="step-tick" data-tutorial="step-button" aria-label={t('game.stepTick')} disabled={stepping} onClick={handleStep}><SkipNextIcon /></IconButton></span></Tooltip>}
      <Tooltip title={t('mode.graph')}><IconButton data-testid="mode-graph" aria-label={t('mode.graph')} onClick={() => setMode(mode === 'graph' ? 'observe' : 'graph')} sx={{ bgcolor: mode === 'graph' ? '#ead8b9' : 'transparent' }}><AccountTreeIcon /></IconButton></Tooltip>
    </Box>
    <Drawer data-testid="experiment-menu" anchor="right" open={menu} onClose={() => setMenu(false)} slotProps={{ paper: { sx: { width: 'min(360px, 92vw)', p: 2.5, bgcolor: '#f4ead5', color: '#513b29', '& button': { minHeight: 44, minWidth: 44 } } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}><Typography variant="h6" sx={{ flex: 1, fontWeight: 800 }}>{t('game.notebook')}</Typography><IconButton data-testid="experiment-menu-close" aria-label={t('app.close')} onClick={() => setMenu(false)}><CloseIcon /></IconButton></Box>
      <ActorStatusBar />
      <EconomyHud />
      <MiniMapHud />
      <Typography sx={{ mb: 1 }}>{t('game.experimentMode')}</Typography>
      <ToggleButtonGroup fullWidth exclusive value={mode} sx={{ mb: 2 }}>{(['observe', 'micro', 'graph'] as const).map(value => <ToggleButton key={value} value={value} data-testid={`mode-${value}`} onClick={() => { setMode(value); setMenu(false); }}>{t(`mode.${value}`)}</ToggleButton>)}</ToggleButtonGroup>
      <Typography sx={{ mb: 1 }}>{t('game.timeSpeed')}</Typography>
      <ToggleButtonGroup fullWidth exclusive value={world?.time_speed ?? 0} onChange={(_, value) => { if (value !== null) setSpeed(value); }} sx={{ mb: 2 }}><ToggleButton value={0} aria-label={t('game.paused')}><PauseIcon /></ToggleButton>{[1, 2, 3, 4].map(value => <ToggleButton key={value} value={value}>{value}×</ToggleButton>)}</ToggleButtonGroup>
      <Button fullWidth variant={autoStep ? 'contained' : 'outlined'} data-testid="auto-step-command" onClick={() => setAutoStep(!autoStep)} sx={{ mb: 2 }}>{t('game.autoStep')}</Button>
      <Divider sx={{ my: 1 }} /><Button fullWidth data-testid="save-menu-open" onClick={() => { setMenu(false); setSave(true); }}>{t('save.title')}</Button><Button fullWidth disabled={loading} data-testid="reload-mods-btn" onClick={() => void reload()}>{t('game.reloadMods')}</Button><Button fullWidth onClick={() => { setMenu(false); navigate('/settings'); }}>{t('settings.title')}</Button><Divider sx={{ my: 1 }} /><Button fullWidth onClick={() => { reset(); navigate('/'); }}>{t('game.backToMenu')}</Button>
    </Drawer>
    <SaveManager open={save} onClose={() => setSave(false)} />
  </>;
};
