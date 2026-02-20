/**
 * MindGraphPanel — center area showing the inspected character's mind graph.
 * Displays nodes as a readable table with value bars and type badges.
 * Displays edges as a separate list.
 */
import React, { useMemo } from 'react';
import {
  Box, Typography, Chip, LinearProgress, Divider, Tooltip,
} from '@mui/material';
import { useGameState } from '../../store/useGameState';
import { t } from '../../i18n';
import type { MindNode, AssociationEdge, NodeType } from '../../types/backend';

const NODE_TYPE_COLORS: Record<NodeType, string> = {
  Observation: '#42a5f5',
  PriorInstinct: '#ab47bc',
  Motivation: '#ef5350',
  Action: '#66bb6a',
  Meme: '#ffa726',
};

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  Observation: '观察',
  PriorInstinct: '本能',
  Motivation: '动机',
  Action: '行动',
  Meme: '模因',
};

const NodeRow: React.FC<{ node: MindNode }> = ({ node }) => {
  const clampedValue = Math.max(0, Math.min(1, node.value));
  const color = NODE_TYPE_COLORS[node.node_type];
  const valueStr = node.value.toFixed(2);

  // Build extra info chips
  const extras: string[] = [];
  if (node.prior_instinct?.is_resource) extras.push('资源');
  if (node.prior_instinct?.is_mood) extras.push('心情');
  if (node.meme?.is_belief) extras.push('信念');
  if (node.meme?.is_identity) extras.push('身份');
  if (node.meme?.is_magic) extras.push('魔法');
  if (node.meme?.is_anti_meme) extras.push('逆模因');
  if (node.meme?.is_attention_flood) extras.push('泛洪');
  if (!node.active) extras.push('未激活');

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1,
      opacity: node.active ? 1 : 0.4,
      '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
    }}>
      {/* Type badge */}
      <Chip
        label={NODE_TYPE_LABELS[node.node_type]}
        size="small"
        sx={{
          height: 18, fontSize: 9, fontWeight: 600, minWidth: 36,
          bgcolor: color, color: '#fff',
        }}
      />

      {/* Label */}
      <Tooltip title={`${node.schema_id} (${node.instance_id})`} arrow placement="top">
        <Typography sx={{ fontSize: 12, minWidth: 100, maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t(node.label)}
        </Typography>
      </Tooltip>

      {/* Value bar */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 80 }}>
        <LinearProgress
          variant="determinate"
          value={clampedValue * 100}
          sx={{
            flex: 1, height: 8, borderRadius: 4,
            bgcolor: 'rgba(255,255,255,0.08)',
            '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 },
          }}
        />
        <Typography sx={{ fontSize: 10, color: '#aaa', minWidth: 30, textAlign: 'right', fontFamily: 'monospace' }}>
          {valueStr}
        </Typography>
      </Box>

      {/* Velocity indicator */}
      {node.value_velocity !== 0 && (
        <Typography sx={{ fontSize: 10, color: node.value_velocity > 0 ? '#66bb6a' : '#ef5350', minWidth: 28, fontFamily: 'monospace' }}>
          {node.value_velocity > 0 ? '+' : ''}{node.value_velocity.toFixed(3)}
        </Typography>
      )}

      {/* Strength */}
      <Typography sx={{ fontSize: 10, color: '#666', minWidth: 16, fontFamily: 'monospace' }}>
        s{node.strength.toFixed(1)}
      </Typography>

      {/* Extra badges */}
      {extras.map((ex) => (
        <Chip key={ex} label={ex} size="small" variant="outlined" sx={{ height: 16, fontSize: 8, borderColor: '#555' }} />
      ))}
    </Box>
  );
};

const EdgeRow: React.FC<{ edge: AssociationEdge; nodes: Record<string, MindNode> }> = ({ edge, nodes }) => {
  const source = nodes[edge.source_instance_id];
  const target = nodes[edge.target_instance_id];
  const isInhibitory = edge.polarity === 'Inhibitory';
  const color = isInhibitory ? '#ef5350' : '#66bb6a';
  const arrow = isInhibitory ? '⊣' : '→';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25, px: 1, fontSize: 11 }}>
      <Typography sx={{ fontSize: 11, color: '#aaa', minWidth: 100, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {source ? t(source.label) : edge.source_instance_id}
      </Typography>
      <Typography sx={{ fontSize: 13, color, fontWeight: 600 }}>{arrow}</Typography>
      <Typography sx={{ fontSize: 11, color: '#aaa', minWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {target ? t(target.label) : edge.target_instance_id}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <LinearProgress
        variant="determinate"
        value={Math.min(1, edge.weight) * 100}
        sx={{
          width: 50, height: 4, borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 },
        }}
      />
      <Typography sx={{ fontSize: 10, color: '#888', fontFamily: 'monospace', minWidth: 26 }}>
        {edge.weight.toFixed(2)}
      </Typography>
      {edge.learnable && (
        <Chip label="可学" size="small" variant="outlined" sx={{ height: 14, fontSize: 8, borderColor: '#555' }} />
      )}
    </Box>
  );
};

export const MindGraphPanel: React.FC = () => {
  const worldState = useGameState((s) => s.worldState);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);

  const character = inspectedCharacterId ? worldState?.characters[inspectedCharacterId] : null;
  const graph = character?.mind_graph;

  // Sort nodes: resources first, then by type, then by value descending
  const sortedNodes = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.nodes)
      .filter((n) => !n.hidden_by_default || n.active)
      .sort((a, b) => {
        // Resources first
        const aRes = a.prior_instinct?.is_resource ? 0 : 1;
        const bRes = b.prior_instinct?.is_resource ? 0 : 1;
        if (aRes !== bRes) return aRes - bRes;
        // Then by type order
        const typeOrder: Record<string, number> = { PriorInstinct: 0, Observation: 1, Motivation: 2, Action: 3, Meme: 4 };
        const aType = typeOrder[a.node_type] ?? 5;
        const bType = typeOrder[b.node_type] ?? 5;
        if (aType !== bType) return aType - bType;
        // Then by value descending
        return b.value - a.value;
      });
  }, [graph]);

  const sortedEdges = useMemo(() => {
    if (!graph) return [];
    return Object.values(graph.edges).sort((a, b) => b.weight - a.weight);
  }, [graph]);

  if (!character || !graph) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: '#666', fontSize: 13 }}>
          ← 点击左侧角色查看心智图谱
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 1, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {t(character.label)} 的心智图谱
        </Typography>
        <Chip label={`${sortedNodes.length} 节点`} size="small" sx={{ height: 18, fontSize: 10 }} />
        <Chip label={`${sortedEdges.length} 边`} size="small" sx={{ height: 18, fontSize: 10 }} />
      </Box>

      <Divider />

      {/* Nodes */}
      <Box sx={{ overflow: 'auto', flex: 1 }}>
        <Typography variant="overline" sx={{ px: 1, fontSize: 9, color: '#666' }}>
          节点
        </Typography>
        {sortedNodes.map((node) => (
          <NodeRow key={node.instance_id} node={node} />
        ))}

        {sortedEdges.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="overline" sx={{ px: 1, fontSize: 9, color: '#666' }}>
              关联边
            </Typography>
            {sortedEdges.map((edge) => (
              <EdgeRow key={edge.edge_id} edge={edge} nodes={graph.nodes} />
            ))}
          </>
        )}
      </Box>
    </Box>
  );
};
