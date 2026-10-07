import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldEvent, WorldState } from '../../types/backend';
import '../../i18n';

const fixture = vi.hoisted(() => ({ state: {
  currentLevelId: 'pavlov', selectedActorId: 'it:entity/pavlov', selectedTargetId: 'it:entity/dog',
  inspectedCharacterId: 'it:entity/dog', uiMode: 'observe', recentEvents: [] as WorldEvent[], worldState: null as WorldState | null,
} }));
vi.mock('../../store/useGameState', () => ({ useGameState: (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state) }));
vi.mock('../../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ isMobile: true, statusBarWidth: 0 }) }));
import { TutorialGuidePanel } from './TutorialGuidePanel';

beforeEach(() => {
  fixture.state.uiMode = 'observe';
  fixture.state.recentEvents = [];
  fixture.state.worldState = null;
});
afterEach(cleanup);

describe('Pavlov tutorial evidence and unobstructed graph', () => {
  it('recognizes full RDF character ids and starts with only the current step', () => {
    render(<TutorialGuidePanel />);
    expect(screen.getByText('2/9')).toBeTruthy();
    expect(screen.queryByText(/查看它的思维图谱/)).toBeNull();
    fireEvent.click(screen.getByTestId('tutorial-expand'));
    expect(screen.getByText(/查看它的思维图谱/)).toBeTruthy();
  });

  it('does not complete learning or verification from repeated commands', () => {
    fixture.state.recentEvents = Array.from({ length: 10 }, (_, index) => ({ CommandExecuted: {
      actor_id: 'pavlov', target_id: 'dog', command_id: index % 2 ? 'feed' : 'ring-bell',
    } }));
    const { rerender } = render(<TutorialGuidePanel />);
    // Only selection, inspection and the two command-execution instructions are done.
    expect(screen.getByText('4/9')).toBeTruthy();
    fixture.state.uiMode = 'graph';
    rerender(<TutorialGuidePanel />);
    expect(screen.queryByTestId('tutorial-guide')).toBeNull();
  });
});
