import type { AssociationEdge, MindNode } from '../../../types/backend';

export type GraphNode = MindNode & {
  x: number;
  y: number;
  r: number;
  cluster_id: string;
  isUnknown?: boolean;
};

export type GraphEdge = AssociationEdge & {
  source: string;
  target: string;
};

export type GraphViewport = {
  x: number;
  y: number;
  scale: number;
};

export type GraphLayoutMode = 'network' | 'tower';

export type NormalizedGraphPosition = {
  x: number;
  y: number;
};
