import type { SceneConnector, ScenePlatform, Position } from '../../types/backend';

export const projectPlatformY = (y: number, ground: number, scale: number) => ground + (y - 300) * scale;
export const pointerWorldX = (clientX: number, left: number, cameraX: number, scale: number) => (clientX - left - cameraX) / scale;
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
