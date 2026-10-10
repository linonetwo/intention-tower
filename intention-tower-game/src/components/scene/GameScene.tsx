/** Backend positions and platform heights are the only scene authority. */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameStore, useGameState } from '../../store/useGameState';
import { useModAssets, resolveCharacterSprite } from '../../store/useModAssets';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { WorldCharacterSprite } from './WorldCharacterSprite';
import { characterArtScale, clampCameraX, connectorReachable, pointerWorldX, projectPlatformY, sceneCameraGeometry } from './sceneGeometry';

export const GameScene: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const { t } = useTranslation();
  const world = useGameState(s => s.worldState);
  const levelId = useGameState(s => s.currentLevelId);
  const actorId = useGameState(s => s.selectedActorId);
  const targetId = useGameState(s => s.selectedTargetId);
  const manifest = useModAssets(s => s.manifest);
  const revision = useModAssets(s => s.revision);
  const layout = useResponsiveLayout();
  const [targetSelection, setTargetSelection] = useState(false);
  const [dialoguePixels, setDialoguePixels] = useState<number | null>(null);
  const [inspectedItem, setInspectedItem] = useState<string | null>(null);
  const [itemsVisible, setItemsVisible] = useState(false);
  const walkRun = useRef(0);
  const actor = actorId ? world?.characters[actorId] : undefined;
  const characters = Object.values(world?.characters ?? {});
  const stageHeight = Math.max(1, height - (dialoguePixels ?? height * layout.dialogueHeight / 100));
  // Reserve a second tool row on tiny screens so wrapping never covers the floor.
  const toolHeight = width < 372 ? 107 : 58;
  const ground = stageHeight - toolHeight;
  // Narrow screens show a slice of the world rather than compressing the cast
  // into an overview. The camera follows the selected actor while walking.
  const worldMin = Math.min(0, ...(world?.scene?.platforms.map(p => p.x_min) ?? [0]));
  const worldMax = Math.max(800, ...(world?.scene?.platforms.map(p => p.x_max) ?? [800]));
  const background = levelId ? manifest?.backgrounds?.[levelId] : undefined;
  const { worldScale, backgroundScale, backgroundTop, metadata } = sceneCameraGeometry(width, ground, worldMax - worldMin,
    levelId ? manifest?.backgroundsMetadata?.[levelId] : undefined);
  const maxAssetHeight = Math.max(1, ...characters.map(character => resolveCharacterSprite(manifest, character.id)?.height ?? 150));
  const scale = characterArtScale(worldScale, ground, maxAssetHeight);
  const cameraX = clampCameraX(width, actor?.position.x ?? 400, worldScale, worldMin, worldMax);
  const projectionKey = `${worldScale}:${cameraX}:${ground}:${scale}`;
  const projectY = (y: number) => projectPlatformY(y, ground, worldScale);
  const items = Object.values(world?.items ?? {}).filter(item => !item.owner_id);
  const itemGroups: typeof items[] = [];
  for (const item of [...items].sort((a, b) => a.position.x - b.position.x)) {
    const last = itemGroups[itemGroups.length - 1];
    if (last && Math.abs(item.position.x - last[0].position.x) * worldScale < 48 && item.position.y === last[0].position.y) last.push(item);
    else itemGroups.push([item]);
  }
  const posture = actorId ? world?.character_postures?.[actorId] ?? 'standing' : 'standing';
  const enabled = !!actor && world?.progress.status === 'InProgress';
  const connectors = world?.scene?.connectors ?? [];
  const nearbyConnector = connectors.find(c => {
    if (!actor) return false;
    return connectorReachable(actor.position, c, world?.scene?.platforms ?? []);
  });
  useEffect(() => { walkRun.current++; setTargetSelection(false); setInspectedItem(null); }, [levelId, actorId]);
  useEffect(() => { setItemsVisible(false); setInspectedItem(null); }, [levelId]);
  useEffect(() => () => { walkRun.current++; }, []);
  useEffect(() => {
    const dialogue = document.querySelector<HTMLElement>('[data-testid="dialogue-hud"]');
    if (!dialogue) return;
    const measure = () => setDialoguePixels(dialogue.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(dialogue);
    return () => observer.disconnect();
  }, [levelId, height]);
  const move = async (dx: number) => {
    gameStore.getState().setUiMode('micro');
    await gameStore.getState().moveSelectedActor(dx, 0);
  };
  const walkTo = async (x: number) => {
    const run = ++walkRun.current;
    const id = gameStore.getState().selectedActorId;
    while (run === walkRun.current && id) {
      const state = gameStore.getState();
      const current = state.worldState?.characters[id];
      if (!current || state.selectedActorId !== id || state.worldState?.progress.status !== 'InProgress') break;
      const dx = x - current.position.x;
      if (Math.abs(dx) < 1) break;
      await move(Math.max(-18, Math.min(18, dx)));
      const next = gameStore.getState().worldState?.characters[id];
      if (!next || next.position.x === current.position.x) break;
      await new Promise(resolve => window.setTimeout(resolve, 65));
    }
  };
  useEffect(() => {
    const cancel = () => { walkRun.current++; };
    window.addEventListener('scene-cancel-walk', cancel);
    return () => window.removeEventListener('scene-cancel-walk', cancel);
  }, []);
  useEffect(() => {
    const host = window as Window & { __itSceneDebug?: () => unknown; __itBgDebug?: () => unknown };
    host.__itSceneDebug = () => ({ cameraX, scale: worldScale, artScale: scale, ground, actorId, platforms: world?.scene?.platforms, characters: characters.map(c => ({ id: c.id, position: c.position, sprite: resolveCharacterSprite(manifest, c.id)?.src ?? null })) });
    host.__itBgDebug = () => ({ levelId, bgPath: background, viewport: { width, height: stageHeight }, floorY: ground, metadata });
    return () => { delete host.__itSceneDebug; delete host.__itBgDebug; };
  }, [world, manifest, cameraX, scale, worldScale, ground, actorId, background, metadata, width, stageHeight, levelId]);
  return <div data-testid="scene-canvas" style={{ width, height, position: 'absolute', overflow: 'hidden', background: '#fff1d9' }}>
    <div data-testid="scene-viewport" style={{ position: 'absolute', inset: '0 0 auto', height: stageHeight, overflow: 'hidden', touchAction: 'pan-y', background: 'linear-gradient(#e7eee0,#fff0d1)' }} onClick={event => {
      if (event.target !== event.currentTarget || !enabled) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      void walkTo(pointerWorldX(event.clientX, bounds.left, cameraX, worldScale));
    }}>
      {background && <img data-testid="scene-background" src={`${background}?rev=${revision}`} alt="" draggable={false} style={metadata ? { position: 'absolute', left: cameraX, top: backgroundTop, width: metadata.width * backgroundScale, height: metadata.height * backgroundScale, pointerEvents: 'none' } : { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom', pointerEvents: 'none' }} />}
      <div data-testid="scene-ground" data-ground-y={ground} style={{ position: 'absolute', top: ground, left: 0, right: 0, height: toolHeight, background: '#e9cf8d44', borderTop: '2px solid #bda06b66', pointerEvents: 'none' }} />
      <div data-testid="scene-world" data-camera-x={cameraX} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {(world?.scene?.platforms ?? []).map(p => <div key={p.id} data-testid={`scene-platform-${p.id}`} data-world-y={p.y} style={{ position: 'absolute', left: p.x_min * worldScale + cameraX, top: projectY(p.y), width: (p.x_max - p.x_min) * worldScale, height: p.y === 300 ? 0 : 12 * worldScale, borderRadius: 2, background: 'repeating-linear-gradient(90deg,#bd8d58 0 32px,#987044 32px 34px)', boxShadow: p.y === 300 ? undefined : '0 4px 0 #704f34', pointerEvents: 'none' }} />)}
        {connectors.map(c => {
          const from = world?.scene?.platforms.find(p => p.id === c.from_platform);
          const to = world?.scene?.platforms.find(p => p.id === c.to_platform);
          if (!from || !to) return null;
          const steps = Math.max(1, Math.round(Math.abs(to.y - from.y) / 15));
          return <div key={c.id} data-testid={`scene-connector-${c.id}`} style={{ display: 'contents' }}>{Array.from({ length: steps }, (_, i) => {
            const ratio = i / steps;
            const next = (i + 1) / steps;
            const x = c.from_x + (c.to_x - c.from_x) * ratio;
            const y = from.y + (to.y - from.y) * next;
            return <div key={i} style={{ position: 'absolute', left: x * worldScale + cameraX, top: projectY(y), width: Math.max(14, Math.abs(c.to_x - c.from_x) / steps + 3) * worldScale, height: (Math.abs(to.y - from.y) / steps + 2) * worldScale, background: '#ad7b4c', borderTop: '3px solid #e2bd7a', borderRight: '2px solid #765232', pointerEvents: 'none' }} />;
          })}</div>;
        })}
        {characters.map(character => <WorldCharacterSprite key={`${levelId}:${character.id}`} character={character} asset={resolveCharacterSprite(manifest, character.id)} revision={revision} posture={world?.character_postures?.[character.id] ?? 'standing'}
          x={character.position.x * worldScale + cameraX} ground={projectY(character.position.y)} scale={scale} projectionKey={projectionKey} selected={character.id === actorId} targeted={character.id === targetId}
          onSelect={e => { walkRun.current++; const state = gameStore.getState(); if (e.shiftKey || targetSelection) state.selectTarget(character.id); else state.selectActor(character.id); state.inspectCharacter(character.id); setTargetSelection(false); }} />)}
        {itemsVisible && itemGroups.map(group => {
          const item = group[0];
          const itemX = Math.max(24, Math.min(width - 24, item.position.x * worldScale + cameraX));
          const expanded = inspectedItem === item.id;
          return <button key={item.id} data-testid={`scene-item-${item.id}`} aria-label={group.map(entry => translateLabel(entry.label)).join(', ')} aria-expanded={expanded} onClick={() => setInspectedItem(expanded ? null : item.id)} style={{ ...controlStyle, position: 'absolute', left: itemX, top: projectY(item.position.y) - 38, transform: 'translate(-50%,-100%)', pointerEvents: 'auto', zIndex: 500 }}>◆{group.length > 1 ? group.length : ''}
            {expanded && <span style={{ position: 'absolute', bottom: 48, left: itemX < width / 2 ? 0 : 'auto', right: itemX >= width / 2 ? 0 : 'auto', width: 160, maxHeight: 130, overflow: 'auto', boxSizing: 'border-box', padding: 8, border: '1px solid #b79861', borderRadius: 10, background: '#fff7dc', textAlign: 'left', fontSize: 12 }}>{group.map(entry => <span key={entry.id} data-testid={`scene-item-detail-${entry.id}`} style={{ display: 'block', padding: '4px 0' }}>{translateLabel(entry.label)}</span>)}</span>}
          </button>;
        })}
      </div>
      <div data-testid="scene-selected-info" style={{ position: 'absolute', bottom: 5, left: 8, right: 8, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 5 }}>
        <button data-testid="scene-move-left" aria-label={t('scene.moveLeft')} disabled={!enabled} onClick={() => { walkRun.current++; void move(-28); }} style={controlStyle}>◀</button>
        <button data-testid="scene-select-target" aria-label={t('scene.selectTarget')} aria-pressed={targetSelection} onClick={() => setTargetSelection(!targetSelection)} style={controlStyle}>◎</button>
        <button data-testid="scene-posture" aria-label={t(posture === 'sitting' ? 'scene.stand' : 'scene.sit')} disabled={!enabled || (posture !== 'sitting' && !resolveCharacterSprite(manifest, actorId ?? '')?.sittingSrc)} onClick={() => { walkRun.current++; void gameStore.getState().setSelectedPosture(posture === 'sitting' ? 'standing' : 'sitting'); }} style={controlStyle}>{posture === 'sitting' ? '↟' : '▱'}</button>
        {connectors.length > 0 && <button data-testid="scene-traverse" aria-label={t('scene.traverse')} disabled={!enabled || !nearbyConnector} onClick={() => { walkRun.current++; if (nearbyConnector) void gameStore.getState().traverseSelectedConnector(nearbyConnector.id); }} style={controlStyle}>⇅</button>}
        <button data-testid="scene-move-right" aria-label={t('scene.moveRight')} disabled={!enabled} onClick={() => { walkRun.current++; void move(28); }} style={controlStyle}>▶</button>
        <button data-testid="scene-toggle-items" aria-label={t(itemsVisible ? 'scene.hideItems' : 'scene.showItems')} aria-pressed={itemsVisible} onClick={() => { setItemsVisible(!itemsVisible); setInspectedItem(null); }} style={{ ...controlStyle, width: 110, boxSizing: 'border-box', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(itemsVisible ? 'scene.hideItems' : 'scene.showItems')}</button>
      </div>
    </div>
  </div>;
};
const controlStyle: React.CSSProperties = { minHeight: 44, minWidth: 44, padding: '5px 10px', borderRadius: 16, border: '1px solid #b79861', background: '#fff7dce8', color: '#755731', cursor: 'pointer', fontSize: 16 };
