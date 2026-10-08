import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { WorldEvent } from '../../../types/backend';
import { graphNodeLabel } from './constants';
import type { GraphNode } from './types';

export type LearningUpdate = Extract<WorldEvent, { LearningUpdated: unknown }>['LearningUpdated'];

export function LearningTrace({ updates, nodes }: { updates: LearningUpdate[]; nodes: GraphNode[] }) {
  const { t } = useTranslation();
  if (updates.length === 0) return null;
  return (
    <Box data-testid='graph-learning-trace' sx={{ px: 1.25, py: 0.8, borderBottom: '1px solid rgba(154,113,62,0.16)', bgcolor: '#fff8e9', maxHeight: 112, overflowY: 'auto' }}>
      {updates.map((update, index) => {
        const color = update.phase === 'extinguished' ? '#965124' : update.phase === 'created' ? '#38616a' : '#35633f';
        return (
          <Box key={`${update.edge_id}:${index}`} sx={{ mb: 0.35 }}>
            <Typography sx={{ fontSize: 11, color, overflowWrap: 'anywhere' }}>
              {t(`graph.learning.${update.phase}`)}
              {' · '}{update.old_weight.toFixed(3)} → {update.new_weight.toFixed(3)}
            </Typography>
            <Typography title={`${update.edge_id}: ${update.source_id} → ${update.target_id}`} sx={{ fontSize: 10, color: '#52616b', overflowWrap: 'anywhere' }}>
              {[update.source_id, update.target_id].map((id) => {
                const node = nodes.find((candidate) => candidate.instance_id === id);
                return node && !node.isUnknown ? graphNodeLabel(node) : t('graph.unknown');
              }).join(' → ')}
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#5f6a73', fontVariantNumeric: 'tabular-nums' }}>
              {t('graph.learning.prediction')} {update.prediction.toFixed(3)}
              {' · '}{t('graph.learning.reward')} {update.reward.toFixed(3)}
              {' · '}{t('graph.learning.error')} {update.prediction_error > 0 ? '+' : ''}{update.prediction_error.toFixed(3)}
              {' · '}{t('graph.learning.dopamine')} {update.dopamine_spent.toFixed(3)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
