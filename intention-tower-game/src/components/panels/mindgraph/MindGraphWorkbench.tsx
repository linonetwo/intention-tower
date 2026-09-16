import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SearchIcon from '@mui/icons-material/Search';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import { Box, Chip, Divider, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nodeTypeLabel, translateLabel } from '../../../i18n';
import type { NodeType, WorldCharacter, WorldEvent } from '../../../types/backend';
import { NODE_TYPE_COLORS } from './constants';
import { GraphSvg } from './GraphSvg';
import { NodeInspector } from './NodeInspector';
import type { GraphLayoutMode } from './types';
import { useFixedMindGraphLayout } from './useFixedMindGraphLayout';
import { useQuadrantLayout } from './useQuadrantLayout';

const ALL_TYPES: NodeType[] = ['Observation', 'PriorInstinct', 'Motivation', 'Action', 'Meme'];
const MODE_STORAGE_KEY = 'it:mindgraph:layout-mode:v1';

type Props = {
  character: WorldCharacter;
  levelId: string;
  recentEvents: WorldEvent[];
  graphWidth: number;
  graphHeight: number;
  mobile?: boolean;
  compact?: boolean;
};

function readLayoutMode(): GraphLayoutMode {
  if (typeof window === 'undefined') return 'network';
  return window.localStorage.getItem(MODE_STORAGE_KEY) === 'tower' ? 'tower' : 'network';
}

export function MindGraphWorkbench({
  character,
  levelId,
  recentEvents,
  graphWidth,
  graphHeight,
  mobile = false,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const graph = character.mind_graph;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<NodeType>>(new Set());
  const [activeOnly, setActiveOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>(readLayoutMode);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(MODE_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setQuery('');
  }, [character.id]);

  const sortedNodes = useMemo(() => Object.values(graph.nodes).sort((first, second) => {
    const firstResource = first.prior_instinct?.is_resource ? 0 : 1;
    const secondResource = second.prior_instinct?.is_resource ? 0 : 1;
    if (firstResource !== secondResource) return firstResource - secondResource;
    const typeOrder: Record<NodeType, number> = { PriorInstinct: 0, Observation: 1, Motivation: 2, Action: 3, Meme: 4 };
    return typeOrder[first.node_type] - typeOrder[second.node_type] || second.value - first.value;
  }), [graph.nodes]);
  const sortedEdges = useMemo(() => Object.values(graph.edges).sort((first, second) => second.weight - first.weight), [graph.edges]);

  const discoveredNodeIds = useMemo(() => {
    const discovered = new Set<string>();
    sortedNodes.forEach((node) => {
      if (!node.hidden_by_default || node.active) discovered.add(node.instance_id);
    });
    recentEvents.forEach((event) => {
      if ('NodeSpawned' in event && event.NodeSpawned.character_id === character.id) discovered.add(event.NodeSpawned.instance_id);
      if ('NodeActivated' in event && event.NodeActivated.character_id === character.id) discovered.add(event.NodeActivated.instance_id);
      if ('NodeValueChanged' in event && event.NodeValueChanged.character_id === character.id) discovered.add(event.NodeValueChanged.instance_id);
      if ('NodeDeactivated' in event && event.NodeDeactivated.character_id === character.id) discovered.add(event.NodeDeactivated.instance_id);
    });
    return discovered;
  }, [character.id, recentEvents, sortedNodes]);

  const { schemaToCell } = useQuadrantLayout();
  const layoutStorageKey = `it:mindgraph-layout:v1:${levelId}:${character.id}:${layoutMode}`;
  const {
    nodes,
    edges,
    setNodePosition,
    resetLayout,
    hasCustomLayout,
  } = useFixedMindGraphLayout(
    sortedNodes,
    sortedEdges,
    graphWidth,
    graphHeight,
    schemaToCell,
    layoutMode,
    layoutStorageKey,
  );

  const fogNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    isUnknown: node.hidden_by_default && !discoveredNodeIds.has(node.instance_id),
  })), [discoveredNodeIds, nodes]);

  const hiddenNodeIds = useMemo(() => new Set(
    fogNodes
      .filter((node) => hiddenTypes.has(node.node_type) || (activeOnly && !node.active))
      .map((node) => node.instance_id),
  ), [activeOnly, fogNodes, hiddenTypes]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchedNodeIds = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(
      fogNodes
        .filter((node) => !node.isUnknown)
        .filter((node) => [
          translateLabel(node.label),
          node.schema_id,
          node.instance_id,
          nodeTypeLabel(node.node_type),
        ].some((field) => field.toLocaleLowerCase().includes(normalizedQuery)))
        .map((node) => node.instance_id),
    );
  }, [fogNodes, normalizedQuery]);

  const selectedNode = selectedNodeId ? fogNodes.find((node) => node.instance_id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.edge_id === selectedEdgeId) ?? null : null;

  const relationEdgeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedNodeId) {
      edges.forEach((edge) => {
        if (edge.source_instance_id === selectedNodeId || edge.target_instance_id === selectedNodeId) ids.add(edge.edge_id);
      });
    }
    if (selectedEdgeId) ids.add(selectedEdgeId);
    return ids;
  }, [edges, selectedEdgeId, selectedNodeId]);

  const focusNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedNodeId) ids.add(selectedNodeId);
    edges.forEach((edge) => {
      if (selectedNodeId && (edge.source_instance_id === selectedNodeId || edge.target_instance_id === selectedNodeId)) {
        ids.add(edge.source_instance_id);
        ids.add(edge.target_instance_id);
      }
      if (selectedEdgeId === edge.edge_id) {
        ids.add(edge.source_instance_id);
        ids.add(edge.target_instance_id);
      }
    });
    return ids;
  }, [edges, selectedEdgeId, selectedNodeId]);

  const highlightedEdgeIds = useMemo(() => {
    const ids = new Set(relationEdgeIds);
    recentEvents.slice(0, 80).forEach((event) => {
      if ('EdgeWeightChanged' in event && event.EdgeWeightChanged.character_id === character.id && event.EdgeWeightChanged.new_weight > event.EdgeWeightChanged.old_weight) {
        ids.add(event.EdgeWeightChanged.edge_id);
      }
      if ('EdgeCreated' in event && event.EdgeCreated.character_id === character.id) ids.add(event.EdgeCreated.edge_id);
    });
    return ids;
  }, [character.id, recentEvents, relationEdgeIds]);

  useEffect(() => {
    if (selectedNodeId && hiddenNodeIds.has(selectedNodeId)) setSelectedNodeId(null);
    if (selectedEdgeId) {
      const edge = edges.find((candidate) => candidate.edge_id === selectedEdgeId);
      if (!edge || hiddenNodeIds.has(edge.source_instance_id) || hiddenNodeIds.has(edge.target_instance_id)) setSelectedEdgeId(null);
    }
  }, [edges, hiddenNodeIds, selectedEdgeId, selectedNodeId]);

  const toggleType = useCallback((type: NodeType) => {
    setHiddenTypes((previous) => {
      const next = new Set(previous);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, []);
  const selectEdge = useCallback((id: string) => {
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  return (
    <Box data-testid='mind-graph-workbench' sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'rgba(6,9,14,0.78)' }}>
      <Box sx={{ px: mobile ? 1 : 1.4, pt: compact ? 0.7 : 1, pb: 0.65 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap', pr: mobile ? 5 : 0 }}>
          <Typography sx={{ fontSize: compact ? 13 : 14.5, fontWeight: 650, color: '#e2eaf0' }}>
            {t('graph.title', { name: translateLabel(character.label) })}
          </Typography>
          <Chip label={t('graph.nodes', { count: fogNodes.length - hiddenNodeIds.size })} size='small' sx={{ height: 19, fontSize: 9 }} />
          <Chip label={t('graph.edges', { count: edges.length })} size='small' sx={{ height: 19, fontSize: 9 }} />
          <Box sx={{ flex: 1 }} />
          <ToggleButtonGroup
            exclusive
            size='small'
            value={layoutMode}
            onChange={(_, next: GraphLayoutMode | null) => next && setLayoutMode(next)}
            aria-label={t('graph.layout.aria')}
            sx={{ height: 29, '& .MuiToggleButton-root': { px: mobile ? 0.7 : 1, fontSize: 9, gap: 0.45 } }}
          >
            <ToggleButton value='network' aria-label={t('graph.layout.network')}><AccountTreeIcon sx={{ fontSize: 15 }} />{!mobile && t('graph.layout.network')}</ToggleButton>
            <ToggleButton value='tower' aria-label={t('graph.layout.tower')}><ViewStreamIcon sx={{ fontSize: 15 }} />{!mobile && t('graph.layout.tower')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.7, flexWrap: 'wrap' }}>
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('graph.search.placeholder')}
            size='small'
            inputProps={{ 'aria-label': t('graph.search.aria') }}
            InputProps={{ startAdornment: <InputAdornment position='start'><SearchIcon sx={{ fontSize: 15, color: '#718696' }} /></InputAdornment> }}
            sx={{ width: mobile ? '100%' : 220, '& .MuiInputBase-root': { height: 29, fontSize: 10.5, bgcolor: 'rgba(255,255,255,0.035)' } }}
          />
          <Chip
            clickable
            variant={activeOnly ? 'filled' : 'outlined'}
            color={activeOnly ? 'success' : 'default'}
            label={t('graph.filter.activeOnly')}
            onClick={() => setActiveOnly((value) => !value)}
            sx={{ height: 24, fontSize: 9.5 }}
          />
          {ALL_TYPES.map((type) => {
            const hidden = hiddenTypes.has(type);
            return (
              <Tooltip key={type} title={hidden ? t('graph.filter.show', { type: nodeTypeLabel(type) }) : t('graph.filter.hide', { type: nodeTypeLabel(type) })}>
                <Chip
                  clickable
                  onClick={() => toggleType(type)}
                  label={nodeTypeLabel(type)}
                  size='small'
                  sx={{ height: 24, fontSize: 9, bgcolor: hidden ? '#242b32' : NODE_TYPE_COLORS[type], color: hidden ? '#73818c' : '#fff', opacity: hidden ? 0.7 : 1 }}
                />
              </Tooltip>
            );
          })}
          {matchedNodeIds !== null && (
            <Typography sx={{ fontSize: 9.5, color: matchedNodeIds.size > 0 ? '#7fc7f2' : '#ff7d87' }}>
              {t('graph.search.results', { count: matchedNodeIds.size })}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider sx={{ borderColor: 'rgba(120,150,175,0.17)' }} />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <GraphSvg
          nodes={fogNodes}
          edges={edges}
          width={graphWidth}
          height={graphHeight}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          highlightedEdgeIds={highlightedEdgeIds}
          hiddenNodeIds={hiddenNodeIds}
          focusNodeIds={focusNodeIds}
          matchedNodeIds={matchedNodeIds}
          onSelectNode={selectNode}
          onSelectEdge={selectEdge}
          onDeselect={clearSelection}
          onMoveNode={setNodePosition}
          onResetLayout={resetLayout}
          canResetLayout={hasCustomLayout}
        />
        {(selectedNode || selectedEdge) && !mobile && (
          <NodeInspector
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            nodes={fogNodes}
            edges={edges}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onClose={clearSelection}
          />
        )}
        {(selectedNode || selectedEdge) && mobile && (
          <Box sx={{ position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: 0 }}>
            <NodeInspector
              variant='drawer'
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              nodes={fogNodes}
              edges={edges}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
              onClose={clearSelection}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
