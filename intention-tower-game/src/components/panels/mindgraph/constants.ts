import type { NodeType } from '../../../types/backend';

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  Observation: '#42a5f5',
  PriorInstinct: '#ab47bc',
  Motivation: '#ef5350',
  Action: '#66bb6a',
  Meme: '#ffa726',
};

export const GRAPH_WIDTH = 860;
export const GRAPH_HEIGHT = 560;
