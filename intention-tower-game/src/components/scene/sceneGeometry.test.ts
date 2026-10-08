import { describe, expect, it } from 'vitest';
import { characterArtScale, clampCameraX, connectorReachable, pointerWorldX, projectPlatformY, sceneCameraGeometry } from './sceneGeometry';

describe('authoritative sideview geometry', () => {
  const room = { width: 1536, height: 1024, floorY: 850 };
  it.each([{ name: 'desktop', width: 1200, ground: 500 }, { name: 'portrait', width: 390, ground: 536 }, { name: 'landscape', width: 844, ground: 210 }])
    ('covers the $name room once while keeping its floor anchor', ({ width, ground }) => {
      const geometry = sceneCameraGeometry(width, ground, 800, room);
      expect(geometry.backgroundTop).toBeLessThanOrEqual(60 + 1e-9);
      expect(geometry.backgroundTop + room.floorY * geometry.backgroundScale).toBeCloseTo(ground);
      expect(room.width * geometry.backgroundScale).toBeGreaterThanOrEqual(width);
      expect(geometry.backgroundScale).toBeCloseTo(geometry.worldScale * 800 / room.width);
      const left = clampCameraX(width, 0, geometry.worldScale, 0, 800);
      const right = clampCameraX(width, 800, geometry.worldScale, 0, 800);
      expect(Object.is(left, -0)).toBe(false);
      expect(left).toBe(0);
      expect(right + 800 * geometry.worldScale).toBeCloseTo(width);
    });
  it('zooms portrait into a horizontal slice rather than filling the top with a second room', () => {
    const { worldScale, backgroundTop } = sceneCameraGeometry(390, 536, 800, room);
    expect(worldScale).toBeGreaterThan(.75);
    expect(390 / worldScale).toBeLessThan(800);
    expect(backgroundTop).toBeCloseTo(60);
  });
  it('uses actual sprite height to avoid unnecessarily shrinking landscape actors', () => {
    const { worldScale } = sceneCameraGeometry(844, 210, 800, room);
    expect(characterArtScale(worldScale, 210, 150)).toBeCloseTo(140 / 150);
    expect(210 - 150 * characterArtScale(worldScale, 210, 150)).toBeCloseTo(70);
    expect(characterArtScale(.75, 536, 150)).toBe(.75);
  });
  it.each([undefined, { width: 0, height: 1024, floorY: 850 }, { width: 1536, height: 1024, floorY: 0 }, { width: 1536, height: 1024, floorY: NaN }, { width: 1536, height: 1024, floorY: 1100 }])
    ('falls back safely when background floor metadata is unknown or invalid', metadata => {
      const geometry = sceneCameraGeometry(390, 536, 800, metadata);
      expect(geometry.metadata).toBeUndefined();
      expect(geometry.worldScale).toBe(.75);
      expect(geometry.backgroundScale).toBe(1);
      expect(geometry.backgroundTop).toBe(0);
    });
  it('maps true platform elevation without compressing or inventing character positions', () => {
    expect(projectPlatformY(300, 500, 1)).toBe(500);
    expect(projectPlatformY(180, 500, 1)).toBe(380);
    expect(projectPlatformY(180, 300, .5)).toBe(240);
  });
  it('converts only pointer X to world X', () => {
    expect(pointerWorldX(350, 20, 70, .5)).toBe(520);
  });
  it('never reveals empty horizontal room edges on desktop or mobile', () => {
    expect(clampCameraX(1200, 200, 1.5, 0, 800)).toBe(0);
    expect(clampCameraX(375, 0, .75, 0, 800)).toBe(0);
    expect(clampCameraX(375, 800, .75, 0, 800)).toBe(-225);
  });
  it('requires the actual current-floor endpoint, not arbitrary nearby screen Y', () => {
    const platforms = [{ id: 'ground', x_min: 0, x_max: 800, y: 300 }, { id: 'loft', x_min: 580, x_max: 800, y: 180 }];
    const stairs = { id: 'stairs', kind: 'stairs' as const, from_platform: 'ground', to_platform: 'loft', from_x: 520, to_x: 580 };
    expect(connectorReachable({ x: 400, y: 300 }, stairs, platforms)).toBe(false);
    expect(connectorReachable({ x: 520, y: 300 }, stairs, platforms)).toBe(true);
    expect(connectorReachable({ x: 580, y: 180 }, stairs, platforms)).toBe(true);
    expect(connectorReachable({ x: 520, y: 180 }, stairs, platforms)).toBe(false);
  });
});
