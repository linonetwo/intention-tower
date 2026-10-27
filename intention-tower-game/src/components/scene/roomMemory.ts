import type { SceneRoom, WorldState } from '../../types/backend';

/** Fog always belongs to the configured protagonist, never the currently selected NPC. */
export function primaryRoomMemory(world: WorldState | null | undefined) {
  const observerId = world?.scene?.room_memory?.observer_ids[0];
  return { observerId, memory: observerId ? world?.room_memory?.[observerId] : undefined };
}

export function roomMemoryPresentation(world: WorldState | null | undefined, room: SceneRoom) {
  const configured = world?.scene?.room_memory?.rooms.some(r => r.room_id === room.id) ?? false;
  const { memory } = primaryRoomMemory(world);
  const entry = configured ? memory?.rooms[room.id] : undefined;
  const phase = configured ? entry?.phase ?? 'unvisited' : 'stable';
  const hidden = phase === 'unvisited' || phase === 'forgotten';
  return {
    phase, entry, hidden,
    // A room's physical address is stable, but its perceived identity can change.
    labelKey: hidden ? `memory.phase.${phase}` : entry ? `memory.variant.${entry.variant_id}` : undefined,
    backgroundKey: hidden ? undefined : entry?.background_key ?? room.background_key,
    filter: phase === 'fading' ? 'grayscale(1)' : undefined,
    opacity: phase === 'fading' ? .38 : 1,
    anchored: entry?.anchored_at_tick != null || phase === 'anchored',
  };
}

export function roomMemoryDrugTicks(world: WorldState | null | undefined) {
  const { memory } = primaryRoomMemory(world);
  return Math.max(0, (memory?.drug_until_tick ?? 0) - (world?.tick ?? 0));
}
