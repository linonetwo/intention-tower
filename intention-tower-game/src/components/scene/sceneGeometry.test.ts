import { describe, expect, it } from 'vitest';
import { clampCameraX, connectorReachable, pointerWorldX, projectPlatformY } from './sceneGeometry';

describe('authoritative sideview geometry', () => {
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
