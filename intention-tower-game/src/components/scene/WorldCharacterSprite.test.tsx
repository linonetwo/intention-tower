import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldCharacterSprite } from './WorldCharacterSprite';
import type { WorldCharacter } from '../../types/backend';
import type { SceneMotion } from '../../animation/motion';

const character: WorldCharacter = { id: 'dog', label: 'Dog', position: { x: 100, y: 300 }, mind_graph: { character_id: 'dog', nodes: {}, edges: {} } };
const props = { character, asset: { src: '/dog.png', height: 90 }, revision: 1, x: 100, ground: 300, scale: 1, selected: true, targeted: false, onSelect: vi.fn() };
const walk = (to = 118): SceneMotion => ({ sequence: 1, clip: 'walk', startedAt: performance.now(), durationMs: 180, from: character.position, to: { x: to, y: 300 }, fromPosture: 'standing', toPosture: 'standing', facing: to < 100 ? 'left' : 'right' });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('full-body world character', () => {
  it('nests real PNG limbs at joints and changes clothes without moving the root or head', () => {
    const paperDoll = { rig: 'humanoid-v1' as const, headId: 'boy', headSrc: '/head.png', outfitId: 'student',
      availableOutfits: ['student', 'teal'], parts: { torso: '/torso.png', upperArm: '/upper.png', forearm: '/hand.png', thigh: '/thigh.png', shin: '/shoe.png' } };
    const { rerender } = render(<WorldCharacterSprite {...props} asset={{ ...props.asset, paperDoll }} />);
    const root = screen.getByTestId('scene-character-dog');
    const before = root.style.cssText;
    const rig = screen.getByTestId('scene-character-rig-dog');
    expect(rig.querySelector('[data-rig-joint="left-arm-lower"]')?.parentElement?.getAttribute('data-rig-joint')).toBe('left-arm');
    expect(rig.querySelectorAll('img')).toHaveLength(10);
    const thigh = rig.querySelector('[data-rig-part="left-leg-upper"]') as HTMLImageElement;
    const shin = rig.querySelector('[data-rig-part="left-leg-lower"]') as HTMLImageElement;
    expect(thigh.style.top).toBe('-4px');
    expect(thigh.style.height).toBe('54px');
    expect(shin.style.top).toBe('-4px');
    expect(shin.style.height).toBe('54px');
    // Shin textures bleed upward only: their lower edge remains at the IK foot.
    expect(Number.parseFloat(shin.style.top) + Number.parseFloat(shin.style.height)).toBe(50);
    const torso = rig.querySelector('[data-rig-joint="torso"]')!;
    expect(torso.lastElementChild?.getAttribute('data-rig-joint')).toBe('left-arm');
    expect((torso.lastElementChild as HTMLElement).style.left).toBe('-24px');
    expect((rig.querySelector('[data-rig-part="torso"]') as HTMLImageElement).style.top).toBe('-76px');
    rerender(<WorldCharacterSprite {...props} asset={{ ...props.asset, paperDoll: { ...paperDoll, outfitId: 'teal', parts: { ...paperDoll.parts, torso: '/teal.png' } } }} />);
    expect(root.style.cssText).toBe(before);
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/head.png?rev=1');
    expect(rig.getAttribute('data-outfit')).toBe('teal');
    fireEvent.error(rig.querySelector('[data-rig-part="torso"]')!);
    expect(root.getAttribute('data-asset-missing')).toBe('true');
    expect(screen.queryByTestId('scene-character-rig-dog')).toBeNull();
  });
  it('reprojects the same world animation when the camera changes without restarting it', () => {
    vi.useFakeTimers();
    const { rerender } = render(<WorldCharacterSprite {...props} />);
    const moved = { ...character, position: { x: 118, y: 300 } };
    const motion = walk();
    rerender(<WorldCharacterSprite {...props} character={moved} x={118} motion={motion} />);
    const entity = screen.getByTestId('scene-character-dog');
    act(() => { vi.advanceTimersByTime(64); });
    const worldX = Number(entity.dataset.renderX);
    const phase = entity.dataset.gaitPhase;
    const resized = { ...props, character: moved, x: 49, ground: 200, scale: .5, worldScale: .5, motion };
    rerender(<WorldCharacterSprite {...resized} />);
    expect(entity.getAttribute('data-moving')).toBe('true');
    expect(entity.dataset.gaitPhase).toBe(phase);
    expect(Number.parseFloat(entity.style.left)).toBeCloseTo(worldX * .5 - 10);
    expect(entity.style.top).toBe('155px');
    const sprite = screen.getByTestId('scene-character-sprite-dog');
    Object.defineProperty(sprite, 'naturalHeight', { value: 100 });
    Object.defineProperty(sprite, 'naturalWidth', { value: 80 });
    fireEvent.load(sprite);
    expect(entity.dataset.gaitPhase).toBe(phase);
    act(() => { vi.advanceTimersByTime(200); });
    expect(entity.dataset.motionClip).toBe('idle');
    expect(entity.style.left).toBe('49px');
  });
  it('uses sprite art and keeps authoritative positions available to verification', () => {
    render(<WorldCharacterSprite {...props} />);
    const entity = screen.getByTestId('scene-character-dog');
    expect(entity.getAttribute('data-world-x')).toBe('100');
    expect(entity.getAttribute('data-asset-missing')).toBe('false');
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/dog.png?rev=1');
    fireEvent.click(entity);
    expect(props.onSelect).toHaveBeenCalled();
  });
  it('consumes explicit movement and does not guess a walk from teleports', () => {
    vi.useFakeTimers();
    const { rerender } = render(<WorldCharacterSprite {...props} />);
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-moving')).toBe('false');
    rerender(<WorldCharacterSprite {...props} character={{ ...character, position: { x: 72, y: 300 } }} x={72} />);
    expect(screen.getByTestId('scene-character-dog').getAttribute('data-moving')).toBe('false');
    rerender(<WorldCharacterSprite {...props} motion={walk(54)} character={{ ...character, position: { x: 54, y: 300 } }} x={54} />);
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
  it('cycles authored animal walk frames on the shared distance-driven timeline', () => {
    vi.useFakeTimers();
    const asset = { ...props.asset, walkFrames: ['/walk1.png', '/walk2.png'] };
    const { rerender } = render(<WorldCharacterSprite {...props} asset={asset} />);
    rerender(<WorldCharacterSprite {...props} asset={asset} motion={{ ...walk(148), durationMs: 400 }} character={{ ...character, position: { x: 148, y: 300 } }} />);
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/walk1.png?rev=1');
    act(() => { vi.advanceTimersByTime(240); });
    expect(screen.getByTestId('scene-character-sprite-dog').getAttribute('src')).toBe('/walk2.png?rev=1');
  });
});
