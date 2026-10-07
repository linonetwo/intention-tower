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
  const drag = useRef<{ x: number; pan: number } | null>(null);
  const backgroundRef = useRef<HTMLImageElement>(null);
  const initialPair = useRef({ key: '', span: 0 });
  const characters = Object.values(world?.characters ?? {});
  const actor = actorId ? world?.characters[actorId] : undefined;
  const stageWidth = Math.max(1, width - layout.statusBarWidth);
  const stageHeight = Math.max(1, height - (dialoguePixels ?? height * layout.dialogueHeight / 100));
  const ground = stageHeight - 80;
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
  const background = levelId ? manifest?.backgrounds?.[levelId] : undefined;
  useEffect(() => { setPan(0); setTargetSelection(false); }, [levelId, actorId]);
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
    <style>{`@keyframes it-world-walk {0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-4px) rotate(1deg)}} @media(prefers-reduced-motion:reduce){.it-world-art{animation:none!important;transition:none!important}}`}</style>
    <div data-testid="scene-viewport" style={{ position: 'absolute', left: layout.statusBarWidth, top: 0, width: stageWidth, height: stageHeight, overflow: 'hidden', touchAction: 'none' }}
      onPointerDown={e => { if (e.target !== e.currentTarget) return; drag.current = { x: e.clientX, pan }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) setPan(drag.current.pan + e.clientX - drag.current.x); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {background && <img ref={backgroundRef} data-testid="scene-background" src={`${background}${background.includes('?') ? '&' : '?'}rev=${revision}`} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', pointerEvents: 'none' }} />}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(9,14,25,.3),transparent 48%,rgba(8,12,20,.55))' }} />
      <div data-testid="scene-ground" style={{ position: 'absolute', top: ground, left: 0, right: 0, height: 80, pointerEvents: 'none', borderTop: '1px solid #d8d0b04d', background: 'linear-gradient(#2b292533,#101921b3)' }} />
      <div data-testid="scene-world" data-camera-x={cameraX} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Object.values(world?.items ?? {}).filter(item => !item.owner_id).map(item => <div key={item.id} data-testid={`scene-item-${item.id}`} style={{ position: 'absolute', left: item.position.x * worldScale + cameraX, top: ground + (item.position.y - 300) * .12, transform: 'translate(-50%,-100%)', color: '#ffe6a2', fontSize: 12, textShadow: '0 2px 3px #000' }}>◆ {translateLabel(item.label)}</div>)}
        {characters.map(character => <WorldCharacterSprite key={`${levelId}:${character.id}`} character={character} asset={resolveCharacterSprite(manifest, character.id)} revision={revision}
          x={character.position.x * worldScale + cameraX} ground={ground + Math.max(-16, Math.min(12, (character.position.y - 300) * .12))} scale={scale} selected={character.id === actorId} targeted={character.id === targetId}
          onSelect={e => { const state = gameStore.getState(); if (e.shiftKey || targetSelection) state.selectTarget(character.id); else state.selectActor(character.id); state.inspectCharacter(character.id); setTargetSelection(false); }} />)}
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
