import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ state: {
  uiMode: 'observe', selectedActorId: 'lorenz', availableCommands: [],
  worldState: { time_speed: 0, characters: { lorenz: {}, gosling: {} } },
  setUiMode: vi.fn(), selectActor: vi.fn(), inspectCharacter: vi.fn(), moveSelectedActor: vi.fn(),
  setTimeSpeed: vi.fn(), saveGame: vi.fn(), executeCommand: vi.fn(), reset: vi.fn(),
}, navigate: vi.fn(), reload: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('../store/useGameState', () => ({ gameStore: { getState: () => fixture.state } }));
vi.mock('../store/useModAssets', () => ({ modAssetsStore: { getState: () => ({ reload: fixture.reload }) } }));
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

beforeEach(() => { vi.clearAllMocks(); fixture.state.uiMode = 'observe'; });
afterEach(cleanup);

describe('micro-control shortcuts', () => {
  it('enters Micro with Q or F2, toggles Q back, and never changes the actor', () => {
    renderHook(useKeyboardShortcuts);
    fireEvent.keyDown(window, { key: 'q' });
    expect(fixture.state.setUiMode).toHaveBeenLastCalledWith('micro');
    fixture.state.uiMode = 'micro';
    fireEvent.keyDown(window, { key: 'Q' });
    expect(fixture.state.setUiMode).toHaveBeenLastCalledWith('observe');
    fireEvent.keyDown(window, { key: 'F2' });
    expect(fixture.state.setUiMode).toHaveBeenLastCalledWith('micro');
    expect(fixture.state.selectActor).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'q', repeat: true });
    expect(fixture.state.setUiMode).toHaveBeenCalledTimes(3);
  });

  it('ignores text inputs, editable descendants and modified Q/arrow shortcuts', () => {
    renderHook(useKeyboardShortcuts);
    for (const tag of ['input', 'textarea']) {
      const input = document.createElement(tag);
      document.body.append(input);
      fireEvent.keyDown(input, { key: 'q' });
      input.remove();
    }
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.append(child); document.body.append(editor);
    fireEvent.keyDown(child, { key: 'q' });
    editor.remove();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) fireEvent.keyDown(window, { key: 'q', [modifier]: true });
    fixture.state.uiMode = 'micro';
    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true });
    expect(fixture.state.setUiMode).not.toHaveBeenCalled();
    expect(fixture.state.moveSelectedActor).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true, shiftKey: true });
    expect(fixture.reload).toHaveBeenCalledOnce();
  });

  it('preserves intentional save and actor shortcuts and the actual 28-unit arrow movement', () => {
    fixture.state.uiMode = 'micro';
    renderHook(useKeyboardShortcuts);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(fixture.state.saveGame).toHaveBeenCalledOnce();
    expect(fixture.state.moveSelectedActor).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(fixture.state.selectActor).toHaveBeenCalledWith('gosling');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(fixture.state.moveSelectedActor).toHaveBeenCalledWith(-28, 0);
  });
});
