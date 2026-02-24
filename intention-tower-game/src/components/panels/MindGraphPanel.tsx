import { Box, Chip, Divider, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as translateLabel } from '../../i18n';
import { useGameState } from '../../store/useGameState';
import type { NodeType } from '../../types/backend';
import { GRAPH_HEIGHT, GRAPH_WIDTH, NODE_TYPE_COLORS } from './mindgraph/constants';
import { GraphSvg } from './mindgraph/GraphSvg';
import { NodeInspector } from './mindgraph/NodeInspector';
import { useFixedMindGraphLayout } from './mindgraph/useFixedMindGraphLayout';
import { useQuadrantLayout } from './mindgraph/useQuadrantLayout';

const ALL_TYPES: NodeType[] = ['Observation', 'PriorInstinct', 'Motivation', 'Action', 'Meme'];

export function MindGraphPanel() {
  const { t } = useTranslation();
  const worldState = useGameState((s) => s.worldState);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<NodeType>>(new Set());

  const character = inspectedCharacterId ? worldState?.characters[inspectedCharacterId] : null;
  const graph = character?.mind_graph;

  const sortedNodes = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.nodes)
      .filter((n) => !n.hidden_by_default || n.active)
      .sort((a, b) => {
        const aResource = a.prior_instinct?.is_resource ? 0 : 1;
        const bResource = b.prior_instinct?.is_resource ? 0 : 1;
        if (aResource !== bResource) return aResource - bResource;

        const typeOrder: Record<string, number> = {
          PriorInstinct: 0,
          Observation: 1,
          Motivation: 2,
          Action: 3,
          Meme: 4,
        };
        const aType = typeOrder[a.node_type] ?? 5;
        const bType = typeOrder[b.node_type] ?? 5;
        if (aType !== bType) return aType - bType;

        return b.value - a.value;
      });
  }, [graph]);

  const sortedEdges = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.edges).sort((a, b) => b.weight - a.weight);
  }, [graph]);

  const { schemaToCell } = useQuadrantLayout();

  const { nodes, edges } = useFixedMindGraphLayout(
    sortedNodes,
    sortedEdges,
    GRAPH_WIDTH,
    GRAPH_HEIGHT,
    schemaToCell,
  );

  const selectedNode = selectedNodeId ? nodes.find((n) => n.instance_id === selectedNodeId) ?? null : null;
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.edge_id === selectedEdgeId) ?? null : null;

  const toggleType = (type: NodeType) => {
    setHiddenTypes((previous) => {
      const next = new Set(previous);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

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

  if (!character || !graph) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: '#666', fontSize: 13 }}>
          {t('graph.empty')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 1, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {t('graph.title', { name: translateLabel(character.label) })}
        </Typography>

        <Chip label={t('graph.nodes', { count: nodes.length })} size='small' sx={{ height: 18, fontSize: 10 }} />
        <Chip label={t('graph.edges', { count: edges.length })} size='small' sx={{ height: 18, fontSize: 10 }} />
        <Typography sx={{ fontSize: 10, color: '#777' }}>{t('graph.hint')}</Typography>
      </Box>

      <Box sx={{ px: 1, pb: 0.7, display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
        {ALL_TYPES.map((type) => {
          const hidden = hiddenTypes.has(type);
          return (
            <Chip
              key={type}
              onClick={() => {
                toggleType(type);
              }}
              label={hidden ? t('graph.filter.show', { type: nodeTypeText(type) }) : t('graph.filter.hide', { type: nodeTypeText(type) })}
              size='small'
              sx={{
                height: 20,
                fontSize: 10,
                bgcolor: hidden ? '#2b2f36' : NODE_TYPE_COLORS[type],
                color: '#fff',
              }}
            />
          );
        })}
      </Box>

      <Divider />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <GraphSvg
          nodes={nodes}
          edges={edges}
          width={GRAPH_WIDTH}
          height={GRAPH_HEIGHT}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          hiddenTypes={hiddenTypes}
          onSelectNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
          }}
          onSelectEdge={(edgeId) => {
            setSelectedEdgeId(edgeId);
            setSelectedNodeId(null);
          }}
        />

        <NodeInspector selectedNode={selectedNode} selectedEdge={selectedEdge} />
      </Box>
    </Box>
  );
}
