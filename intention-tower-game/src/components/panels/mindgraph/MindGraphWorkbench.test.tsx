import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MindNode, WorldCharacter } from '../../../types/backend';
import { MindGraphWorkbench } from './MindGraphWorkbench';

function node(id: string, label: string): MindNode {
  return {
    instance_id: id,
    schema_id: `it:test/${id}`,
    label,
    node_type: id === 'signal' ? 'Observation' : 'Motivation',
    value: 0.7,
    value_velocity: 0.02,
    strength: 0.8,
    active: true,
    attended: true,
    suppression: 0,
    created_at: 1,
    ttl: null,
    hidden_by_default: false,
    thresholds: [],
    costs: [],
    observation: null,
    prior_instinct: null,
    motivation: null,
    action: null,
    meme: null,
    prev_value: 0.68,
    reality_layer: 0,
    is_virtual: false,
  };
}

const character: WorldCharacter = {
  id: 'player',
  label: 'Player',
  position: { x: 0, y: 0 },
  mind_graph: {
    character_id: 'player',
    nodes: {
      signal: node('signal', 'Signal'),
      desire: node('desire', 'Desire'),
    },
    edges: {
      relation: {
        edge_id: 'relation',
        source_instance_id: 'signal',
        target_instance_id: 'desire',
        polarity: 'Excitatory',
        weight: 0.85,
        learnable: true,
        decay_rate_per_tick: 0.002,
        learn_type: 'Hebbian',
        evidence: { co_occurrence_count: 4, last_co_occurred_at: 12, window_sec: 2 },
      },
    },
  },
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('layout fixture unavailable'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Neo4j/Palantir mind graph workbench', () => {
  it('keeps isolated resources as live badges while making their graph nodes opt-in', () => {
    const resource = { ...node('dopamine', 'Dopamine'), node_type: 'PriorInstinct' as const,
      prior_instinct: { is_resource: true, is_mood: false, set_point: 1, satisfied_by_about: [], brain_region: null, overridable_by_meme: false } };
    const withResource = { ...character, mind_graph: { ...character.mind_graph, nodes: { ...character.mind_graph.nodes, dopamine: resource } } };
    render(<MindGraphWorkbench character={withResource} levelId='test-level' recentEvents={[]} graphWidth={760} graphHeight={520} />);
    expect(screen.getByText('Dopamine 0.70')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Dopamine，/ })).toBeNull();
    fireEvent.click(screen.getByTestId('graph-toggle-resources'));
    expect(screen.getByRole('button', { name: /^Dopamine，/ })).toBeTruthy();
  });
  it('shows real extinction error and dopamine expenditure in the graph and inspector', () => {
    render(<MindGraphWorkbench character={character} levelId='test-level' graphWidth={760} graphHeight={520}
      recentEvents={[{ LearningUpdated: { character_id: 'player', edge_id: 'relation', source_id: 'signal', target_id: 'desire', reward: 0, prediction: 0.7, prediction_error: -0.7, dopamine_spent: 0.03, old_weight: 0.85, new_weight: 0.7, phase: 'extinguished' } }]} />);
    expect(screen.getByTestId('graph-learning-trace').textContent).toContain('-0.700');
    expect(screen.getByTestId('graph-learning-trace').textContent).toContain('0.030');
    expect(screen.getByTestId('graph-learning-trace').textContent).toContain('Signal → Desire');
    expect(screen.getByTestId('graph-learning-trace').textContent).not.toContain('signal → desire');
    fireEvent.click(screen.getByRole('button', { name: /^从 Signal 到 Desire/ }));
    expect(screen.getAllByTestId('graph-learning-trace')).toHaveLength(2);
  });
  it('switches layouts, searches objects, and opens the relationship-aware inspector', async () => {
    render(
      <MindGraphWorkbench
        character={character}
        levelId='test-level'
        recentEvents={[]}
        graphWidth={760}
        graphHeight={520}
      />,
    );

    expect(screen.getByTestId('mind-graph-workbench')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索联结图谱' }), { target: { value: 'Signal' } });
    expect(screen.getByText('匹配 1 个节点')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Signal，/ }));
    expect(screen.getByTestId('mind-graph-inspector')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '关系 1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '意图塔层' }));
    await waitFor(() => expect(localStorage.getItem('it:mindgraph:layout-mode:v1')).toBe('tower'));
  });

  it('uses a bottom drawer inspector on mobile-sized play surfaces', () => {
    render(
      <MindGraphWorkbench
        character={character}
        levelId='test-level'
        recentEvents={[]}
        graphWidth={390}
        graphHeight={560}
        mobile
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Desire，/ }));
    const inspector = screen.getByTestId('mind-graph-inspector');
    expect(inspector).toBeTruthy();
    expect(screen.getByRole('button', { name: '关闭详情' })).toBeTruthy();
  });
});
