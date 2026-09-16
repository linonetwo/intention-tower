import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useGameState } from '../../store/useGameState';
import { GRAPH_HEIGHT, GRAPH_WIDTH } from './mindgraph/constants';
import { MindGraphWorkbench } from './mindgraph/MindGraphWorkbench';

export function MindGraphPanel() {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const worldState = useGameState((state) => state.worldState);
  const inspectedCharacterId = useGameState((state) => state.inspectedCharacterId);
  const recentEvents = useGameState((state) => state.recentEvents);
  const character = inspectedCharacterId ? worldState?.characters[inspectedCharacterId] : null;

  if (!character || !worldState) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ color: '#66737d', fontSize: 13 }}>{t('graph.empty')}</Typography>
      </Box>
    );
  }

  return (
    <MindGraphWorkbench
      character={character}
      levelId={worldState.level_id}
      recentEvents={recentEvents}
      graphWidth={GRAPH_WIDTH}
      graphHeight={GRAPH_HEIGHT}
      mobile={layout.isMobile}
      compact
    />
  );
}
