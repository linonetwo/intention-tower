import type { MindNode, NodeType } from '../../../types/backend';
import { i18n, translateLabel } from '../../../i18n';

export function graphNodeLabel(node: Pick<MindNode, 'label' | 'node_type'>): string {
  const translated = translateLabel(node.label);
  return /^(it:|schema:|https?:)/.test(translated)
    ? i18n.t(node.node_type === 'Meme' ? 'event.emergentMeme' : 'graph.unknown')
    : translated;
}

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  Observation: '#a7c8d1',
  PriorInstinct: '#ceb9d1',
  Motivation: '#e6b4a3',
  Action: '#b9cfa0',
  Meme: '#e7c28d',
};

export const GRAPH_WIDTH = 860;
export const GRAPH_HEIGHT = 560;
