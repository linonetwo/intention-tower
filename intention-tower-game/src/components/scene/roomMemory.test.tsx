import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomMemoryEntry, RoomMemoryPhase, WorldState } from '../../types/backend';
import { gameStore } from '../../store/useGameState';
import { modAssetsStore } from '../../store/useModAssets';
import { GameScene } from './GameScene';
import { primaryRoomMemory, roomMemoryDrugTicks, roomMemoryPresentation } from './roomMemory';

vi.mock('../../hooks/useResponsiveLayout', () => ({ useResponsiveLayout: () => ({ dialogueHeight: 25 }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, args?: Record<string, unknown>) => key + (args?.ticks != null ? `:${args.ticks}` : args?.room ? `:${args.room}` : '') }) }));
vi.mock('../../i18n', () => ({ translateLabel: (value: string) => value, t: (value: string) => value }));

function entry(phase: RoomMemoryPhase, extra: Partial<RoomMemoryEntry> = {}): RoomMemoryEntry {
  return { phase, generation: 0, variant_id: 'archive', background_key: 'antimeme_archive', visit_count: 1, entered_at_tick: 0, last_seen_tick: 1, left_at_tick: 1, forgotten_at_tick: null, forgotten_count: 0, revisit_count: 0, anchored_at_tick: null, anchor_drug_used_at_tick: null, anchor_drug_until_tick: null, anchored_revisit_count: 0, forgotten_revisits: [], anchored_revisits: [], witness_recalls: [], ...extra };
}
const person = (id: string, x: number) => ({ id, label: id, position: { x, y: 300 }, mind_graph: { character_id: id, nodes: {}, edges: {} } });
function memoryWorld(phase: RoomMemoryPhase = 'visible'): WorldState {
  const rooms = ['reception', 'archive', 'conservatory'].map((id, i) => ({ id, label: `room.antimeme.${id}`, x_min: i * 800, x_max: (i + 1) * 800, platform_ids: [id], background_key: `antimeme_${id}` }));
  return { tick: 8, characters: { 'antimeme-agent': person('antimeme-agent', 400), bystander: person('bystander', 1100) }, character_rooms: { 'antimeme-agent': 'reception', bystander: 'archive' }, items: { clue: { id: 'clue', label: 'Secret clue', position: { x: 1200, y: 300 }, owner_id: null } }, item_rooms: { clue: 'archive' }, progress: { status: 'InProgress' }, scene: { rooms, platforms: rooms.map(r => ({ id: r.id, x_min: r.x_min, x_max: r.x_max, y: 300 })), connectors: [], portals: [{ id: 'door', from_room: 'reception', to_room: 'archive', from_platform: 'reception', to_platform: 'archive', x: 800 }, { id: 'inner', from_room: 'archive', to_room: 'conservatory', from_platform: 'archive', to_platform: 'conservatory', x: 1600 }], room_memory: { observer_ids: ['antimeme-agent'], witness_ids: ['bystander'], rooms: [{ room_id: 'archive', variants: [{ id: 'archive', background_key: 'antimeme_archive' }, { id: 'maproom', background_key: 'antimeme_maproom' }] }, { room_id: 'conservatory', variants: [{ id: 'conservatory', background_key: 'antimeme_conservatory' }] }], fade_after_ticks: 3, forget_after_ticks: 6, drug_duration_ticks: 40, observation_schema_id: 'it:concept/memory-of-location' } }, room_memory: { 'antimeme-agent': { drug_until_tick: 28, drug_used_at_tick: 0, rooms: { archive: entry(phase) } }, bystander: { drug_until_tick: null, drug_used_at_tick: null, rooms: { archive: entry('visible') } } } } as unknown as WorldState;
}
beforeEach(() => {
  gameStore.setState({ worldState: memoryWorld(), currentLevelId: 'antimeme-division', selectedActorId: 'antimeme-agent', selectedTargetId: 'bystander' });
  const metadata = { width: 1536, height: 1024, floorY: 850 };
  modAssetsStore.setState({ selectedOutfits: {}, manifest: { id: 'memory', backgrounds: { antimeme_reception: '/reception.png', antimeme_archive: '/archive.png', antimeme_conservatory: '/conservatory.png', antimeme_maproom: '/maproom.png' }, backgroundsMetadata: { antimeme_reception: metadata, antimeme_archive: metadata, antimeme_conservatory: metadata, antimeme_maproom: { width: 2048, height: 1536, floorY: 1300 } } } });
});
afterEach(cleanup);

describe('observer-owned antimemetic room presentation', () => {
  it.each(['visible', 'remembered', 'fading', 'forgotten', 'anchored'] as const)('renders authoritative %s phase without local timeouts', phase => {
    const world = memoryWorld(phase);
    const view = roomMemoryPresentation(world, world.scene!.rooms![1]);
    expect(view.phase).toBe(phase);
    expect(view.hidden).toBe(phase === 'forgotten');
    if (phase === 'fading') { expect(view.filter).toBe('grayscale(1)'); expect(view.opacity).toBeLessThan(.5); }
    if (phase === 'remembered') { expect(view.filter).toBeUndefined(); expect(view.opacity).toBe(1); }
    expect(roomMemoryPresentation(world, world.scene!.rooms![0]).phase).toBe('stable');
    expect(roomMemoryPresentation(world, world.scene!.rooms![2]).hidden).toBe(true);
    expect(primaryRoomMemory(world).observerId).toBe('antimeme-agent');
  });
  it('hides forgotten images, people and items even when selecting a witness who remembers', () => {
    gameStore.setState({ worldState: memoryWorld('forgotten'), selectedActorId: 'bystander' });
    render(<GameScene width={390} height={800} />);
    expect(screen.queryByTestId('scene-background')).toBeNull();
    expect(screen.queryByTestId('scene-character-bystander')).toBeNull();
    expect(screen.getByTestId('scene-memory-fog-archive').getAttribute('data-memory-phase')).toBe('forgotten');
    expect(screen.getByTestId('scene-memory-fog-conservatory')).toBeTruthy();
    fireEvent.click(screen.getByTestId('scene-toggle-items'));
    expect(screen.queryByTestId('scene-item-clue')).toBeNull();
    expect(document.querySelector('img[src^="/archive.png"]')).toBeNull();
    expect(screen.getByTestId('scene-portal-door').style.minHeight).toBe('44px');
    expect(screen.getByTestId('scene-platform-archive').getAttribute('data-world-y')).toBe('300');
  });
  it('grays fading content and restores a different room variant without moving the camera or floor', () => {
    gameStore.setState({ worldState: memoryWorld('fading') });
    render(<GameScene width={390} height={800} />);
    const background = screen.getByTestId('scene-background-room-archive');
    expect(background.style.filter).toBe('grayscale(1)');
    expect(screen.getByTestId('scene-character-bystander').parentElement!.style.filter).toBe('grayscale(1)');
    const camera = screen.getByTestId('scene-world').getAttribute('data-camera-x');
    const floorLeft = screen.getByTestId('scene-platform-archive').style.left;
    const floorTop = screen.getByTestId('scene-platform-archive').style.top;
    const world = memoryWorld('visible');
    world.room_memory!['antimeme-agent'].rooms.archive = entry('visible', { generation: 1, variant_id: 'maproom', background_key: 'antimeme_maproom' });
    act(() => gameStore.setState({ worldState: world }));
    expect(screen.getByTestId('scene-background-room-archive').getAttribute('src')).toContain('/maproom.png');
    expect(screen.getByTestId('scene-world').getAttribute('data-camera-x')).toBe(camera);
    expect(screen.getByTestId('scene-platform-archive').style.left).toBe(floorLeft);
    expect(screen.getByTestId('scene-platform-archive').style.top).toBe(floorTop);
    const image = screen.getByTestId('scene-background-room-archive');
    const ground = Number(screen.getByTestId('scene-ground').getAttribute('data-ground-y'));
    expect(parseFloat(image.style.top) + 1300 * parseFloat(image.style.width) / 2048).toBeCloseTo(ground);
  });
  it('opens a touch-sized notebook below the floor with primary-observer drug time and no secret variants', () => {
    gameStore.setState({ worldState: memoryWorld('forgotten'), selectedActorId: 'bystander' });
    render(<GameScene width={320} height={640} />);
    const world = gameStore.getState().worldState;
    fireEvent.click(screen.getByTestId('scene-memory-map'));
    expect(screen.getByTestId('scene-memory-map').style.minHeight).toBe('44px');
    expect(screen.getByTestId('memory-map-room-archive').style.minHeight).toBe('44px');
    expect(screen.getByTestId('memory-map-room-archive').textContent).not.toContain('memory.variant.archive');
    expect(screen.getByTestId('memory-map-room-reception').textContent).toContain('memory.youAreHere');
    expect(screen.getByTestId('memory-drug-remaining').textContent).toBe('memory.drugRemaining:20');
    expect(screen.getByTestId('room-memory-notes').style.overflowY).toBe('auto');
    expect(gameStore.getState().worldState).toBe(world);
    expect(roomMemoryDrugTicks({ ...world!, tick: 100 })).toBe(0);
  });
  it('uses the regenerated identity consistently in the notebook, passage and scene title', () => {
    const world = memoryWorld('remembered');
    world.room_memory!['antimeme-agent'].rooms.archive = entry('remembered', { variant_id: 'maproom', background_key: 'antimeme_maproom' });
    gameStore.setState({ worldState: world });
    render(<GameScene width={390} height={800} />);
    fireEvent.click(screen.getByTestId('scene-memory-map'));
    expect(screen.getByTestId('memory-map-room-archive').textContent).toContain('memory.variant.maproom');
    expect(screen.getByTestId('memory-map-room-archive').textContent).not.toContain('room.antimeme.archive');
    expect(screen.getByTestId('scene-portal-door').getAttribute('aria-label')).toBe('scene.enterRoom:memory.variant.maproom');
    act(() => gameStore.setState({ worldState: { ...world, character_rooms: { ...world.character_rooms, 'antimeme-agent': 'archive' } } }));
    expect(screen.getByTestId('scene-room-title').textContent).toBe('memory.variant.maproom');
  });
  it('leaves legacy scenes untouched when no memory config exists', () => {
    const world = memoryWorld('forgotten');
    delete world.scene!.room_memory;
    gameStore.setState({ worldState: world });
    render(<GameScene width={390} height={800} />);
    expect(roomMemoryPresentation(world, world.scene!.rooms![1]).hidden).toBe(false);
    expect(screen.queryByTestId('scene-memory-map')).toBeNull();
    expect(screen.queryByTestId('scene-memory-fog-archive')).toBeNull();
    expect(screen.getByTestId('scene-background-room-archive')).toBeTruthy();
    expect(screen.getByTestId('scene-character-bystander')).toBeTruthy();
  });
});
