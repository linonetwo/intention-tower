import type { SceneConnector, ScenePlatform, Position } from '../../types/backend';

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
    validMetadata ? (ground - 60) / (validMetadata.floorY * 800 / validMetadata.width) : 0);
  const backgroundScale = validMetadata ? worldScale * 800 / validMetadata.width : 1;
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
