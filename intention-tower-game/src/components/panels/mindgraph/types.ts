import type { AssociationEdge, MindNode } from '../../../types/backend';

export type GraphNode = MindNode & { x: number; y: number; r: number };

export type GraphEdge = AssociationEdge & {
  source: string;
  target: string;
};

export type GraphViewport = {
  x: number;
  y: number;
  scale: number;
};
