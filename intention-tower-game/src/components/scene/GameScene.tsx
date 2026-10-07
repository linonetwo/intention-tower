/** Horizontal stage: backend positions are the only authority for character movement. */
import React, { useEffect, useRef, useState } from 'react';
import { gameStore, useGameState } from '../../store/useGameState';
import { useModAssets, resolveCharacterSprite } from '../../store/useModAssets';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { WorldCharacterSprite } from './WorldCharacterSprite';

export const GameScene: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const world = useGameState(s => s.worldState);
  const levelId = useGameState(s => s.currentLevelId);
  const actorId = useGameState(s => s.selectedActorId);
  const targetId = useGameState(s => s.selectedTargetId);
  const mode = useGameState(s => s.uiMode);
  const manifest = useModAssets(s => s.manifest);
  const revision = useModAssets(s => s.revision);
  const layout = useResponsiveLayout();
  const [pan, setPan] = useState(0);
  const [targetSelection, setTargetSelection] = useState(false);
  const [dialoguePixels, setDialoguePixels] = useState<number | null>(null);
  const [inspectedItem, setInspectedItem] = useState<string | null>(null);
  const drag = useRef<{ x: number; pan: number } | null>(null);
  const backgroundRef = useRef<HTMLImageElement>(null);
  const initialPair = useRef({ key: '', span: 0 });
  const characters = Object.values(world?.characters ?? {});
  const actor = actorId ? world?.characters[actorId] : undefined;
  const stageWidth = Math.max(1, width - layout.statusBarWidth);
  const stageHeight = Math.max(1, height - (dialoguePixels ?? height * layout.dialogueHeight / 100));
  // Leave separate rows for feet/nameplates and the 44px movement controls.
  const ground = stageHeight - 104;
  // Fit head-to-feet art between the compact top HUD and movement bar, even in landscape.
  const maxArtHeight = Math.max(54, Math.min(150, ground - (layout.isMobile ? 152 : 132) - 24));
  const scale = Math.min(layout.isMobile ? .85 : 1, maxArtHeight / 150);
  const target = targetId ? world?.characters[targetId] : undefined;
  const actorX = actor?.position.x ?? characters[0]?.position.x ?? 400;
  const pairKey = `${levelId}:${actorId}:${targetId}`;
  if (initialPair.current.key !== pairKey) initialPair.current = { key: pairKey, span: target ? Math.abs(actorX - target.position.x) : 0 };
  // Fit the authored initial pair without shrinking character artwork. Keep this world
  // scale stable while walking, then follow the actor once the pair separates too far.
  const worldScale = Math.min(scale, initialPair.current.span ? Math.max(.05, (stageWidth - 200) / initialPair.current.span) : scale);
  const pairFits = target && Math.abs(actorX - target.position.x) * worldScale <= Math.max(1, stageWidth - 200);
  const focusX = pairFits ? (actorX + target.position.x) / 2 : actorX;
  const cameraX = stageWidth / 2 - focusX * worldScale + pan;
  // Presentation-only collision resolution. Authoritative positions and movement
  // attributes remain unchanged; selected actor/target get the first readable slots.
  const displayPositions = new Map<string, { x: number; ground: number; halfWidth: number }>();
  const priority = (id: string) => id === actorId ? 0 : id === targetId ? 1 : 2;
  const orderedCharacters = [...characters].sort((a, b) => priority(a.id) - priority(b.id) || a.position.x - b.position.x || a.id.localeCompare(b.id));
  for (const character of orderedCharacters) {
    const asset = resolveCharacterSprite(manifest, character.id);
    const labelWidth = Math.min(148, Math.max(80, translateLabel(character.label).length * 13 + 24));
    const artWidth = (asset?.height ?? 150) * scale * (/\/(dog|cat|gosling|hive)\.png/.test(asset?.src ?? '') ? 1.2 : .6);
    const halfWidth = Math.max(labelWidth, artWidth) / 2;
    const naturalX = character.position.x * worldScale + cameraX;
    const naturalGround = ground + Math.max(-16, Math.min(12, (character.position.y - 300) * .12));
    const offsets = [0, -96, 96, -192, 192, -288, 288];
    let best = { x: naturalX, ground: naturalGround, halfWidth }, bestCost = Infinity;
    for (const offset of offsets) {
      // Offscreen entities remain offscreen; do not pile them onto a viewport edge.
      const x = naturalX + offset;
      const edgeCost = naturalX >= 0 && naturalX <= stageWidth ? Math.max(0, halfWidth + 8 - x, x + halfWidth + 8 - stageWidth) * 12 : 0;
      let cost = Math.abs(offset) * .08 + edgeCost;
      for (const other of displayPositions.values()) cost += Math.max(0, halfWidth + other.halfWidth + 12 - Math.abs(x - other.x)) * 4;
      if (cost < bestCost) { bestCost = cost; best = { x, ground: naturalGround, halfWidth }; }
    }
    displayPositions.set(character.id, best);
  }
  const sceneItems = Object.values(world?.items ?? {}).filter(item => !item.owner_id);
  const itemGroups = new Map<string, typeof sceneItems>();
  for (const item of [...sceneItems].sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id))) {
    const projectedX = item.position.x * worldScale + cameraX;
    // Edge items are grouped into one inspection control instead of clipped labels.
    const clampedX = Math.max(24, Math.min(stageWidth - 24, projectedX));
    const previousGroups = [...itemGroups.entries()];
    const previousGroup = previousGroups[previousGroups.length - 1];
    const previousX = previousGroup ? Math.max(24, Math.min(stageWidth - 24, previousGroup[1][0].position.x * worldScale + cameraX)) : -Infinity;
    const key = previousGroup && clampedX - previousX < 48 ? previousGroup[0] : item.id;
    itemGroups.set(key, [...(itemGroups.get(key) ?? []), item]);
  }
  const background = levelId ? manifest?.backgrounds?.[levelId] : undefined;
  useEffect(() => { setPan(0); setTargetSelection(false); setInspectedItem(null); }, [levelId, actorId]);
  useEffect(() => {
    const dialogue = document.querySelector<HTMLElement>('[data-testid="dialogue-hud"]');
    if (!dialogue) return;
    const measure = () => setDialoguePixels(dialogue.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(dialogue);
    return () => observer.disconnect();
  }, [levelId, height]);
  useEffect(() => {
    const host = window as Window & { __itBgDebug?: () => unknown; __itSceneDebug?: () => unknown };
    host.__itBgDebug = () => {
      const tw = backgroundRef.current?.naturalWidth ?? 0;
      const th = backgroundRef.current?.naturalHeight ?? 0;
      const ratio = tw && th ? Math.max(stageWidth / tw, stageHeight / th) : 1;
      return { levelId, bgPath: background ?? null, texture: { width: tw, height: th }, viewport: { width: stageWidth, height: stageHeight }, fitted: { x: (stageWidth - tw * ratio) / 2, y: (stageHeight - th * ratio) / 2, width: tw * ratio, height: th * ratio } };
    };
    host.__itSceneDebug = () => ({ cameraX, scale: worldScale, artScale: scale, ground, actorId, characters: characters.map(c => ({ id: c.id, position: { ...c.position }, sprite: resolveCharacterSprite(manifest, c.id)?.src ?? null })) });
    return () => { delete host.__itBgDebug; delete host.__itSceneDebug; };
  }, [background, levelId, stageWidth, stageHeight, cameraX, scale, worldScale, ground, actorId, characters, manifest]);
  const move = (dx: number) => { gameStore.getState().setUiMode('micro'); void gameStore.getState().moveSelectedActor(dx, 0); };
  return <div data-testid="scene-canvas" style={{ width, height, position: 'absolute', overflow: 'hidden', background: '#131925' }}>
    <style>{`@keyframes it-world-walk {0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-4px) rotate(1deg)}} .it-crowded-character > button > span:last-child{opacity:0}.it-crowded-character > button:hover > span:last-child,.it-crowded-character > button:focus-visible > span:last-child{opacity:1} @media(prefers-reduced-motion:reduce){.it-world-art{animation:none!important;transition:none!important}}`}</style>
    <div data-testid="scene-viewport" style={{ position: 'absolute', left: layout.statusBarWidth, top: 0, width: stageWidth, height: stageHeight, overflow: 'hidden', touchAction: 'none' }}
      onPointerDown={e => { if (e.target !== e.currentTarget) return; drag.current = { x: e.clientX, pan }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) setPan(drag.current.pan + e.clientX - drag.current.x); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {background && <img ref={backgroundRef} data-testid="scene-background" src={`${background}${background.includes('?') ? '&' : '?'}rev=${revision}`} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', pointerEvents: 'none' }} />}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(9,14,25,.3),transparent 48%,rgba(8,12,20,.55))' }} />
      <div data-testid="scene-ground" style={{ position: 'absolute', top: ground, left: 0, right: 0, height: 104, pointerEvents: 'none', borderTop: '1px solid #d8d0b04d', background: 'linear-gradient(#2b292533,#101921b3)' }} />
      <div data-testid="scene-world" data-camera-x={cameraX} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {[...itemGroups].map(([bucket, items]) => {
          const itemX = Math.max(24, Math.min(stageWidth - 24, items[0].position.x * worldScale + cameraX));
          return <button key={bucket} data-testid={`scene-item-${items[0].id}`} aria-label={items.map(item => translateLabel(item.label)).join('、')} title={items.map(item => translateLabel(item.label)).join('、')}
            onClick={() => setInspectedItem(inspectedItem === bucket ? null : bucket)} style={{ position: 'absolute', left: itemX, top: ground - 38, transform: 'translate(-50%,-100%)', width: 36, height: 36, borderRadius: 12, border: '1px solid #f3d89388', background: '#17202bd9', color: '#ffe6a2', pointerEvents: 'auto', cursor: 'pointer', zIndex: 500 }}>
            ◆{items.length > 1 ? items.length : ''}
            {inspectedItem === bucket && <span style={{ position: 'absolute', bottom: 42, left: itemX < stageWidth / 2 ? 0 : 'auto', right: itemX >= stageWidth / 2 ? 0 : 'auto', width: 150, maxHeight: 130, overflowY: 'auto', borderRadius: 8, border: '1px solid #f3d89388', padding: 8, boxSizing: 'border-box', background: '#101a29f5', textAlign: 'left', fontSize: 12 }}>{items.map(item => <span key={item.id} data-testid={`scene-item-detail-${item.id}`} style={{ display: 'block', padding: '4px 0' }}>{translateLabel(item.label)}</span>)}</span>}
          </button>;
        })}
        {characters.map(character => <div key={`${levelId}:${character.id}`} className={characters.length > Math.floor(stageWidth / 100) && character.id !== actorId && character.id !== targetId ? 'it-crowded-character' : undefined} style={{ display: 'contents' }}><WorldCharacterSprite character={character} asset={resolveCharacterSprite(manifest, character.id)} revision={revision}
          x={displayPositions.get(character.id)!.x} ground={displayPositions.get(character.id)!.ground} scale={scale} selected={character.id === actorId} targeted={character.id === targetId}
          onSelect={e => { const state = gameStore.getState(); if (e.shiftKey || targetSelection) state.selectTarget(character.id); else state.selectActor(character.id); state.inspectCharacter(character.id); setTargetSelection(false); }} /></div>)}
      </div>
      {mode !== 'graph' && <div data-testid="scene-selected-info" style={{ position: 'absolute', bottom: 6, left: 12, right: 12, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button data-testid="scene-move-left" aria-label="向左移动" disabled={!actor || world?.progress.status !== 'InProgress'} onClick={() => move(-28)} style={controlStyle}>◀</button>
        <button onClick={() => { setPan(0); setTargetSelection(false); }} style={controlStyle}>{actor ? translateLabel(actor.label) : '选择角色'}</button>
        <button aria-pressed={targetSelection} onClick={() => setTargetSelection(!targetSelection)} style={{ ...controlStyle, color: targetSelection ? '#ffd281' : '#eee' }}>{targetSelection ? '点击角色选择目标' : '选择目标'}</button>
        <button data-testid="scene-move-right" aria-label="向右移动" disabled={!actor || world?.progress.status !== 'InProgress'} onClick={() => move(28)} style={controlStyle}>▶</button>
      </div>}
    </div>
  </div>;
};
const controlStyle: React.CSSProperties = { minHeight: 44, minWidth: 44, padding: '6px 12px', borderRadius: 18, border: '1px solid #ffffff38', background: '#101a29db', color: '#eee', cursor: 'pointer', fontSize: 12 };
