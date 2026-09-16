import { beforeEach, describe, expect, it } from 'vitest';
import type { AssociationEdge, MindNode, NodeType } from '../../../types/backend';
import {
  computeMindGraphLayout,
  loadPersistedGraphPositions,
  normalizeGraphPosition,
} from './useFixedMindGraphLayout';

function node(id: string, nodeType: NodeType, strength = 0.5): MindNode {
  return {
    instance_id: id,
    schema_id: `it:test/${id}`,
    label: id,
    node_type: nodeType,
    value: 0.6,
    value_velocity: 0,
    strength,
    active: true,
    attended: false,
    suppression: 0,
    created_at: 0,
    ttl: null,
    hidden_by_default: false,
    thresholds: [],
    costs: [],
    observation: null,
    prior_instinct: null,
    motivation: null,
    action: null,
    meme: null,
    prev_value: 0.6,
    reality_layer: 0,
    is_virtual: false,
  };
}

function edge(id: string, source: string, target: string, weight: number): AssociationEdge {
  return {
    edge_id: id,
    source_instance_id: source,
    target_instance_id: target,
    polarity: 'Excitatory',
    weight,
    learnable: true,
    decay_rate_per_tick: 0,
    learn_type: 'Hebbian',
    evidence: { co_occurrence_count: 2, last_co_occurred_at: 4, window_sec: 2 },
  };
}

const nodes = [
  node('observation', 'Observation'),
  node('instinct', 'PriorInstinct', 0.8),
  node('motivation', 'Motivation'),
  node('action', 'Action'),
  node('meme', 'Meme'),
];
const edges = [
  edge('observe-to-motivate', 'observation', 'motivation', 0.9),
  edge('instinct-to-motivate', 'instinct', 'motivation', 0.7),
  edge('motivate-to-act', 'motivation', 'action', 0.95),
  edge('meme-to-motivate', 'meme', 'motivation', 0.55),
];
const schemaToCell = new Map([
  ['it:test/instinct', 1],
  ['it:test/observation', 3],
  ['it:test/motivation', 4],
  ['it:test/action', 5],
  ['it:test/meme', 7],
]);

describe('headless mind graph layout', () => {
  beforeEach(() => localStorage.clear());

  it('is deterministic and keeps every node inside the React SVG canvas', () => {
    const first = computeMindGraphLayout(nodes, edges, 900, 620, schemaToCell, 'network');
    const second = computeMindGraphLayout(nodes, edges, 900, 620, schemaToCell, 'network');

    expect(second).toEqual(first);
    expect(first).toHaveLength(nodes.length);
    first.forEach((positioned) => {
      expect(positioned.x).toBeGreaterThan(positioned.r);
      expect(positioned.x).toBeLessThan(900 - positioned.r);
      expect(positioned.y).toBeGreaterThan(positioned.r);
      expect(positioned.y).toBeLessThan(620 - positioned.r);
      expect(positioned.cluster_id).toBe(`type:${positioned.node_type}`);
    });
  });

  it('pins user-edited positions and assigns semantic layers in tower mode', () => {
    const positioned = computeMindGraphLayout(
      nodes,
      edges,
      1000,
      600,
      schemaToCell,
      'tower',
      { action: { x: 0.78, y: 0.32 } },
    );
    const action = positioned.find((candidate) => candidate.instance_id === 'action');
    const instinct = positioned.find((candidate) => candidate.instance_id === 'instinct');
    const meme = positioned.find((candidate) => candidate.instance_id === 'meme');

    expect(action).toMatchObject({ x: 780, y: 192, cluster_id: 'layer:1' });
    expect(instinct?.cluster_id).toBe('layer:0');
    expect(meme?.cluster_id).toBe('layer:2');
  });

  it('normalizes, validates, and clamps persisted React-owned layouts', () => {
    expect(normalizeGraphPosition(800, -10, 1000, 500)).toEqual({ x: 0.8, y: 0 });
    localStorage.setItem('layout', JSON.stringify({
      version: 1,
      positions: {
        valid: { x: 1.4, y: -0.2 },
        invalid: { x: 'far', y: 0.5 },
      },
    }));

    expect(loadPersistedGraphPositions('layout')).toEqual({ valid: { x: 1, y: 0 } });
    localStorage.setItem('layout', '{bad json');
    expect(loadPersistedGraphPositions('layout')).toEqual({});
  });
});
