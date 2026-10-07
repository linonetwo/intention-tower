import type { MindNode, NodeType } from '../../../types/backend';
import { i18n, translateLabel } from '../../../i18n';

export function graphNodeLabel(node: Pick<MindNode, 'label' | 'node_type'>): string {
  const translated = translateLabel(node.label);
  return /^(it:|schema:|https?:)/.test(translated)
    ? i18n.t(node.node_type === 'Meme' ? 'event.emergentMeme' : 'graph.unknown')
    : translated;
}

export const NODE_TYPE_COLORS: Record<NodeType, string> = {
  Observation: '#42a5f5',
  PriorInstinct: '#ab47bc',
  Motivation: '#ef5350',
  Action: '#66bb6a',
  Meme: '#ffa726',
};

export const GRAPH_WIDTH = 860;
export const GRAPH_HEIGHT = 560;
