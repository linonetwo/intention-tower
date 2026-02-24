import { forceCollide, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { useMemo } from 'react';
import type { AssociationEdge, MindNode, NodeType } from '../../../types/backend';
import type { GraphEdge, GraphNode } from './types';

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function fallbackCell(nodeType: NodeType): number {
  switch (nodeType) {
    case 'PriorInstinct':
      return 6;
    case 'Observation':
      return 4;
    case 'Motivation':
      return 7;
    case 'Action':
      return 8;
    case 'Meme':
      return 1;
    default:
      return 4;
  }
}

export function useFixedMindGraphLayout(
  nodesInput: MindNode[],
  edgesInput: AssociationEdge[],
  width: number,
  height: number,
  schemaToCell: Map<string, number>,
) {
  const cellWidth = width / 3;
  const cellHeight = height / 3;
  const nodeRadius = 12;
  const minGap = 10;

  const topologyKey = useMemo(() => {
    const nodeIds = nodesInput.map((node) => node.instance_id).sort().join('|');
    const edgeIds = edgesInput.map((edge) => edge.edge_id).sort().join('|');
    return `${nodeIds}::${edgeIds}`;
  }, [nodesInput, edgesInput]);

  const positionedMap = useMemo(() => {
    const byCell = new Map<number, MindNode[]>();

    nodesInput.forEach((node) => {
      const cell = schemaToCell.get(node.schema_id) ?? fallbackCell(node.node_type);
      const bucket = byCell.get(cell) ?? [];
      bucket.push(node);
      byCell.set(cell, bucket);
    });

    type SimNode = {
      id: string;
      x: number;
      y: number;
      r: number;
      targetX: number;
      targetY: number;
    };

    const simNodes: SimNode[] = [];

    byCell.forEach((group, cell) => {
      const col = cell % 3;
      const row = Math.floor(cell / 3);
      const centerX = col * cellWidth + cellWidth / 2;
      const centerY = row * cellHeight + cellHeight / 2;

      group
        .slice()
        .sort((a, b) => hashString(a.instance_id) - hashString(b.instance_id))
        .forEach((node, index) => {
          const ring = Math.floor(index / 8);
          const inRing = index % 8;
          const angle = (Math.PI * 2 * inRing) / 8;
          const radius = 14 + ring * 24;
          simNodes.push({
            id: node.instance_id,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            r: nodeRadius,
            targetX: centerX,
            targetY: centerY,
          });
        });
    });

    const simulation = forceSimulation(simNodes)
      .force('charge', forceManyBody<SimNode>().strength(-45))
      .force('x', forceX<SimNode>((node) => node.targetX).strength(0.22))
      .force('y', forceY<SimNode>((node) => node.targetY).strength(0.22))
      .force('collision', forceCollide<SimNode>().radius((node) => node.r + minGap).iterations(2));

    for (let tickIndex = 0; tickIndex < 140; tickIndex += 1) simulation.tick();
    simulation.stop();

    return new Map(
      simNodes.map((node) => [
        node.id,
        {
          x: Math.max(20, Math.min(width - 20, node.x)),
          y: Math.max(20, Math.min(height - 20, node.y)),
          r: node.r,
        },
      ]),
    );
  }, [topologyKey, nodesInput, schemaToCell, cellWidth, cellHeight, width, height]);

  const nodes = useMemo<GraphNode[]>(() => {
    return nodesInput.map((node) => {
      const positioned = positionedMap.get(node.instance_id);
      return {
        ...node,
        x: positioned?.x ?? width / 2,
        y: positioned?.y ?? height / 2,
        r: positioned?.r ?? nodeRadius,
      };
    });
  }, [nodesInput, positionedMap, width, height]);

  const nodeIdSet = useMemo(() => new Set(nodes.map((node) => node.instance_id)), [nodes]);

  const edges = useMemo<GraphEdge[]>(
    () =>
      edgesInput
        .filter((edge) => nodeIdSet.has(edge.source_instance_id) && nodeIdSet.has(edge.target_instance_id))
        .map((edge) => ({ ...edge, source: edge.source_instance_id, target: edge.target_instance_id })),
    [edgesInput, nodeIdSet],
  );

  return { nodes, edges };
}
