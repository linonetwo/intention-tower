import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LearningTrace } from './LearningTrace';

afterEach(cleanup);
describe('small paid learning updates', () => {
  it('does not round a real dopamine payment or tiny negative error to zero', () => {
    render(<LearningTrace nodes={[]} updates={[{
      character_id: 'tim', edge_id: 'edge', source_id: 'need', target_id: 'action',
      reward: .02, prediction: .02032, prediction_error: -.00032,
      dopamine_spent: .00012, old_weight: .010667, new_weight: .010347,
      phase: 'extinguished',
    }]} />);
    const text = screen.getByTestId('graph-learning-trace').textContent;
    expect(text).toContain('0.000120');
    expect(text).toContain('-0.000320');
  });
});
