import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldEvent, WorldState } from '../../types/backend';

const fixture = vi.hoisted(() => ({ state: {
  worldState: null as WorldState | null,
  recentEvents: [] as WorldEvent[],
  availableCommands: [], selectedActorId: null, selectedTargetId: null,
  executeCommand: vi.fn(), cancelPendingCommand: vi.fn(),
} }));
vi.mock('../../store/useGameState', () => ({ useGameState: (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state) }));
vi.mock('../../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ isMobile: false, statusBarWidth: 0, dialogueHeight: 25, touchTarget: 44 }) }));
import { DialogueBox } from './DialogueBox';

const action = (tick: number): WorldEvent => ({ ActionExecuted: {
  character_id: 'dog', instance_id: 'bell', executed_at: tick, autonomous: false,
} });
afterEach(() => { cleanup(); fixture.state.worldState = null; fixture.state.recentEvents = []; });

describe('dialogue feedback visibility', () => {
  it('resets the actual scroll container for new meaningful feedback, even with identical wording', () => {
    fixture.state.recentEvents = [action(1)];
    const view = render(<DialogueBox />);
    const scroller = screen.getByTestId('dialogue-scroll-content');
    const oldText = screen.getByTestId('dialogue-event-0').textContent;
    scroller.scrollTop = 180;
    fixture.state.recentEvents = [action(2)];
    view.rerender(<DialogueBox />);
    expect(screen.getByTestId('dialogue-event-0').textContent).toBe(oldText);
    expect(scroller.scrollTop).toBe(0);
    expect(getComputedStyle(scroller).overflow).toBe('auto');
    expect(parseFloat(getComputedStyle(screen.getByTestId('dialogue-event-0')).fontSize)).toBeGreaterThanOrEqual(13);
  });

  it('preserves user scroll through unrelated world updates, cloned feedback, and tick-only batches', () => {
    fixture.state.recentEvents = [action(1)];
    const view = render(<DialogueBox />);
    const scroller = screen.getByTestId('dialogue-scroll-content');
    scroller.scrollTop = 180;
    fixture.state.worldState = { tick: 2, paused: false, characters: {}, items: {}, pending_commands: [] } as unknown as WorldState;
    fixture.state.recentEvents = [action(1), { TickCompleted: { tick: 2 } }];
    view.rerender(<DialogueBox />);
    expect(scroller.scrollTop).toBe(180);
    fixture.state.recentEvents = [{ TickCompleted: { tick: 3 } }];
    view.rerender(<DialogueBox />);
    expect(scroller.scrollTop).toBe(180);
    fixture.state.recentEvents = [action(4)];
    view.rerender(<DialogueBox />);
    expect(scroller.scrollTop).toBe(0);
  });

  it('reveals enriched narrative when the same event gains a relevant world outcome', () => {
    fixture.state.recentEvents = [action(1)];
    const view = render(<DialogueBox />);
    const scroller = screen.getByTestId('dialogue-scroll-content');
    const oldText = screen.getByTestId('dialogue-event-0').textContent;
    scroller.scrollTop = 180;
    fixture.state.worldState = { characters: {
      dog: { id: 'dog', label: 'Dog', mind_graph: { nodes: {}, action_episodes: [{
        action_id: 'bell', executed_at: 1, physical_outcome: {
          type: 'SocialExclusion', target_character_id: 'other',
          target_need_schema_id: 'it:concept/loneliness', from: .1, to: .3,
        },
      }] } },
      other: { id: 'other', label: 'Classmate', mind_graph: { nodes: {} } },
    }, items: {}, pending_commands: [] } as unknown as WorldState;
    view.rerender(<DialogueBox />);
    expect(screen.getByTestId('dialogue-event-0').textContent).not.toBe(oldText);
    expect(screen.getByTestId('dialogue-event-0').textContent).toContain('Classmate');
    expect(scroller.scrollTop).toBe(0);
  });
});
