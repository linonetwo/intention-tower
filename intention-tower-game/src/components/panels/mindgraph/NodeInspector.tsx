import CloseIcon from '@mui/icons-material/Close';
import { Box, ButtonBase, Chip, Divider, IconButton, LinearProgress, Tab, Tabs, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nodeTypeLabel, translateLabel } from '../../../i18n';
import { NODE_TYPE_COLORS } from './constants';
import type { GraphEdge, GraphNode } from './types';

type Props = {
  selectedNode: GraphNode | null;
  selectedEdge: GraphEdge | null;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  onSelectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  variant?: 'side' | 'drawer';
  onClose?: () => void;
};

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  const bounded = Math.max(0, Math.min(1, value));
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
        <Typography sx={{ fontSize: 10, color: '#8fa0ad' }}>{label}</Typography>
        <Typography sx={{ fontSize: 10, color: '#c9d4dc', fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(3)}</Typography>
      </Box>
      <LinearProgress
        variant='determinate'
        value={bounded * 100}
        sx={{ height: 4, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { bgcolor: color } }}
      />
    </Box>
  );
}

export function NodeInspector({
  selectedNode,
  selectedEdge,
  nodes = [],
  edges = [],
  onSelectNode,
  onSelectEdge,
  variant = 'side',
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const selectedKey = selectedNode?.instance_id ?? selectedEdge?.edge_id ?? '';
  useEffect(() => setTab(0), [selectedKey]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.instance_id, node])), [nodes]);
  const relatedEdges = useMemo(() => {
    if (selectedNode) {
      return edges.filter((edge) => edge.source_instance_id === selectedNode.instance_id || edge.target_instance_id === selectedNode.instance_id);
    }
    return selectedEdge ? [selectedEdge] : [];
  }, [edges, selectedEdge, selectedNode]);

  const sourceNode = selectedEdge ? nodeMap.get(selectedEdge.source_instance_id) : null;
  const targetNode = selectedEdge ? nodeMap.get(selectedEdge.target_instance_id) : null;
  const title = selectedNode
    ? (selectedNode.isUnknown ? t('graph.unknown') : translateLabel(selectedNode.label))
    : selectedEdge
      ? t('inspector.relationship')
      : t('inspector.title');

  return (
    <Box
      data-testid='mind-graph-inspector'
      sx={{
        width: variant === 'side' ? 310 : '100%',
        maxWidth: '100%',
        height: variant === 'side' ? '100%' : 'min(46vh, 390px)',
        borderLeft: variant === 'side' ? '1px solid rgba(118,151,180,0.2)' : 'none',
        borderTop: variant === 'drawer' ? '1px solid rgba(118,151,180,0.28)' : 'none',
        bgcolor: 'rgba(7,11,17,0.97)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: variant === 'drawer' ? '0 -12px 36px rgba(0,0,0,0.5)' : '-12px 0 30px rgba(0,0,0,0.22)',
      }}
    >
      <Box sx={{ px: 1.25, pt: 1, display: 'flex', alignItems: 'center', gap: 0.8 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 9, letterSpacing: 1.1, color: '#6f8190', textTransform: 'uppercase' }}>
            {selectedNode ? t('inspector.object') : t('inspector.relationship')}
          </Typography>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 650, color: '#e4edf4' }}>{title}</Typography>
        </Box>
        {onClose && <IconButton size='small' aria-label={t('inspector.close')} onClick={onClose}><CloseIcon fontSize='small' /></IconButton>}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, value: number) => setTab(value)}
        variant='fullWidth'
        sx={{ minHeight: 34, mt: 0.5, borderBottom: '1px solid rgba(255,255,255,0.06)', '& .MuiTab-root': { minHeight: 34, py: 0, px: 0.5, fontSize: 10 } }}
      >
        <Tab label={t('inspector.tab.overview')} />
        <Tab label={t('inspector.tab.relations', { count: relatedEdges.length })} />
        <Tab label={t('inspector.tab.evidence')} />
      </Tabs>

      <Box sx={{ p: 1.25, overflowY: 'auto', flex: 1 }}>
        {!selectedNode && !selectedEdge && <Typography sx={{ fontSize: 12, color: '#777' }}>{t('inspector.empty')}</Typography>}

        {tab === 0 && selectedNode && (
          selectedNode.isUnknown ? (
            <Typography sx={{ fontSize: 12, color: '#90a4ae' }}>{t('inspector.unknown')}</Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1.25, flexWrap: 'wrap' }}>
                <Chip
                  label={nodeTypeLabel(selectedNode.node_type)}
                  size='small'
                  sx={{ height: 21, fontSize: 9.5, bgcolor: NODE_TYPE_COLORS[selectedNode.node_type], color: '#fff' }}
                />
                <Chip
                  label={!selectedNode.active ? t('inspector.inactive') : selectedNode.attended ? t('inspector.active') : t('inspector.unattended')}
                  size='small'
                  variant='outlined'
                  sx={{ height: 21, fontSize: 9.5, color: !selectedNode.active ? '#ef6f78' : selectedNode.attended ? '#65d6a6' : '#ffca58' }}
                />
              </Box>
              <Metric label={t('inspector.valueLabel')} value={selectedNode.value} color={NODE_TYPE_COLORS[selectedNode.node_type]} />
              <Metric label={t('inspector.strengthLabel')} value={selectedNode.strength} color='#9cb9d0' />
              {selectedNode.suppression > 0 && <Metric label={t('inspector.suppressionLabel')} value={selectedNode.suppression} color='#ffad42' />}
              <Divider sx={{ my: 1.2 }} />
              <Typography sx={{ fontSize: 10, color: '#738492' }}>{t('inspector.schema')}</Typography>
              <Typography sx={{ fontSize: 10.5, color: '#b7c7d3', wordBreak: 'break-all', mb: 0.8 }}>{selectedNode.schema_id}</Typography>
              <Typography sx={{ fontSize: 10, color: '#738492' }}>{t('inspector.velocity', { value: `${selectedNode.value_velocity > 0 ? '+' : ''}${selectedNode.value_velocity.toFixed(3)}` })}</Typography>
              {selectedNode.meme && (
                <Box sx={{ mt: 1, p: 0.8, borderRadius: 1, bgcolor: 'rgba(255,167,38,0.06)', border: '1px solid rgba(255,167,38,0.18)' }}>
                  <Typography sx={{ fontSize: 10, color: '#ffbd66' }}>{t('inspector.memeProfile')}</Typography>
                  <Typography sx={{ fontSize: 10, color: '#aebbc5' }}>
                    {[
                      selectedNode.meme.is_belief && t('inspector.meme.belief'),
                      selectedNode.meme.is_identity && t('inspector.meme.identity'),
                      selectedNode.meme.is_anti_meme && t('inspector.meme.antimeme'),
                      selectedNode.meme.is_magic && t('inspector.meme.magic'),
                    ].filter(Boolean).join(' · ') || t('inspector.meme.generic')}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: '#aebbc5' }}>{t('inspector.resilience', { value: selectedNode.meme.resilience.toFixed(2) })}</Typography>
                </Box>
              )}
              <Box sx={{ mt: 1.2, p: 0.8, borderRadius: 1, bgcolor: 'rgba(66,165,245,0.055)', border: '1px solid rgba(66,165,245,0.15)' }}>
                <Typography sx={{ fontSize: 10, color: '#8dbbe0' }}>{t('inspector.editingHint')}</Typography>
              </Box>
            </>
          )
        )}

        {tab === 0 && selectedEdge && (
          <>
            <Typography sx={{ fontSize: 10, color: '#718392', mb: 0.5 }}>{t('inspector.direction')}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.2 }}>
              {[sourceNode, targetNode].map((node, index) => (
                <Box key={index} sx={{ display: 'contents' }}>
                  {index === 1 && <Typography sx={{ color: selectedEdge.polarity === 'Excitatory' ? '#64d8a2' : '#ff6577' }}>→</Typography>}
                  <ButtonBase
                    disabled={!node}
                    onClick={() => node && onSelectNode?.(node.instance_id)}
                    sx={{ minWidth: 0, px: 0.8, py: 0.5, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
                  >
                    <Typography noWrap sx={{ maxWidth: 105, fontSize: 10.5, color: '#d4e0e8' }}>{node ? translateLabel(node.label) : index === 0 ? selectedEdge.source_instance_id : selectedEdge.target_instance_id}</Typography>
                  </ButtonBase>
                </Box>
              ))}
            </Box>
            <Metric label={t('inspector.weightLabel')} value={Math.abs(selectedEdge.weight)} color={selectedEdge.polarity === 'Excitatory' ? '#64d8a2' : '#ff6577'} />
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.polarity', { value: selectedEdge.polarity })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.learnType', { value: selectedEdge.learn_type })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: selectedEdge.learnable ? '#64d8a2' : '#77838c' }}>{selectedEdge.learnable ? t('inspector.learnable') : t('inspector.fixed')}</Typography>
          </>
        )}

        {tab === 1 && (
          relatedEdges.length === 0 ? (
            <Typography sx={{ fontSize: 11, color: '#6f7c86' }}>{t('inspector.noRelations')}</Typography>
          ) : relatedEdges.map((edge) => {
            const incoming = selectedNode?.instance_id === edge.target_instance_id;
            const otherId = selectedNode
              ? (incoming ? edge.source_instance_id : edge.target_instance_id)
              : edge.target_instance_id;
            const other = nodeMap.get(otherId);
            return (
              <ButtonBase
                key={edge.edge_id}
                onClick={() => onSelectEdge?.(edge.edge_id)}
                sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 0.8, textAlign: 'left', px: 0.8, py: 0.75, mb: 0.55, borderRadius: 1, border: '1px solid rgba(255,255,255,0.075)', bgcolor: 'rgba(255,255,255,0.025)', '&:hover': { bgcolor: 'rgba(100,216,162,0.07)' } }}
              >
                <Typography sx={{ color: edge.polarity === 'Excitatory' ? '#64d8a2' : '#ff6577', fontSize: 15 }}>{incoming ? '←' : '→'}</Typography>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ fontSize: 10.5, color: '#d0dce5' }}>{other ? translateLabel(other.label) : otherId}</Typography>
                  <Typography sx={{ fontSize: 9.5, color: '#718392' }}>{edge.learn_type} · {edge.weight.toFixed(2)}</Typography>
                </Box>
                {edge.learnable && <Chip label={t('graph.edge.learnable')} size='small' sx={{ height: 18, fontSize: 8.5 }} />}
              </ButtonBase>
            );
          })
        )}

        {tab === 2 && selectedEdge && (
          <>
            <Metric label={t('inspector.coOccurrence')} value={Math.min(1, selectedEdge.evidence.co_occurrence_count / 10)} color='#42a5f5' />
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.coOccurrenceCount', { value: selectedEdge.evidence.co_occurrence_count })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.lastEvidence', { value: selectedEdge.evidence.last_co_occurred_at })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.window', { value: selectedEdge.evidence.window_sec.toFixed(1) })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.decay', { value: selectedEdge.decay_rate_per_tick.toFixed(4) })}</Typography>
          </>
        )}

        {tab === 2 && selectedNode && (
          <>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.createdAt', { value: selectedNode.created_at })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.ttl', { value: selectedNode.ttl ?? '∞' })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: '#aebbc5' }}>{t('inspector.realityLayer', { value: selectedNode.reality_layer })}</Typography>
            <Typography sx={{ fontSize: 10.5, color: selectedNode.is_virtual ? '#ab8bea' : '#64d8a2' }}>{selectedNode.is_virtual ? t('inspector.virtual') : t('inspector.physical')}</Typography>
            <Divider sx={{ my: 1 }} />
            <Typography sx={{ fontSize: 9.5, color: '#687985' }}>{t('inspector.instanceId')}</Typography>
            <Typography sx={{ fontSize: 9.5, color: '#93a5b2', wordBreak: 'break-all' }}>{selectedNode.instance_id}</Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
