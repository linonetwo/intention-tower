import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameScene } from './GameScene';
import { gameStore } from '../../store/useGameState';
import { modAssetsStore } from '../../store/useModAssets';
import type { WorldState } from '../../types/backend';
import { activeSceneRoom, entityInRoom, projectPlatformY } from './sceneGeometry';

vi.mock('../../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ dialogueHeight: 25 }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../i18n', () => ({ translateLabel: (label: string) => label, t: (key: string) => key }));

const person = (id: string, x: number) => ({ id, label: id, position: { x, y: 300 }, mind_graph: { character_id: id, nodes: {}, edges: {} } });
const makeWorld = () => ({ tick: 42, characters: { boy: person('boy', 950), dog: person('dog', 200) }, items: {}, character_rooms: { boy: 'pantry', dog: 'lab' }, item_rooms: {}, progress: { status: 'InProgress' }, scene: {
  rooms: [{ id: 'lab', label: 'Laboratory', x_min: 0, x_max: 800, platform_ids: ['lab-floor'] }, { id: 'pantry', label: 'Pantry', x_min: 800, x_max: 1600, platform_ids: ['pantry-floor'], background_key: 'pantry' }],
  platforms: [{ id: 'lab-floor', x_min: 0, x_max: 800, y: 300 }, { id: 'pantry-floor', x_min: 800, x_max: 1600, y: 300 }], connectors: [], portals: [{ id: 'door', from_room: 'lab', to_room: 'pantry', from_platform: 'lab-floor', to_platform: 'pantry-floor', x: 800 }],
} } as unknown as WorldState);
const parts = { torso: '/torso.png', upperArm: '/arm.png', forearm: '/forearm.png', thigh: '/thigh.png', shin: '/shin.png' };
beforeEach(() => {
  gameStore.setState({ worldState: makeWorld(), currentLevelId: 'pavlov', selectedActorId: 'boy', selectedTargetId: 'dog' });
  modAssetsStore.setState({ selectedOutfits: {}, manifest: { id: 'test', backgrounds: { pantry: '/pantry.png' }, backgroundsMetadata: { pantry: { width: 1536, height: 1024, floorY: 850 } }, paperDoll: { version: 1, heads: { boy: '/head.png' }, outfits: { student: parts, teal: { ...parts, torso: '/teal.png' } }, characters: { boy: { headId: 'boy', outfitId: 'student' } } } } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('continuous multi-room scene', () => {
  it('draws mobile ladders with two rails and separated open rungs, while stairs keep solid steps', () => {
    const world = makeWorld();
    world.scene!.platforms.push({ id: 'loft', x_min: 1200, x_max: 1600, y: 180 });
    world.scene!.rooms![1].platform_ids.push('loft');
    world.scene!.connectors.push({ id: 'ladder', kind: 'ladder', from_platform: 'pantry-floor', to_platform: 'loft', from_x: 1250, to_x: 1250 }, { id: 'stairs', kind: 'stairs', from_platform: 'pantry-floor', to_platform: 'loft', from_x: 1100, to_x: 1200 });
    gameStore.setState({ worldState: world });
    render(<GameScene width={320} height={640} />);
    const ladder = screen.getByTestId('scene-connector-ladder');
    expect(ladder.tagName.toLowerCase()).toBe('svg');
    expect(ladder.querySelectorAll('[data-ladder-rail]')).toHaveLength(2);
    const rungs = ladder.querySelectorAll('[data-ladder-rung]');
    expect(rungs.length).toBeGreaterThan(4);
    const heights = Array.from(rungs, rung => Number(rung.querySelector('line')!.getAttribute('y1'))).sort((a, b) => a - b);
    expect(heights[1] - heights[0]).toBeGreaterThan(5);
    expect(ladder.querySelector('rect')).toBeNull();
    expect(screen.getByTestId('scene-connector-stairs').querySelectorAll('div')).toHaveLength(8);
    expect(gameStore.getState().worldState).toBe(world);
  });
  it('filters by occupancy and anchors the right-hand room background to its nonzero world origin', () => {
    render(<GameScene width={390} height={800} />);
    expect(screen.getByTestId('scene-room-title').textContent).toBe('Pantry');
    expect(screen.queryByTestId('scene-character-dog')).not.toBeNull();
    expect(screen.queryByTestId('scene-platform-lab-floor')).not.toBeNull();
    const world = screen.getByTestId('scene-world');
    const camera = Number(world.getAttribute('data-camera-x'));
    const floor = screen.getByTestId('scene-platform-pantry-floor');
    expect(screen.getByTestId('scene-background').style.left).toBe(floor.style.left);
    expect(camera).toBeLessThan(0);
    expect(floor.style.top).toBe(`${screen.getByTestId('scene-ground').getAttribute('data-ground-y')}px`);
    expect(screen.getByTestId('scene-portal-door').style.minWidth).toBe('44px');
    expect(Number(screen.getByTestId('scene-portal-door').style.zIndex)).toBeGreaterThan(300);
  });
  it('changes only cosmetic state and preserves the current scene/world', () => {
    const world = gameStore.getState().worldState;
    const load = vi.spyOn(gameStore.getState(), 'loadLevel');
    render(<GameScene width={390} height={800} />);
    fireEvent.click(screen.getByTestId('scene-wardrobe'));
    fireEvent.click(screen.getByTestId('scene-outfit-teal'));
    expect(modAssetsStore.getState().selectedOutfits.boy).toBe('teal');
    expect(gameStore.getState().worldState).toBe(world);
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByTestId('scene-character-rig-boy').getAttribute('data-outfit')).toBe('teal');
  });
  it('anchors wardrobe to bottom controls with an upward scrolling mobile popover', () => {
    render(<GameScene width={320} height={640} />);
    const trigger = screen.getByTestId('scene-wardrobe');
    expect(screen.getByTestId('scene-selected-info').contains(trigger)).toBe(true);
    expect(trigger.style.minHeight).toBe('44px');
    fireEvent.click(trigger);
    const outfits = screen.getByTestId('scene-outfits');
    expect(outfits.style.bottom).toBe('calc(100% + 8px)');
    expect(outfits.style.overflowY).toBe('auto');
    expect(screen.getByTestId('scene-outfit-teal').style.minHeight).toBe('44px');
    expect(screen.getByTestId('scene-room-title').style.top).toBe('');
    act(() => gameStore.setState({ worldState: { ...makeWorld(), character_rooms: { boy: 'lab', dog: 'lab' } } }));
    expect(screen.queryByTestId('scene-outfits')).toBeNull();
  });
  it('follows authoritative occupancy without resetting tick or selecting another level', () => {
    render(<GameScene width={390} height={800} />);
    act(() => gameStore.setState({ worldState: { ...makeWorld(), character_rooms: { boy: 'lab', dog: 'lab' } } }));
    expect(screen.getByTestId('scene-room-title').textContent).toBe('Laboratory');
    expect(screen.getByTestId('scene-character-dog')).toBeTruthy();
    expect(gameStore.getState().worldState?.tick).toBe(42);
    expect(gameStore.getState().currentLevelId).toBe('pavlov');
  });
  it('continues the same target walk through an adjacent room seam', async () => {
    vi.useFakeTimers();
    const move = vi.spyOn(gameStore.getState(), 'moveSelectedActor').mockImplementation(async dx => {
      const world = gameStore.getState().worldState!;
      const boy = world.characters.boy;
      const x = boy.position.x + dx;
      gameStore.setState({ worldState: { ...world, characters: { ...world.characters, boy: { ...boy, position: { x, y: 300 } } }, character_rooms: { ...world.character_rooms, boy: x < 800 ? 'lab' : 'pantry' } } });
    });
    const load = vi.spyOn(gameStore.getState(), 'loadLevel');
    render(<GameScene width={390} height={800} />);
    await act(async () => { fireEvent.click(screen.getByTestId('scene-portal-door')); });
    for (let step = 0; step < 14; step++) await act(async () => { await vi.advanceTimersByTimeAsync(70); });
    expect(move).toHaveBeenCalled();
    expect(gameStore.getState().worldState?.characters.boy.position.x).toBe(772);
    expect(screen.getByTestId('scene-room-title').textContent).toBe('Laboratory');
    expect(load).not.toHaveBeenCalled();
  });
  it('retains implicit legacy rooms and authoritative floor projection', () => {
    expect(activeSceneRoom({ scene: { platforms: [], connectors: [] } } as unknown as WorldState, 'boy')).toBeUndefined();
    expect(entityInRoom(undefined, undefined, 'boy')).toBe(true);
    expect(entityInRoom('lab', undefined, 'boy', 'lab')).toBe(true);
    expect(projectPlatformY(180, 500, 1.5)).toBe(320);
  });
  it('scrolls continuously across the seam and excludes disconnected rooms', () => {
    const world = makeWorld();
    world.scene!.rooms!.push({ id: 'island', label: 'Island', x_min: 2000, x_max: 2800, platform_ids: ['island-floor'] });
    world.scene!.platforms.push({ id: 'island-floor', x_min: 2000, x_max: 2800, y: 300 });
    world.characters.islander = person('islander', 2200);
    world.character_rooms!.islander = 'island';
    world.characters.boy.position.x = 791;
    world.character_rooms!.boy = 'lab';
    gameStore.setState({ worldState: world });
    modAssetsStore.setState({ manifest: { ...modAssetsStore.getState().manifest!, backgrounds: { pavlov: '/lab.png', pantry: '/pantry.png' } } });
    render(<GameScene width={390} height={800} />);
    const before = Number(screen.getByTestId('scene-world').getAttribute('data-camera-x'));
    const projectedBefore = parseFloat(screen.getByTestId('scene-platform-pantry-floor').style.left);
    expect(screen.getByTestId('scene-background-room-pantry')).toBeTruthy();
    expect(screen.queryByTestId('scene-platform-island-floor')).toBeNull();
    expect(screen.queryByTestId('scene-character-islander')).toBeNull();
    act(() => gameStore.setState({ worldState: { ...world, character_rooms: { ...world.character_rooms, boy: 'pantry' }, characters: { ...world.characters, boy: { ...world.characters.boy, position: { x: 809, y: 300 } } } } }));
    const after = Number(screen.getByTestId('scene-world').getAttribute('data-camera-x'));
    const debug = (window as Window & { __itSceneDebug?: () => { scale: number } }).__itSceneDebug!();
    expect(after - before).toBeCloseTo(-18 * debug.scale);
    expect(parseFloat(screen.getByTestId('scene-platform-pantry-floor').style.left) - projectedBefore).toBeCloseTo(after - before);
    expect(screen.getByTestId('scene-background').getAttribute('data-room-id')).toBe('pantry');
    expect(screen.getByTestId('scene-background-room-lab')).toBeTruthy();
  });
});
