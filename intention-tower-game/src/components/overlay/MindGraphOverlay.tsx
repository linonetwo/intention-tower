/**
 * Full-screen mind graph workbench.
 * React owns the SVG and every interaction; d3-force is used only by the
 * layout hook as a headless positioning algorithm.
 */
import CloseIcon from '@mui/icons-material/Close';
import { Box, Fade, IconButton, Typography } from '@mui/material';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useGameState } from '../../store/useGameState';
import { MindGraphWorkbench } from '../panels/mindgraph/MindGraphWorkbench';

export function MindGraphOverlay() {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const uiMode = useGameState((state) => state.uiMode);
  const setUiMode = useGameState((state) => state.setUiMode);
  const worldState = useGameState((state) => state.worldState);
  const inspectedCharacterId = useGameState((state) => state.inspectedCharacterId);
  const recentEvents = useGameState((state) => state.recentEvents);
  const isVisible = uiMode === 'graph';
  const character = inspectedCharacterId ? worldState?.characters[inspectedCharacterId] : null;

  useEffect(() => {
    if (!isVisible) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUiMode('observe');
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isVisible, setUiMode]);

  if (!isVisible) return null;

  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
  const panelHeight = layout.isMobile ? viewportHeight : Math.max(520, Math.floor(viewportHeight * 0.76));
  const availableWidth = layout.isMobile
    ? viewportWidth
    : Math.max(620, viewportWidth - layout.statusBarWidth);
  const toolbarAllowance = layout.isMobile ? 154 : 112;
  const graphWidth = Math.max(360, Math.min(1120, availableWidth - (layout.isMobile ? 0 : 310)));
  const graphHeight = Math.max(300, Math.min(760, panelHeight - toolbarAllowance));

  return (
    <Fade in timeout={180}>
      <Box
        role='dialog'
        aria-modal='true'
        aria-label={t('graph.workbench.aria')}
        sx={{
          position: 'absolute',
          top: layout.isMobile ? 0 : 44,
          left: layout.isMobile ? 0 : layout.statusBarWidth,
          right: 0,
          height: layout.isMobile ? '100%' : `${panelHeight}px`,
          zIndex: 30,
          bgcolor: 'rgba(5,8,13,0.93)',
          backdropFilter: 'blur(9px)',
          borderBottom: layout.isMobile ? 'none' : '1px solid rgba(120,150,175,0.24)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.42)',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <IconButton
          aria-label={t('inspector.close')}
          onClick={() => setUiMode('observe')}
          sx={{ position: 'absolute', top: 8, right: 10, color: '#aab7c1', zIndex: 5 }}
        >
          <CloseIcon />
        </IconButton>

        {character && worldState ? (
          <MindGraphWorkbench
            character={character}
            levelId={worldState.level_id}
            recentEvents={recentEvents}
            graphWidth={graphWidth}
            graphHeight={graphHeight}
            mobile={layout.isMobile}
          />
        ) : (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Typography sx={{ color: '#73818c', fontSize: 13 }}>{t('graph.empty')}</Typography>
          </Box>
        )}
      </Box>
    </Fade>
  );
}
