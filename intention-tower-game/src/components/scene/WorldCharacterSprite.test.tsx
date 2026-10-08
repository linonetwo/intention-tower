import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldCharacterSprite } from './WorldCharacterSprite';
import type { WorldCharacter } from '../../types/backend';

const character: WorldCharacter = { id: 'dog', label: 'Dog', position: { x: 100, y: 300 }, mind_graph: { character_id: 'dog', nodes: {}, edges: {} } };
const props = { character, asset: { src: '/dog.png', height: 90 }, revision: 1, x: 100, ground: 300, scale: 1, selected: true, targeted: false, onSelect: vi.fn() };
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('full-body world character', () => {
  it('uses sprite art and keeps authoritative positions available to verification', () => {
    render(<WorldCharacterSprite {...props} />);
    const entity = screen.getByTestId('scene-character-dog');
    expect(entity.getAttribute('data-world-x')).toBe('100');
    expect(entity.getAttribute('data-asset-missing')).toBe('false');
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/dog.png?rev=1');
    fireEvent.click(entity);
    expect(props.onSelect).toHaveBeenCalled();
  });
  it('faces the actual displacement and animates only after backend movement', () => {
    vi.useFakeTimers();
    const { rerender } = render(<WorldCharacterSprite {...props} />);
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-moving')).toBe('false');
    rerender(<WorldCharacterSprite {...props} character={{ ...character, position: { x: 72, y: 300 } }} x={72} />);
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-facing')).toBe('left');
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-moving')).toBe('true');
    act(() => { vi.advanceTimersByTime(241); });
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-moving')).toBe('false');
  });
  it('marks absent or broken art explicitly rather than using portrait cards or dots', () => {
    const { rerender } = render(<WorldCharacterSprite {...props} />);
    fireEvent.error(screen.getByTestId('scene-character-sprite-dog'));
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-asset-missing')).toBe('true');
    rerender(<WorldCharacterSprite {...props} asset={undefined} />);
    expect(screen.queryByTestId('scene-character-sprite-dog')).toBeNull();
  });
  it('renders a supported sitting pose with a visible chair', () => {
    render(<WorldCharacterSprite {...props} posture="sitting" asset={{ ...props.asset, sittingSrc: '/dog-sit.png', chairSrc: '/chair.png' }} />);
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-posture')).toBe('sitting');
    expect(screen.getByTestId('scene-chair-dog')).toBeTruthy();
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/dog-sit.png?rev=1');
  });
  it('lets a ground-sitting animal sit without inventing a chair', () => {
    render(<WorldCharacterSprite {...props} posture="sitting" asset={{ ...props.asset, sittingSrc: '/dog-sit.png' }} />);
    expect(screen.queryByTestId('scene-chair-dog')).toBeNull();
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/dog-sit.png?rev=1');
  });
  it('cycles generated walk frames after authoritative movement', () => {
    vi.useFakeTimers();
    const asset = { ...props.asset, walkFrames: ['/walk1.png', '/walk2.png'] };
    const { rerender } = render(<WorldCharacterSprite {...props} asset={asset} />);
    rerender(<WorldCharacterSprite {...props} asset={asset} character={{ ...character, position: { x: 118, y: 300 } }} />);
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/walk1.png?rev=1');
    act(() => { vi.advanceTimersByTime(90); });
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/walk2.png?rev=1');
  });
});
