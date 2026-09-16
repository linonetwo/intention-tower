import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AssociationEdge, MindNode, NodeType } from '../../../types/backend';
import type {
  GraphEdge,
  GraphLayoutMode,
  GraphNode,
  NormalizedGraphPosition,
} from './types';

const STORAGE_VERSION = 1;
const NODE_PADDING = 26;

type PersistedLayout = {
  version: number;
  positions: Record<string, NormalizedGraphPosition>;
};

type SimNode = SimulationNodeDatum & {
  id: string;
  r: number;
  targetX: number;
  targetY: number;
  clusterId: string;
};

type SimLink = SimulationLinkDatum<SimNode> & {
  edge: AssociationEdge;
};

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackCell(nodeType: NodeType): number {
  switch (nodeType) {
    case 'PriorInstinct': return 1;
    case 'Observation': return 0;
    case 'Motivation': return 4;
    case 'Action': return 5;
    case 'Meme': return 7;
  }
}

function nodeTypeIndex(nodeType: NodeType): number {
  const order: NodeType[] = ['Observation', 'PriorInstinct', 'Motivation', 'Action', 'Meme'];
  return order.indexOf(nodeType);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function validNormalizedPosition(value: unknown): value is NormalizedGraphPosition {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === 'number'
    && Number.isFinite(candidate.x)
    && typeof candidate.y === 'number'
    && Number.isFinite(candidate.y);
}

export function loadPersistedGraphPositions(storageKey: string): Record<string, NormalizedGraphPosition> {
  if (typeof window === 'undefined' || !storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedLayout>;
    if (parsed.version !== STORAGE_VERSION || !parsed.positions || typeof parsed.positions !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed.positions)
        .filter(([, value]) => validNormalizedPosition(value))
        .map(([id, value]) => [id, { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) }]),
    );
  } catch {
    return {};
  }
}

export function normalizeGraphPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): NormalizedGraphPosition {
  return {
    x: clamp(x / Math.max(1, width), 0, 1),
    y: clamp(y / Math.max(1, height), 0, 1),
  };
}

export function computeMindGraphLayout(
  nodesInput: MindNode[],
  edgesInput: AssociationEdge[],
  width: number,
  height: number,
  schemaToCell: Map<string, number>,
  layoutMode: GraphLayoutMode,
  pinnedPositions: Record<string, NormalizedGraphPosition> = {},
): GraphNode[] {
  const safeWidth = Math.max(240, width);
  const safeHeight = Math.max(220, height);
  const networkRadius = Math.min(safeWidth, safeHeight) * 0.28;
  const towerLayerY = [safeHeight * 0.78, safeHeight * 0.50, safeHeight * 0.22];
  const towerLaneSpread = Math.min(210, safeWidth * 0.23);

  const simNodes: SimNode[] = nodesInput.map((node, index) => {
    const cell = schemaToCell.get(node.schema_id) ?? fallbackCell(node.node_type);
    const layer = clamp(Math.floor(cell / 3), 0, 2);
    const lane = cell % 3;
    const typeIndex = Math.max(0, nodeTypeIndex(node.node_type));
    const clusterId = layoutMode === 'network' ? `type:${node.node_type}` : `layer:${layer}`;
    const anchorAngle = (typeIndex / 5) * Math.PI * 2 - Math.PI / 2;
    const targetX = layoutMode === 'network'
      ? safeWidth / 2 + Math.cos(anchorAngle) * networkRadius
      : safeWidth / 2 + (lane - 1) * towerLaneSpread;
    const targetY = layoutMode === 'network'
      ? safeHeight / 2 + Math.sin(anchorAngle) * networkRadius * 0.74
      : towerLayerY[layer];
    const seed = hashString(node.instance_id);
    const jitterAngle = ((seed % 360) / 180) * Math.PI;
    const jitterRadius = 18 + ((seed >>> 9) % 44);
    const pinned = pinnedPositions[node.instance_id];
    const radius = 11 + clamp(node.strength, 0, 1) * 5 + (node.attended ? 1.5 : 0);

    return {
      id: node.instance_id,
      index,
      x: pinned ? pinned.x * safeWidth : targetX + Math.cos(jitterAngle) * jitterRadius,
      y: pinned ? pinned.y * safeHeight : targetY + Math.sin(jitterAngle) * jitterRadius,
      fx: pinned ? pinned.x * safeWidth : undefined,
      fy: pinned ? pinned.y * safeHeight : undefined,
      r: radius,
      targetX,
      targetY,
      clusterId,
    };
  });

  const nodeIds = new Set(simNodes.map((node) => node.id));
  const simLinks: SimLink[] = edgesInput
    .filter((edge) => nodeIds.has(edge.source_instance_id) && nodeIds.has(edge.target_instance_id))
    .map((edge) => ({ source: edge.source_instance_id, target: edge.target_instance_id, edge }));

  const simulation = forceSimulation<SimNode>(simNodes)
    .randomSource(() => 0.517_093)
    .force('center', forceCenter(safeWidth / 2, safeHeight / 2))
    .force('charge', forceManyBody<SimNode>().strength((node) => -115 - node.r * 3.5).distanceMax(420))
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((node) => node.id)
        .distance((link) => 72 + (1 - clamp(Math.abs(link.edge.weight), 0, 1)) * 62)
        .strength((link) => 0.2 + clamp(Math.abs(link.edge.weight), 0, 1) * 0.5),
    )
    .force('cluster-x', forceX<SimNode>((node) => node.targetX).strength(layoutMode === 'network' ? 0.055 : 0.11))
    .force('cluster-y', forceY<SimNode>((node) => node.targetY).strength(layoutMode === 'network' ? 0.055 : 0.14))
    .force('collision', forceCollide<SimNode>().radius((node) => node.r + 18).strength(0.92).iterations(3))
    .stop();

  for (let tickIndex = 0; tickIndex < 260; tickIndex += 1) simulation.tick();

  const simById = new Map(simNodes.map((node) => [node.id, node]));
  return nodesInput.map((node) => {
    const positioned = simById.get(node.instance_id);
    const r = positioned?.r ?? 14;
    return {
      ...node,
      x: clamp(positioned?.x ?? safeWidth / 2, NODE_PADDING + r, safeWidth - NODE_PADDING - r),
      y: clamp(positioned?.y ?? safeHeight / 2, NODE_PADDING + r, safeHeight - NODE_PADDING - r),
      r,
      cluster_id: positioned?.clusterId ?? `type:${node.node_type}`,
    };
  });
}

export function useFixedMindGraphLayout(
  nodesInput: MindNode[],
  edgesInput: AssociationEdge[],
  width: number,
  height: number,
  schemaToCell: Map<string, number>,
  layoutMode: GraphLayoutMode = 'network',
  storageKey = '',
) {
  const [pinnedPositions, setPinnedPositions] = useState<Record<string, NormalizedGraphPosition>>(
    () => loadPersistedGraphPositions(storageKey),
  );

  useEffect(() => {
    setPinnedPositions(loadPersistedGraphPositions(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return undefined;
    const timer = window.setTimeout(() => {
      if (Object.keys(pinnedPositions).length === 0) {
        window.localStorage.removeItem(storageKey);
      } else {
        const payload: PersistedLayout = { version: STORAGE_VERSION, positions: pinnedPositions };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [pinnedPositions, storageKey]);

  const topologyKey = useMemo(() => {
    const nodeIds = nodesInput.map((node) => node.instance_id).sort().join('|');
    const edgeIds = edgesInput.map((edge) => edge.edge_id).sort().join('|');
    return `${nodeIds}::${edgeIds}`;
  }, [nodesInput, edgesInput]);

  const nodes = useMemo(
    () => computeMindGraphLayout(
      nodesInput,
      edgesInput,
      width,
      height,
      schemaToCell,
      layoutMode,
      pinnedPositions,
    ),
    // topologyKey deliberately prevents value-only ticks from scrambling spatial memory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topologyKey, width, height, schemaToCell, layoutMode, pinnedPositions],
  );

  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.instance_id)), [nodes]);
  const edges = useMemo<GraphEdge[]>(
    () => edgesInput
      .filter((edge) => nodeIdSet.has(edge.source_instance_id) && nodeIdSet.has(edge.target_instance_id))
      .map((edge) => ({ ...edge, source: edge.source_instance_id, target: edge.target_instance_id })),
    [edgesInput, nodeIdSet],
  );

  const setNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    setPinnedPositions((previous) => ({
      ...previous,
      [nodeId]: normalizeGraphPosition(x, y, width, height),
    }));
  }, [width, height]);

  const resetLayout = useCallback(() => {
    setPinnedPositions({});
    if (typeof window !== 'undefined' && storageKey) window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    nodes,
    edges,
    setNodePosition,
    resetLayout,
    hasCustomLayout: Object.keys(pinnedPositions).length > 0,
  };
}
