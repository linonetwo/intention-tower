/**
 * GameScene — full-screen PixiJS canvas rendering the game world.
 *
 * Uses plain pixi.js (no @pixi/react) mounted to a React ref for reliability
 * across pixi.js versions.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { Application, Graphics, Text, TextStyle, Container, Assets, Sprite } from 'pixi.js';
import { gameStore, useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { modAssetsStore } from '../../store/useModAssets';

/* ── Constants ── */
// Level JSON uses a 800×600-ish design canvas measured in pixels. Treating
// those values as grid cells (the old ×80 conversion) pushed every entity
// thousands of pixels off screen.
const GRID_SIZE = 80;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const CHAR_RADIUS = 22;
const ITEM_RADIUS = 12;

const COLORS = {
  bg: 0x0e0e1a,
  grid: 0x1a1a3e,
  charDefault: 0x3949ab,
  charActor: 0x4caf50,
  charTarget: 0xff9800,
  item: 0xffca28,
  selectRing: 0x536dfe,
  text: 0xcccccc,
  resourceBar: 0x66bb6a,
  resourceBg: 0x222244,
};

/* ── Viewport ── */
interface Viewport { x: number; y: number; scale: number; }

/* ── Main component ── */
export const GameScene: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const currentLevelId = useGameState((state) => state.currentLevelId);
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const bgGfx = useRef<Graphics | null>(null);
  const bgImageLayer = useRef<Container | null>(null);
  const bgSpriteRef = useRef<Sprite | null>(null);
  const bgImageUrlRef = useRef<string>('');
  const bgLoadTokenRef = useRef<number>(0);
  const bgDebugRef = useRef<{ levelId: string; bgPath: string | null; fitted: { x: number; y: number; width: number; height: number } | null; texture: { width: number; height: number } | null; viewport: { width: number; height: number } | null; }>({
    levelId: '',
    bgPath: null,
    fitted: null,
    texture: null,
    viewport: null,
  });
  const charGfx = useRef<Graphics | null>(null);
  const itemGfx = useRef<Graphics | null>(null);
  const labelContainer = useRef<Container | null>(null);
  const rafRef = useRef<number>(0);
  const lastRenderAtRef = useRef<number>(0);

  const fitBackgroundSprite = useCallback((sprite: Sprite, w: number, h: number) => {
    const textureWidth = Math.max(1, sprite.texture.width || 1);
    const textureHeight = Math.max(1, sprite.texture.height || 1);
    // Use "fill" strategy so background always fully covers the scene viewport.
    sprite.width = w;
    sprite.height = h;
    sprite.x = 0;
    sprite.y = 0;
    bgDebugRef.current.fitted = { x: 0, y: 0, width: sprite.width, height: sprite.height };
    bgDebugRef.current.texture = { width: textureWidth, height: textureHeight };
    bgDebugRef.current.viewport = { width: w, height: h };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as Window & { __itBgDebug?: () => unknown }).__itBgDebug = () => ({ ...bgDebugRef.current });
  }, []);

  const loadBackgroundImage = useCallback(async (url: string) => {
    const layer = bgImageLayer.current;
    if (!layer || bgImageUrlRef.current === url) return;
    bgImageUrlRef.current = url;
    const token = ++bgLoadTokenRef.current;

    try {
      const texture = await Assets.load(url);
      if (token !== bgLoadTokenRef.current) return;

      if (bgSpriteRef.current) {
        layer.removeChild(bgSpriteRef.current);
        bgSpriteRef.current.destroy();
        bgSpriteRef.current = null;
      }

      const sprite = new Sprite(texture);
      sprite.alpha = 0.85;
      layer.addChild(sprite);
      bgSpriteRef.current = sprite;
    } catch {
      if (token !== bgLoadTokenRef.current) return;
      bgImageUrlRef.current = '';
    }
  }, []);

  // World ↔ screen coordinate conversion
  const worldToScreen = useCallback((wx: number, wy: number, vp: Viewport, w: number, h: number) => ({
    x: wx * vp.scale + vp.x + w / 2,
    y: wy * vp.scale + vp.y + h / 2,
  }), []);

  const fitWorldToViewport = useCallback((w: number, h: number) => {
    const world = gameStore.getState().worldState;
    if (!world) return;
    const points = [
      ...Object.values(world.characters).map((character) => character.position),
      ...Object.values(world.items).map((item) => item.position),
    ];
    if (points.length === 0) {
      viewportRef.current = { x: 0, y: 0, scale: 1 };
      return;
    }

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const worldWidth = Math.max(220, maxX - minX);
    const worldHeight = Math.max(180, maxY - minY);
    const padding = Math.min(120, Math.max(42, Math.min(w, h) * 0.14));
    const scale = Math.max(
      ZOOM_MIN,
      Math.min(1.4, (w - padding * 2) / worldWidth, (h - padding * 2) / worldHeight),
    );
    viewportRef.current = {
      x: -((minX + maxX) / 2) * scale,
      y: -((minY + maxY) / 2) * scale,
      scale,
    };
  }, []);

  // ── Initialize PixiJS Application once ──
  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new Application();

    const init = async () => {
      await app.init({
        width,
        height,
        background: COLORS.bg,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (!canvasRef.current) { app.destroy(true); return; }
      canvasRef.current.appendChild(app.canvas);
      appRef.current = app;

      // Layer containers
      const bgImage = new Container();
      const bg = new Graphics();
      const items = new Graphics();
      const chars = new Graphics();
      const labels = new Container();

      app.stage.addChild(bgImage, bg, items, chars, labels);
      bgImageLayer.current = bgImage;
      bgGfx.current = bg;
      itemGfx.current = items;
      charGfx.current = chars;
      labelContainer.current = labels;

      setupInteraction(app.canvas as HTMLCanvasElement);
      fitWorldToViewport(width, height);
      startRenderLoop();
    };

    init().catch(console.error);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (bgSpriteRef.current) {
        bgSpriteRef.current.destroy();
        bgSpriteRef.current = null;
      }
      bgImageLayer.current = null;
      bgImageUrlRef.current = '';
      appRef.current?.destroy(true, { children: true });
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new level gets a fresh camera; subsequent player pans survive normal renders.
  useEffect(() => {
    if (!currentLevelId || !appRef.current) return;
    fitWorldToViewport(width, height);
  }, [currentLevelId, fitWorldToViewport, height, width]);

  // ── Resize ──
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.resize(width, height);

    const sprite = bgSpriteRef.current;
    if (sprite) {
      const rw = app.renderer.width / (window.devicePixelRatio || 1);
      const rh = app.renderer.height / (window.devicePixelRatio || 1);
      fitBackgroundSprite(sprite, rw, rh);
    }
  }, [fitBackgroundSprite, width, height]);

  // ── Render loop ──
  const startRenderLoop = useCallback(() => {
    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      // Cap render cadence to ~30fps to keep UI/main-thread responsive for tooling.
      if (now - lastRenderAtRef.current < 33) return;
      lastRenderAtRef.current = now;
      renderScene();
    };
    rafRef.current = requestAnimationFrame(draw);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scene rendering ──
  const renderScene = useCallback(() => {
    const app = appRef.current;
    const bg = bgGfx.current;
    const itemsGfx = itemGfx.current;
    const charsGfx = charGfx.current;
    const labels = labelContainer.current;
    if (!app || !bg || !itemsGfx || !charsGfx || !labels) return;

    const vp = viewportRef.current;
    const w = app.renderer.width / (window.devicePixelRatio || 1);
    const h = app.renderer.height / (window.devicePixelRatio || 1);
    const state = gameStore.getState();
    const ws = state.worldState;
    const modState = modAssetsStore.getState();
    const levelId = state.currentLevelId ?? '';

    const characters = ws ? Object.values(ws.characters) : [];
    const items = ws ? Object.values(ws.items) : [];
    const actorId = state.selectedActorId;
    const targetId = state.selectedTargetId;

    const bgPath = levelId ? modState.manifest?.backgrounds?.[levelId] : undefined;
    bgDebugRef.current.levelId = levelId;
    bgDebugRef.current.bgPath = bgPath ?? null;
    if (bgPath) {
      const sep = bgPath.includes('?') ? '&' : '?';
      const bgUrl = `${bgPath}${sep}rev=${modState.revision}`;
      void loadBackgroundImage(bgUrl);
    } else if (bgSpriteRef.current) {
      bgSpriteRef.current.visible = false;
    }

    const bgSprite = bgSpriteRef.current;
    if (bgSprite && bgPath) {
      if (Math.abs(bgSprite.width - w) > 0.01 || Math.abs(bgSprite.height - h) > 0.01) {
        fitBackgroundSprite(bgSprite, w, h);
      }
      bgSprite.visible = true;
    } else {
      bgImageUrlRef.current = bgPath ? bgImageUrlRef.current : '';
    }

    // ── Background + grid ──
    bg.clear();
    if (!bgSprite) {
      bg.rect(0, 0, w, h).fill({ color: COLORS.bg });
    } else {
      bg.rect(0, 0, w, h).fill({ color: COLORS.bg, alpha: 0.25 });
    }
    const gridSpacing = GRID_SIZE * vp.scale;
    if (gridSpacing > 15) {
      const offX = (vp.x + w / 2) % gridSpacing;
      const offY = (vp.y + h / 2) % gridSpacing;
      for (let x = offX; x < w; x += gridSpacing)
        bg.moveTo(x, 0).lineTo(x, h).stroke({ color: COLORS.grid, width: 1, alpha: 0.25 });
      for (let y = offY; y < h; y += gridSpacing)
        bg.moveTo(0, y).lineTo(w, y).stroke({ color: COLORS.grid, width: 1, alpha: 0.25 });
    }

    // ── Items ──
    itemsGfx.clear();
    for (const item of items) {
      const pos = worldToScreen(item.position.x, item.position.y, vp, w, h);
      itemsGfx.circle(pos.x, pos.y, ITEM_RADIUS).fill({ color: COLORS.item, alpha: 0.8 });
    }

    // ── Characters ──
    charsGfx.clear();
    for (const char of characters) {
      const pos = worldToScreen(char.position.x, char.position.y, vp, w, h);
      const isActor = char.id === actorId;
      const isTarget = char.id === targetId;
      const r = CHAR_RADIUS * Math.max(0.5, vp.scale);

      if (isActor || isTarget) {
        const ringColor = isActor ? COLORS.charActor : COLORS.charTarget;
        charsGfx.circle(pos.x, pos.y, r + 5).stroke({ color: ringColor, width: 3, alpha: 0.85 });
      }

      const bodyColor = isActor ? COLORS.charActor : isTarget ? COLORS.charTarget : COLORS.charDefault;
      charsGfx.circle(pos.x, pos.y, r).fill({ color: bodyColor, alpha: 0.9 });

      // Resource bars
      const resNodes = Object.values(char.mind_graph.nodes)
        .filter(n => n.prior_instinct?.is_resource)
        .slice(0, 3);
      resNodes.forEach((res, idx) => {
        const barW = r * 2;
        const barH = 4;
        const barX = pos.x - r;
        const barY = pos.y + r + 5 + idx * 7;
        const fillW = Math.max(0, Math.min(1, res.value)) * barW;
        charsGfx.rect(barX, barY, barW, barH).fill({ color: COLORS.resourceBg, alpha: 0.6 });
        if (fillW > 0) charsGfx.rect(barX, barY, fillW, barH).fill({ color: COLORS.resourceBar, alpha: 0.8 });
      });
    }

    // ── Labels ──
    // Re-draw only when count changes (simple optimization)
    const totalEntities = characters.length + items.length;
    if ((labels as any).__lastCount !== totalEntities || (labels as any).__lastScale !== vp.scale) {
      (labels as any).__lastCount = totalEntities;
      (labels as any).__lastScale = vp.scale;
      labels.removeChildren();

      const charStyle = new TextStyle({ fontSize: Math.max(10, 12 * vp.scale), fill: COLORS.text, fontFamily: 'sans-serif' });
      const itemStyle = new TextStyle({ fontSize: Math.max(8, 10 * vp.scale), fill: COLORS.item, fontFamily: 'sans-serif' });

      for (const char of characters) {
        const pos = worldToScreen(char.position.x, char.position.y, vp, w, h);
        const txt = new Text({ text: translateLabel(char.label), style: charStyle });
        txt.anchor.set(0.5, 1);
        txt.x = pos.x;
        txt.y = pos.y - CHAR_RADIUS * Math.max(0.5, vp.scale) - 2;
        labels.addChild(txt);
      }
      for (const item of items) {
        const pos = worldToScreen(item.position.x, item.position.y, vp, w, h);
        const txt = new Text({ text: translateLabel(item.label), style: itemStyle });
        txt.anchor.set(0.5, 1);
        txt.x = pos.x;
        txt.y = pos.y - ITEM_RADIUS - 2;
        labels.addChild(txt);
      }
    } else {
      // Update label positions
      let ci = 0;
      for (const char of characters) {
        const pos = worldToScreen(char.position.x, char.position.y, vp, w, h);
        const txt = labels.children[ci] as Text;
        if (txt) { txt.x = pos.x; txt.y = pos.y - CHAR_RADIUS * Math.max(0.5, vp.scale) - 2; }
        ci++;
      }
      for (const item of items) {
        const pos = worldToScreen(item.position.x, item.position.y, vp, w, h);
        const txt = labels.children[ci] as Text;
        if (txt) { txt.x = pos.x; txt.y = pos.y - ITEM_RADIUS - 2; }
        ci++;
      }
    }
  }, [fitBackgroundSprite, loadBackgroundImage, worldToScreen]);

  // ── Interaction setup ──
  const setupInteraction = useCallback((canvas: HTMLCanvasElement) => {
    let isDragging = false;
    let dragStartClient = { x: 0, y: 0 };
    let dragStartVp = { x: 0, y: 0 };

    const findEntity = (sx: number, sy: number) => {
      const app = appRef.current;
      if (!app) return null;
      const vp = viewportRef.current;
      const w = app.renderer.width / (window.devicePixelRatio || 1);
      const h = app.renderer.height / (window.devicePixelRatio || 1);
      const ws = gameStore.getState().worldState;
      if (!ws) return null;

      for (const char of Object.values(ws.characters)) {
        const pos = { x: char.position.x * vp.scale + vp.x + w / 2, y: char.position.y * vp.scale + vp.y + h / 2 };
        const r = CHAR_RADIUS * Math.max(0.5, vp.scale) + 5;
        if ((sx - pos.x) ** 2 + (sy - pos.y) ** 2 <= r * r) return { type: 'character', id: char.id };
      }
      for (const item of Object.values(ws.items)) {
        const pos = { x: item.position.x * vp.scale + vp.x + w / 2, y: item.position.y * vp.scale + vp.y + h / 2 };
        if ((sx - pos.x) ** 2 + (sy - pos.y) ** 2 <= (ITEM_RADIUS * 1.5) ** 2) return { type: 'item', id: item.id };
      }
      return null;
    };

    canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      dragStartClient = { x: e.clientX, y: e.clientY };
      dragStartVp = { x: viewportRef.current.x, y: viewportRef.current.y };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartClient.x;
      const dy = e.clientY - dragStartClient.y;
      viewportRef.current = { ...viewportRef.current, x: dragStartVp.x + dx, y: dragStartVp.y + dy };
    });

    canvas.addEventListener('pointerup', (e) => {
      const dragDist = Math.abs(e.clientX - dragStartClient.x) + Math.abs(e.clientY - dragStartClient.y);
      isDragging = false;
      canvas.releasePointerCapture(e.pointerId);

      if (dragDist < 5) {
        const rect = canvas.getBoundingClientRect();
        const entity = findEntity(e.clientX - rect.left, e.clientY - rect.top);
        if (entity?.type === 'character') {
          if (e.ctrlKey || e.metaKey) {
            gameStore.getState().selectActor(entity.id);
          } else if (e.shiftKey) {
            gameStore.getState().selectTarget(entity.id);
          } else {
            gameStore.getState().inspectCharacter(entity.id);
          }
        }
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      viewportRef.current = { ...viewportRef.current, scale: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewportRef.current.scale * factor)) };
    }, { passive: false });

    canvas.addEventListener('dblclick', () => {
      const app = appRef.current;
      if (!app) return;
      const ratio = window.devicePixelRatio || 1;
      fitWorldToViewport(app.renderer.width / ratio, app.renderer.height / ratio);
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const entity = findEntity(e.clientX - rect.left, e.clientY - rect.top);
      if (entity?.type === 'character') {
        window.dispatchEvent(new CustomEvent('scene-context-menu', {
          detail: { charId: entity.id, clientX: e.clientX, clientY: e.clientY },
        }));
      }
    });

    // Touch pinch zoom
    let lastPinchDist = 0;
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist > 0) {
          const ratio = dist / lastPinchDist;
          viewportRef.current = { ...viewportRef.current, scale: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewportRef.current.scale * ratio)) };
        }
        lastPinchDist = dist;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => { lastPinchDist = 0; });

    canvas.style.cursor = 'grab';
  }, [fitWorldToViewport]);

  return (
    <div
      ref={canvasRef}
      style={{ width, height, overflow: 'hidden', position: 'absolute', inset: 0, touchAction: 'none' }}
    />
  );
};
