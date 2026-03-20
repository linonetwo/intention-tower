/**
 * MindGraphOverlay — full-screen semi-transparent overlay showing the mind graph.
 * Activated when uiMode === 'graph'. Press ESC or click backdrop to close.
 */
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Box, Chip, Divider, Fade, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import type { NodeType } from '../../types/backend';
import { NODE_TYPE_COLORS } from '../panels/mindgraph/constants';
import { GraphSvg } from '../panels/mindgraph/GraphSvg';
import { NodeInspector } from '../panels/mindgraph/NodeInspector';
import { useFixedMindGraphLayout } from '../panels/mindgraph/useFixedMindGraphLayout';
import { useQuadrantLayout } from '../panels/mindgraph/useQuadrantLayout';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const ALL_TYPES: NodeType[] = ['Observation', 'PriorInstinct', 'Motivation', 'Action', 'Meme'];

export const MindGraphOverlay: React.FC = () => {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const uiMode = useGameState((s) => s.uiMode);
  const setUiMode = useGameState((s) => s.setUiMode);
  const worldState = useGameState((s) => s.worldState);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);
  const recentEvents = useGameState((s) => s.recentEvents);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<NodeType>>(new Set());

  const isVisible = uiMode === 'graph';

  const character = inspectedCharacterId ? worldState?.characters[inspectedCharacterId] : null;
  const graph = character?.mind_graph;

  const sortedNodes = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.nodes).sort((a, b) => {
      const aR = a.prior_instinct?.is_resource ? 0 : 1;
      const bR = b.prior_instinct?.is_resource ? 0 : 1;
      if (aR !== bR) return aR - bR;
      const order: Record<string, number> = { PriorInstinct: 0, Observation: 1, Motivation: 2, Action: 3, Meme: 4 };
      return (order[a.node_type] ?? 5) - (order[b.node_type] ?? 5) || b.value - a.value;
    });
  }, [graph]);

  const discoveredNodeIds = useMemo(() => {
    const discovered = new Set<string>();
    if (!graph || !inspectedCharacterId) return discovered;
    Object.values(graph.nodes).forEach(n => {
      if (!n.hidden_by_default || n.active) discovered.add(n.instance_id);
    });
    recentEvents.forEach(ev => {
      if ('NodeSpawned' in ev && ev.NodeSpawned.character_id === inspectedCharacterId) discovered.add(ev.NodeSpawned.instance_id);
      if ('NodeActivated' in ev && ev.NodeActivated.character_id === inspectedCharacterId) discovered.add(ev.NodeActivated.instance_id);
      if ('NodeValueChanged' in ev && ev.NodeValueChanged.character_id === inspectedCharacterId) discovered.add(ev.NodeValueChanged.instance_id);
      if ('NodeDeactivated' in ev && ev.NodeDeactivated.character_id === inspectedCharacterId) discovered.add(ev.NodeDeactivated.instance_id);
    });
    return discovered;
  }, [graph, inspectedCharacterId, recentEvents]);

  const sortedEdges = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.edges).sort((a, b) => b.weight - a.weight);
  }, [graph]);

  const { schemaToCell } = useQuadrantLayout();

  // Dynamic sizing: full-screen on mobile, top-half panel on larger screens
  const panelHeight = layout.isMobile ? window.innerHeight : Math.max(340, Math.floor(window.innerHeight * 0.56));
  const availableWidth = layout.isMobile
    ? window.innerWidth - 60
    : Math.max(480, window.innerWidth - layout.statusBarWidth - 40);
  const availableHeight = layout.isMobile
    ? window.innerHeight - 140
    : Math.max(260, panelHeight - 120);
  const graphWidth = Math.min(availableWidth, 1000);
  const graphHeight = Math.min(availableHeight, 700);

  const { nodes, edges } = useFixedMindGraphLayout(sortedNodes, sortedEdges, graphWidth, graphHeight, schemaToCell);

  const fogNodes = useMemo(() => {
    return nodes.map(n => ({
      ...n,
      isUnknown: n.hidden_by_default && !discoveredNodeIds.has(n.instance_id),
    }));
  }, [nodes, discoveredNodeIds]);

  const highlightedEdgeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!inspectedCharacterId) return ids;
    recentEvents.slice(0, 80).forEach(ev => {
      if ('EdgeWeightChanged' in ev && ev.EdgeWeightChanged.character_id === inspectedCharacterId) {
        if (ev.EdgeWeightChanged.new_weight > ev.EdgeWeightChanged.old_weight) ids.add(ev.EdgeWeightChanged.edge_id);
      }
      if ('EdgeCreated' in ev && ev.EdgeCreated.character_id === inspectedCharacterId) ids.add(ev.EdgeCreated.edge_id);
    });
    return ids;
  }, [inspectedCharacterId, recentEvents]);

  const selectedNode = selectedNodeId ? fogNodes.find(n => n.instance_id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find(e => e.edge_id === selectedEdgeId) ?? null : null;

  const toggleType = useCallback((type: NodeType) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  const nodeTypeText = (type: NodeType) => {
    const keys: Record<NodeType, string> = {
      Observation: 'node-type.observation.label',
      PriorInstinct: 'node-type.prior-instinct.label',
      Motivation: 'node-type.motivation.label',
      Action: 'node-type.action.label',
      Meme: 'node-type.meme.label',
    };
    return t(keys[type]);
  };

  // Reset selection when hidden
  useEffect(() => {
    if (!isVisible) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <Fade in={isVisible} timeout={200}>
      <Box
        sx={{
          position: 'absolute',
          top: layout.isMobile ? 0 : 44,
          left: layout.isMobile ? 0 : layout.statusBarWidth,
          right: 0,
          height: layout.isMobile ? '100%' : `${panelHeight}px`,
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          bgcolor: layout.isMobile ? 'rgba(6,6,16,0.88)' : 'rgba(6,6,16,0.78)',
          backdropFilter: 'blur(6px)',
          pointerEvents: 'auto',
          borderBottom: layout.isMobile ? 'none' : '1px solid rgba(42,42,78,0.45)',
        }}
        onClick={(e) => {
          // Click backdrop to close
          if (e.target === e.currentTarget) setUiMode('observe');
        }}
      >
        {/* Close button */}
        <IconButton
          onClick={() => setUiMode('observe')}
          sx={{ position: 'absolute', top: 10, right: 12, color: '#aaa', zIndex: 2 }}
        >
          <CloseIcon />
        </IconButton>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, mt: 1, flexWrap: 'wrap', px: 2 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#ddd' }}>
            {character ? t('graph.title', { name: translateLabel(character.label) }) : t('graph.empty')}
          </Typography>
          <Chip label={t('graph.nodes', { count: fogNodes.length })} size="small" sx={{ height: 18, fontSize: 9 }} />
          <Chip label={t('graph.edges', { count: edges.length })} size="small" sx={{ height: 18, fontSize: 9 }} />
        </Box>

        {/* Type filters */}
        <Box sx={{ display: 'flex', gap: 0.6, mb: 0.5, flexWrap: 'wrap', px: 2 }}>
          {ALL_TYPES.map(type => {
            const hidden = hiddenTypes.has(type);
            return (
              <Chip
                key={type}
                onClick={() => toggleType(type)}
                label={hidden ? t('graph.filter.show', { type: nodeTypeText(type) }) : t('graph.filter.hide', { type: nodeTypeText(type) })}
                size="small"
                sx={{ height: 18, fontSize: 9, bgcolor: hidden ? '#2b2f36' : NODE_TYPE_COLORS[type], color: '#fff', cursor: 'pointer' }}
              />
            );
          })}
        </Box>

        <Divider sx={{ width: '90%', borderColor: 'rgba(42,42,78,0.4)', mb: 0.5 }} />

        {/* Graph + Inspector */}
        {graph ? (
          <Box sx={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', maxWidth: graphWidth + 300, px: 1 }}>
            <GraphSvg
              nodes={fogNodes}
              edges={edges}
              width={graphWidth}
              height={graphHeight}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              highlightedEdgeIds={highlightedEdgeIds}
              hiddenTypes={hiddenTypes}
              onSelectNode={(id) => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
              onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
              onDeselect={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
            />
            {(selectedNode || selectedEdge) && (
              <NodeInspector selectedNode={selectedNode} selectedEdge={selectedEdge} />
            )}
          </Box>
        ) : (
          <Typography sx={{ color: '#666', fontSize: 14 }}>{t('graph.empty')}</Typography>
        )}
      </Box>
    </Fade>
  );
};
