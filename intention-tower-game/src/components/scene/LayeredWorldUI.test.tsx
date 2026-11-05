import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef, WorldState } from '../../types/backend';
import { LayeredWorldActionRail, LayeredWorldHotspots, LayeredWorldStatus, layeredHotspots } from './LayeredWorldUI';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../i18n', () => ({ translateLabel: (key: string) => key }));
afterEach(cleanup);
const command = (id: string) => ({ command_id: id, label: id }) as CommandDef;
function fixture(): WorldState {
  return {
    characters: { actor: { mind_graph: { nodes: { hunger: { schema_id: 'hunger', value: .9 } } } } },
    items: { entry: { id: 'entry', label: 'Terminal', position: { x: 200, y: 300 } }, cue: { id: 'cue', label: 'Cue', position: { x: 1100, y: 300 } }, meal: { id: 'meal', label: 'Meal', position: { x: 1300, y: 300 } } },
    item_rooms: { entry: 'workshop', cue: 'garden', meal: 'garden' },
    scene: { layered_world: { contexts: [{ id: 'reality', entry_item_id: 'entry', return_item_id: null, cue_item_id: 'cue', cue_fact: 'UNVISITED SECRET' }, { id: 'outer', cue_fact: 'OUTER SECRET' }, { id: 'inner', cue_fact: 'INNER SECRET' }], meal_item_id: 'meal', need_schema_id: 'hunger' } },
    layered_world: { actor: { next_sequence: 0, context_id: 'reality', stack: [], observations: {}, comparison: null, rewards: {}, need_receipt: null } },
  } as unknown as WorldState;
}
describe('authoritative layered scene controls', () => {
  it('only exposes authored markers in the current room, not another room or context', () => {
    expect(layeredHotspots(fixture(), 'actor', 'workshop').map(marker => marker.item.id)).toEqual(['entry']);
    expect(layeredHotspots(fixture(), 'actor', 'garden').map(marker => marker.item.id)).toEqual(['cue', 'meal']);
    expect(layeredHotspots(fixture(), 'actor', 'inner-archive')).toEqual([]);
  });
  it('walks toward actual terminals, never invents an unavailable enter command', () => {
    const execute = vi.fn(); const walkTo = vi.fn();
    render(<LayeredWorldHotspots world={fixture()} actorId="actor" roomId="workshop" available={[]} cameraX={0} scale={1} ground={500} width={800} enabled execute={execute} walkTo={walkTo} />);
    expect(screen.queryByTestId('layer-action-enter-vr')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(walkTo).toHaveBeenCalledWith(200); expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole('button').style.minHeight).toBe('44px');
  });
  it('executes only the backend-available current marker action', () => {
    const execute = vi.fn();
    render(<LayeredWorldActionRail world={fixture()} actorId="actor" roomId="workshop" available={[command('enter-vr'), command('exit-vr')]} bottom={107} height={100} enabled execute={execute} />);
    fireEvent.click(screen.getByTestId('layer-action-enter-vr'));
    expect(execute).toHaveBeenCalledWith('enter-vr');
    expect(screen.queryByTestId('layer-action-exit-vr')).toBeNull();
    expect(screen.getByTestId('layer-action-rail').style.bottom).toBe('107px');
    expect(screen.getByTestId('layer-action-rail').style.flexWrap).toBe('wrap');
    expect(screen.getByTestId('layer-action-enter-vr').style.minHeight).toBe('44px');
  });
  it('does not pin offscreen terminals to the viewport', () => {
    render(<LayeredWorldHotspots world={fixture()} actorId="actor" roomId="workshop" available={[command('enter-vr')]} cameraX={-600} scale={1} ground={500} width={390} enabled execute={vi.fn()} walkTo={vi.fn()} />);
    expect(screen.queryByTestId('layer-hotspot-entry')).toBeNull();
  });
  it('notebook reveals recorded observations only, not authored unseen facts', () => {
    const world = fixture();
    world.layered_world!.actor.observations.reality = { sequence: 1, id: 'o1', context_id: 'reality', fact: 'OBSERVED FACT' } as never;
    render(<LayeredWorldStatus world={world} actorId="actor" notes height={180} available={[]} execute={vi.fn()} />);
    expect(screen.getByTestId('layer-note-reality').textContent).toContain('OBSERVED FACT');
    expect(screen.getByTestId('layer-notebook').textContent).not.toContain('SECRET');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('renders an authoritative migration receipt without inventing observations or progress', () => {
    const world = fixture();
    world.layered_world_migration = { level_id: 'cyber-dream', migrated_at_tick: 8, legacy_in_virtual_context: true, legacy_virtual_context_stack: ['legacy'], legacy_progress: {} as never, message_key: 'layer.migration.legacy-reset' };
    render(<LayeredWorldStatus world={world} actorId="actor" notes={false} available={[]} execute={vi.fn()} />);
    expect(screen.getByTestId('layer-migration-notice').textContent).toBe('layer.migration.legacy-reset');
    expect(world.layered_world!.actor.observations).toEqual({});
  });
  it('keeps simultaneous cue, reward and comparison actions visible in a wrapping floor rail', () => {
    const world = fixture();
    world.layered_world!.actor.context_id = 'outer';
    world.layered_world!.actor.stack = [{}] as never;
    world.scene!.layered_world!.contexts[1].cue_item_id = 'cue';
    render(<LayeredWorldActionRail world={world} actorId="actor" roomId="garden" available={['examine-reality', 'earn-virtual-reward', 'compare-layers'].map(command)} bottom={107} height={100} enabled execute={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByTestId('layer-action-rail').style.overflow).toBe('');
  });
});
