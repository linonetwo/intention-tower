import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldEvent, WorldState } from '../../types/backend';
import '../../i18n';

const fixture = vi.hoisted(() => ({ shortLandscape: false, state: {
  currentLevelId: 'pavlov', selectedActorId: 'it:entity/pavlov', selectedTargetId: 'it:entity/dog',
  inspectedCharacterId: 'it:entity/dog', uiMode: 'observe', recentEvents: [] as WorldEvent[], worldState: null as WorldState | null,
} }));
vi.mock('../../store/useGameState', () => ({ useGameState: (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state) }));
vi.mock('../../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ isMobile: true, statusBarWidth: 0 }) }));
vi.mock('@mui/material', async (importOriginal) => ({ ...await importOriginal<typeof import('@mui/material')>(), useMediaQuery: () => fixture.shortLandscape }));
import { TutorialGuidePanel } from './TutorialGuidePanel';

beforeEach(() => {
  fixture.shortLandscape = false;
  fixture.state.currentLevelId = 'pavlov';
  fixture.state.selectedActorId = 'it:entity/pavlov';
  fixture.state.selectedTargetId = 'it:entity/dog';
  fixture.state.uiMode = 'observe';
  fixture.state.recentEvents = [];
  fixture.state.worldState = null;
});

describe('Short landscape tutorial notebook placement', () => {
  it('hides the stage guide in short landscape', () => {
    fixture.shortLandscape = true;
    render(<TutorialGuidePanel />);
    expect(screen.queryByTestId('tutorial-guide')).toBeNull();
  });

  it('embeds tutorial content in normal flow, including graph mode', () => {
    fixture.shortLandscape = true;
    fixture.state.uiMode = 'graph';
    render(<TutorialGuidePanel embedded />);
    expect(screen.getByTestId('tutorial-guide').className).toBeTruthy();
    expect(getComputedStyle(screen.getByTestId('tutorial-guide')).position).toBe('relative');
    expect(screen.getAllByTestId('tutorial-guide')).toHaveLength(1);
  });

  it('does not create notebook tutorials for non-tutorial levels', () => {
    fixture.shortLandscape = true;
    fixture.state.currentLevelId = 'the-wave';
    render(<TutorialGuidePanel embedded />);
    expect(screen.queryByTestId('tutorial-guide')).toBeNull();
  });

  it('retains the stage guide outside short landscape', () => {
    render(<TutorialGuidePanel />);
    expect(getComputedStyle(screen.getByTestId('tutorial-guide')).position).toBe('absolute');
  });
});

describe('Gosling tutorial follows real imprinting objectives', () => {
  it('does not advance imprinting from repeated approach and sound commands', () => {
    fixture.state.currentLevelId = 'gosling';
    fixture.state.selectedActorId = 'it:entity/lorenz';
    fixture.state.selectedTargetId = 'it:entity/gosling';
    fixture.state.uiMode = 'micro';
    fixture.state.recentEvents = Array.from({ length: 12 }, (_, index) => ({ CommandExecuted: {
      actor_id: 'lorenz', target_id: 'gosling', command_id: index % 2 ? 'make-sound' : 'approach-gosling',
    } }));
    render(<TutorialGuidePanel />);
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByText(/关键期内「靠近雏鹅」/)).toBeTruthy();
  });

  it('advances from fixed target to actual separation and pursuit only via backend objectives', () => {
    fixture.state.currentLevelId = 'gosling';
    fixture.state.selectedActorId = 'lorenz'; fixture.state.selectedTargetId = 'gosling'; fixture.state.uiMode = 'micro';
    const objective = (id: string, completed: boolean) => ({ objective_id: id, label: id, completed, condition: {}, required: true, completed_at_tick: completed ? 1 : null });
    fixture.state.worldState = { characters: {}, pending_commands: [], progress: { objectives: [objective('critical-period-contact', true), objective('observe-imprinting', false), objective('verify-following', false)] } } as unknown as WorldState;
    const { rerender } = render(<TutorialGuidePanel />);
    expect(screen.getByText('2/4')).toBeTruthy();
    expect(screen.getByText(/印刻后立即让洛伦兹向左远离/)).toBeTruthy();
    fixture.state.worldState.progress.objectives[1].completed = true;
    rerender(<TutorialGuidePanel />);
    expect(screen.getByText('3/4')).toBeTruthy();
    expect(screen.getByText(/只认真实目标完成/)).toBeTruthy();
    fixture.state.worldState.progress.objectives[2].completed = true;
    rerender(<TutorialGuidePanel />);
    expect(screen.getByText('4/4')).toBeTruthy();
  });
});
afterEach(cleanup);

describe('Smart cat tutorial uses real behavioral objectives', () => {
  it('does not mistake repeated training commands for learned or autonomous behavior', () => {
    fixture.state.currentLevelId = 'smart-cat';
    fixture.state.selectedActorId = 'trainer';
    fixture.state.selectedTargetId = 'cat-billi';
    fixture.state.recentEvents = Array.from({ length: 20 }, () => ({ CommandExecuted: {
      actor_id: 'trainer', target_id: 'cat-billi', command_id: 'feed-cat',
    } }));
    render(<TutorialGuidePanel />);
    expect(screen.getByText('1/4')).toBeTruthy();
    expect(screen.getByText(/命令点击次数不算/)).toBeTruthy();
  });

  it('advances only when pairing, rewarded actions and autonomous action are verified', () => {
    fixture.state.currentLevelId = 'smart-cat';
    fixture.state.selectedActorId = 'it:entity/trainer';
    fixture.state.selectedTargetId = 'it:entity/cat-billi';
    fixture.state.worldState = { characters: {}, pending_commands: [], progress: { objectives: [
      { objective_id: 'demonstrate-button', completed: true },
      { objective_id: 'reinforce-correct-action', completed: false },
      { objective_id: 'verify-cat-action', completed: false },
    ] } } as unknown as WorldState;
    const { rerender } = render(<TutorialGuidePanel />);
    expect(screen.getByText('2/4')).toBeTruthy();
    fixture.state.worldState.progress.objectives[1].completed = true;
    rerender(<TutorialGuidePanel />);
    expect(screen.getByText('3/4')).toBeTruthy();
    expect(screen.getByText(/停止提示声和喂食至少10刻/)).toBeTruthy();
    fixture.state.worldState.progress.objectives[2].completed = true;
    rerender(<TutorialGuidePanel />);
    expect(screen.getByText('4/4')).toBeTruthy();
  });
});

describe('Pavlov tutorial evidence and unobstructed graph', () => {
  it('recognizes full RDF character ids and starts with only the current step', () => {
    render(<TutorialGuidePanel />);
    expect(screen.getByText('2/9')).toBeTruthy();
    expect(screen.queryByText(/查看它的联结图谱/)).toBeNull();
    fireEvent.click(screen.getByTestId('tutorial-expand'));
    expect(screen.getByText(/查看它的联结图谱/)).toBeTruthy();
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
