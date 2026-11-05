import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { WorldEvent } from '../../../types/backend';
import { graphNodeLabel } from './constants';
import type { GraphNode } from './types';

export type LearningUpdate = Extract<WorldEvent, { LearningUpdated: unknown }>['LearningUpdated'];

// Small, genuinely paid updates must not appear as a free "0.000" change.
const learningNumber = (value: number) => value.toFixed(value !== 0 && Math.abs(value) < 0.001 ? 6 : 3);

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
              {' · '}{learningNumber(update.old_weight)} → {learningNumber(update.new_weight)}
            </Typography>
            <Typography title={`${update.edge_id}: ${update.source_id} → ${update.target_id}`} sx={{ fontSize: 10, color: '#52616b', overflowWrap: 'anywhere' }}>
              {[update.source_id, update.target_id].map((id) => {
                const node = nodes.find((candidate) => candidate.instance_id === id);
                return node && !node.isUnknown ? graphNodeLabel(node) : t('graph.unknown');
              }).join(' → ')}
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#5f6a73', fontVariantNumeric: 'tabular-nums' }}>
              {t('graph.learning.prediction')} {learningNumber(update.prediction)}
              {' · '}{t('graph.learning.reward')} {learningNumber(update.reward)}
              {' · '}{t('graph.learning.error')} {update.prediction_error > 0 ? '+' : ''}{learningNumber(update.prediction_error)}
              {' · '}{t('graph.learning.dopamine')} {learningNumber(update.dopamine_spent)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
