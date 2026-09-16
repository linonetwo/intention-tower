import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraphEdge, GraphNode } from './types';
import { GraphSvg } from './GraphSvg';

function graphNode(id: string, label: string, x: number, y: number): GraphNode {
  return {
    instance_id: id,
    schema_id: `it:test/${id}`,
    label,
    node_type: id === 'bell' ? 'Observation' : 'Motivation',
    value: 0.6,
    value_velocity: 0,
    strength: 0.7,
    active: true,
    attended: true,
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
    x,
    y,
    r: 16,
    cluster_id: id === 'bell' ? 'type:Observation' : 'type:Motivation',
  };
}

const nodes = [graphNode('bell', 'Bell', 180, 190), graphNode('hunger', 'Hunger', 420, 190)];
const edges: GraphEdge[] = [{
  edge_id: 'bell-to-hunger',
  source_instance_id: 'bell',
  target_instance_id: 'hunger',
  source: 'bell',
  target: 'hunger',
  polarity: 'Excitatory',
  weight: 0.8,
  learnable: true,
  decay_rate_per_tick: 0,
  learn_type: 'Hebbian',
  evidence: { co_occurrence_count: 1, last_co_occurred_at: 2, window_sec: 1 },
}];

afterEach(cleanup);

describe('React-owned graph SVG', () => {
  it('exposes keyboard-accessible nodes and relationships without D3 DOM ownership', () => {
    const onSelectNode = vi.fn();
    const onSelectEdge = vi.fn();
    render(
      <GraphSvg
        nodes={nodes}
        edges={edges}
        width={600}
        height={400}
        selectedNodeId={null}
        selectedEdgeId={null}
        highlightedEdgeIds={new Set()}
        onSelectNode={onSelectNode}
        onSelectEdge={onSelectEdge}
        onDeselect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Bell，/ }));
    expect(onSelectNode).toHaveBeenCalledWith('bell');
    fireEvent.keyDown(screen.getByRole('button', { name: /^从 Bell 到 Hunger/ }), { key: 'Enter' });
    expect(onSelectEdge).toHaveBeenCalledWith('bell-to-hunger');
    expect(screen.getByLabelText('放大图谱')).toBeTruthy();
    expect(screen.getByLabelText('缩小图谱')).toBeTruthy();
  });

  it('lets React pointer handlers persist an edited node position', () => {
    const onMoveNode = vi.fn();
    const { container } = render(
      <GraphSvg
        nodes={nodes}
        edges={edges}
        width={600}
        height={400}
        selectedNodeId={null}
        selectedEdgeId={null}
        highlightedEdgeIds={new Set()}
        onSelectNode={vi.fn()}
        onSelectEdge={vi.fn()}
        onDeselect={vi.fn()}
        onMoveNode={onMoveNode}
      />,
    );
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400,
      width: 600, height: 400, toJSON: () => ({}),
    });

    fireEvent.mouseDown(screen.getByRole('button', { name: /^Bell，/ }), { button: 0, clientX: 180, clientY: 190 });
    fireEvent.mouseMove(svg, { clientX: 230, clientY: 210 });
    fireEvent.mouseUp(svg);

    expect(onMoveNode).toHaveBeenCalledOnce();
    expect(onMoveNode.mock.calls[0][0]).toBe('bell');
    expect(onMoveNode.mock.calls[0][1]).toBeGreaterThan(180);
  });
});
