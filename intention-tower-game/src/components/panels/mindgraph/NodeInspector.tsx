import { Box, Chip, Divider, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { t as translateLabel } from '../../../i18n';
import { NODE_TYPE_COLORS } from './constants';
import type { GraphEdge, GraphNode } from './types';
import type { NodeType } from '../../../types/backend';

type Props = {
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
};

export function NodeInspector({ selectedNode, selectedEdge }: Props) {
  const { t } = useTranslation();

  const nodeTypeText = (type: NodeType) => {
    const keyByType: Record<NodeType, string> = {
      Observation: 'node-type.observation.label',
      PriorInstinct: 'node-type.prior-instinct.label',
      Motivation: 'node-type.motivation.label',
      Action: 'node-type.action.label',
      Meme: 'node-type.meme.label',
    };
    return t(keyByType[type]);
  };

  return (
    <Box sx={{ width: 280, borderLeft: '1px solid rgba(255,255,255,0.08)', bgcolor: '#0b0e12', overflow: 'auto' }}>
      <Box sx={{ p: 1 }}>
        <Typography sx={{ fontSize: 12, color: '#9098a2', mb: 0.8 }}>{t('inspector.title')}</Typography>

        {!selectedNode && !selectedEdge && <Typography sx={{ fontSize: 12, color: '#777' }}>{t('inspector.empty')}</Typography>}

        {selectedNode && (
          <>
            <Typography sx={{ fontSize: 11, color: '#8b96a5', mb: 0.5 }}>{t('inspector.node')}</Typography>
            {!selectedNode.isUnknown && (
              <>
                <Chip
                  label={nodeTypeText(selectedNode.node_type)}
                  size='small'
                  sx={{
                    height: 20,
                    fontSize: 10,
                    bgcolor: NODE_TYPE_COLORS[selectedNode.node_type],
                    color: '#fff',
                    mb: 1,
                  }}
                />
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{translateLabel(selectedNode.label)}</Typography>
                <Typography sx={{ fontSize: 11, color: '#8b96a5', wordBreak: 'break-all', mt: 0.5 }}>
                  {selectedNode.schema_id}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography sx={{ fontSize: 11, color: '#b0bec5' }}>{t('inspector.value', { value: selectedNode.value.toFixed(3) })}</Typography>
                <Typography sx={{ fontSize: 11, color: '#b0bec5' }}>
                  {t('inspector.velocity', { value: `${selectedNode.value_velocity > 0 ? '+' : ''}${selectedNode.value_velocity.toFixed(3)}` })}
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#b0bec5' }}>{t('inspector.strength', { value: selectedNode.strength.toFixed(3) })}</Typography>
                <Typography sx={{ fontSize: 11, color: selectedNode.active ? '#6fcf97' : '#ef5350' }}>
                  {t('inspector.state', { value: selectedNode.active ? t('inspector.active') : t('inspector.inactive') })}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography sx={{ fontSize: 11, color: '#8b96a5' }}>{t('inspector.instanceId')}</Typography>
                <Typography sx={{ fontSize: 10, color: '#94a3b8', wordBreak: 'break-all' }}>
                  {selectedNode.instance_id}
                </Typography>
              </>
            )}

            {selectedNode.isUnknown && (
              <Typography sx={{ fontSize: 12, color: '#90a4ae' }}>
                {t('inspector.unknown')}
              </Typography>
            )}
          </>
        )}

        {selectedEdge && (
          <>
            <Divider sx={{ my: 1.2 }} />
            <Typography sx={{ fontSize: 11, color: '#8b96a5', mb: 0.5 }}>{t('inspector.edge')}</Typography>
            <Typography sx={{ fontSize: 12, color: '#cfd8dc' }}>
              {selectedEdge.source_instance_id} → {selectedEdge.target_instance_id}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#b0bec5' }}>{t('inspector.weight', { value: selectedEdge.weight.toFixed(3) })}</Typography>
            <Typography sx={{ fontSize: 11, color: '#b0bec5' }}>{t('inspector.polarity', { value: selectedEdge.polarity })}</Typography>
            <Typography sx={{ fontSize: 11, color: '#b0bec5' }}>{t('inspector.learnType', { value: selectedEdge.learn_type })}</Typography>
            <Typography sx={{ fontSize: 11, color: selectedEdge.learnable ? '#6fcf97' : '#888' }}>
              {selectedEdge.learnable ? t('inspector.learnable') : t('inspector.fixed')}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#8b96a5' }}>
              {t('inspector.decay', { value: selectedEdge.decay_rate_per_tick.toFixed(4) })}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
