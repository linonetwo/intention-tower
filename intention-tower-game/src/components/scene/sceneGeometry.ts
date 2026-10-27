import type { SceneConnector, ScenePlatform, Position, WorldState, SceneDefinition, SceneRoom } from '../../types/backend';

/** Only authored, physically adjacent portal links belong to the same scrolling strip. */
export function connectedSceneRooms(scene: SceneDefinition | undefined, activeRoom: SceneRoom | undefined): SceneRoom[] {
  if (!activeRoom) return [];
  const rooms = scene?.rooms ?? [];
  const connected = new Set([activeRoom.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const portal of scene?.portals ?? []) {
      const from = rooms.find(r => r.id === portal.from_room);
      const to = rooms.find(r => r.id === portal.to_room);
      const a = scene?.platforms.find(p => p.id === portal.from_platform);
      const b = scene?.platforms.find(p => p.id === portal.to_platform);
      if (!from || !to || !a || !b || !from.platform_ids.includes(a.id) || !to.platform_ids.includes(b.id)
        || portal.x < a.x_min || portal.x > a.x_max || portal.x < b.x_min || portal.x > b.x_max
        || a.y !== b.y || !((from.x_max === to.x_min && portal.x === from.x_max) || (to.x_max === from.x_min && portal.x === to.x_max))) continue;
      if (connected.has(from.id) !== connected.has(to.id)) { connected.add(from.id); connected.add(to.id); changed = true; }
    }
  }
  return rooms.filter(r => connected.has(r.id)).sort((a, b) => a.x_min - b.x_min);
}

/** Old saves remain one implicit room; occupancy, not viewport position, owns room selection. */
export function activeSceneRoom(world: WorldState | null | undefined, actorId: string | null) {
  const rooms = world?.scene?.rooms ?? [];
  return rooms.find(room => room.id === (actorId ? world?.character_rooms?.[actorId] : undefined)) ?? rooms[0];
}
export function entityInRoom(roomId: string | undefined, occupancy: Record<string, string> | undefined, id: string, fallbackRoomId?: string) {
  return !roomId || (occupancy?.[id] ?? fallbackRoomId ?? 'main') === roomId;
}

export const projectPlatformY = (y: number, ground: number, scale: number) => ground + (y - 300) * scale;
export const pointerWorldX = (clientX: number, left: number, cameraX: number, scale: number) => (clientX - left - cameraX) / scale;
type BackgroundMetadata = { width: number; height: number; floorY: number };
/** Cover the room above its floor without moving the authoritative floor anchor. */
export function sceneCameraGeometry(width: number, ground: number, worldWidth: number, metadata?: BackgroundMetadata) {
  const validMetadata = metadata && Number.isFinite(metadata.width) && metadata.width > 0
    && Number.isFinite(metadata.height) && metadata.height > 0
    && Number.isFinite(metadata.floorY) && metadata.floorY > 0 && metadata.floorY <= metadata.height
    ? metadata : undefined;
  const worldScale = Math.max(.75, width / worldWidth,
    validMetadata ? (ground - 60) / (validMetadata.floorY * worldWidth / validMetadata.width) : 0);
  const backgroundScale = validMetadata ? worldScale * worldWidth / validMetadata.width : 1;
  return { worldScale, backgroundScale, backgroundTop: validMetadata ? ground - validMetadata.floorY * backgroundScale : 0, metadata: validMetadata };
}
export function characterArtScale(worldScale: number, ground: number, maxAssetHeight: number) {
  return Math.max(0, Math.min(worldScale, (ground - 70) / maxAssetHeight));
}
export function clampCameraX(width: number, focusX: number, scale: number, minX: number, maxX: number) {
  const offset = Math.max(width - maxX * scale, Math.min(-minX * scale, width / 2 - focusX * scale));
  // A left boundary at world zero must not leak negative zero into UI state.
  return offset === 0 ? 0 : offset;
}
export function connectorReachable(position: Position, connector: SceneConnector, platforms: ScenePlatform[]) {
  const from = platforms.find(p => p.id === connector.from_platform);
  const to = platforms.find(p => p.id === connector.to_platform);
  return (from?.y === position.y && Math.abs(position.x - connector.from_x) <= 20)
    || (to?.y === position.y && Math.abs(position.x - connector.to_x) <= 20);
}
