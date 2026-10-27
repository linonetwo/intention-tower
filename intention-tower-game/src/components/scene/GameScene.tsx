/** Backend positions and platform heights are the only scene authority. */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameStore, useGameState } from '../../store/useGameState';
import { useModAssets, resolveCharacterSprite, canCharacterSit } from '../../store/useModAssets';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { WorldCharacterSprite } from './WorldCharacterSprite';
import { RoomMemoryNotes } from './RoomMemoryNotes';
import { roomMemoryPresentation } from './roomMemory';
import { activeSceneRoom, connectedSceneRooms, entityInRoom, characterArtScale, clampCameraX, connectorReachable, pointerWorldX, projectPlatformY, sceneCameraGeometry } from './sceneGeometry';

export const GameScene: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const { t } = useTranslation();
  const world = useGameState(s => s.worldState);
  const levelId = useGameState(s => s.currentLevelId);
  const actorId = useGameState(s => s.selectedActorId);
  const targetId = useGameState(s => s.selectedTargetId);
  const manifest = useModAssets(s => s.manifest);
  const revision = useModAssets(s => s.revision);
  const selectedOutfits = useModAssets(s => s.selectedOutfits);
  const setCharacterOutfit = useModAssets(s => s.setCharacterOutfit);
  const layout = useResponsiveLayout();
  const [targetSelection, setTargetSelection] = useState(false);
  const [dialoguePixels, setDialoguePixels] = useState<number | null>(null);
  const [inspectedItem, setInspectedItem] = useState<string | null>(null);
  const [itemsVisible, setItemsVisible] = useState(false);
  const [wardrobeVisible, setWardrobeVisible] = useState(false);
  const [notesVisible, setNotesVisible] = useState(false);
  const walkRun = useRef(0);
  const lastActorPosition = useRef<{ id: string | null; x: number; y: number } | null>(null);
  const actor = actorId ? world?.characters[actorId] : undefined;
  const room = activeSceneRoom(world, actorId);
  const stripRooms = connectedSceneRooms(world?.scene, room);
  const hasRoomMemory = !!world?.scene?.room_memory;
  const presentationFor = (id: string | undefined) => {
    const r = world?.scene?.rooms?.find(candidate => candidate.id === id);
    return r ? roomMemoryPresentation(world, r) : undefined;
  };
  const fallbackRoom = world?.scene?.rooms?.[0]?.id;
  const inStrip = (occupancy: Record<string, string> | undefined, id: string) => !room || stripRooms.some(r => entityInRoom(r.id, occupancy, id, fallbackRoom));
  const characters = Object.values(world?.characters ?? {}).filter(c => inStrip(world?.character_rooms, c.id) && !presentationFor(world?.character_rooms?.[c.id] ?? fallbackRoom)?.hidden);
  const platforms = (world?.scene?.platforms ?? []).filter(p => !room || stripRooms.some(r => r.platform_ids.includes(p.id)));
  const platformPresentation = (id: string) => presentationFor(world?.scene?.rooms?.find(r => r.platform_ids.includes(id))?.id);
  const actorAsset = resolveCharacterSprite(manifest, actorId ?? '', selectedOutfits[actorId ?? '']);
  const stageHeight = Math.max(1, height - (dialoguePixels ?? height * layout.dialogueHeight / 100));
  // Reserve a second tool row on tiny screens so wrapping never covers the floor.
  const baseToolHeight = width < (hasRoomMemory ? 500 : actorAsset?.paperDoll ? 440 : 372) ? 107 : 58;
  // An open notebook reserves its own space below the floor rather than covering the cast.
  const notesHeight = notesVisible && hasRoomMemory ? Math.max(88, Math.min(230, stageHeight - baseToolHeight - 160)) : 0;
  const toolHeight = baseToolHeight + notesHeight;
  const ground = stageHeight - toolHeight;
  // Narrow screens show a slice of the world rather than compressing the cast
  // into an overview. The camera follows the selected actor while walking.
  const worldMin = room ? Math.min(...stripRooms.map(r => r.x_min)) : Math.min(0, ...platforms.map(p => p.x_min));
  const worldMax = room ? Math.max(...stripRooms.map(r => r.x_max)) : Math.max(800, ...platforms.map(p => p.x_max));
  const activeView = room ? roomMemoryPresentation(world, room) : undefined;
  const backgroundKey = activeView?.hidden ? undefined : activeView?.backgroundKey ?? levelId;
  const background = backgroundKey ? manifest?.backgrounds?.[backgroundKey] : undefined;
  const { backgroundScale, backgroundTop, metadata, worldScale: legacyScale } = sceneCameraGeometry(width, ground, room ? room.x_max - room.x_min : worldMax - worldMin,
    backgroundKey ? manifest?.backgroundsMetadata?.[backgroundKey] : undefined);
  // One projection for the whole strip: changing occupancy cannot change zoom at the seam.
  const worldScale = stripRooms.length ? Math.max(...stripRooms.map(r => sceneCameraGeometry(width, ground, r.x_max - r.x_min, manifest?.backgroundsMetadata?.[r.background_key ?? levelId ?? '']).worldScale)) : legacyScale;
  const scale = characterArtScale(worldScale, ground, 150);
  const cameraX = clampCameraX(width, actor?.position.x ?? 400, worldScale, worldMin, worldMax);
  const projectionKey = `${worldScale}:${cameraX}:${ground}:${scale}`;
  const projectY = (y: number) => projectPlatformY(y, ground, worldScale);
  const items = Object.values(world?.items ?? {}).filter(item => !item.owner_id && inStrip(world?.item_rooms, item.id) && !presentationFor(world?.item_rooms?.[item.id] ?? fallbackRoom)?.hidden);
  const itemGroups: typeof items[] = [];
  for (const item of [...items].sort((a, b) => a.position.x - b.position.x)) {
    const last = itemGroups[itemGroups.length - 1];
    if (last && Math.abs(item.position.x - last[0].position.x) * worldScale < 48 && item.position.y === last[0].position.y) last.push(item);
    else itemGroups.push([item]);
  }
  const posture = actorId ? world?.character_postures?.[actorId] ?? 'standing' : 'standing';
  const enabled = !!actor && world?.progress.status === 'InProgress';
  const connectors = (world?.scene?.connectors ?? []).filter(c => platforms.some(p => p.id === c.from_platform) && platforms.some(p => p.id === c.to_platform));
  const nearbyConnector = connectors.find(c => {
    if (!actor) return false;
    return connectorReachable(actor.position, c, world?.scene?.platforms ?? []);
  });
  useEffect(() => { walkRun.current++; setTargetSelection(false); setInspectedItem(null); setWardrobeVisible(false); }, [levelId, actorId]);
  useEffect(() => { setItemsVisible(false); setInspectedItem(null); }, [levelId]);
  useEffect(() => { setNotesVisible(false); }, [levelId]);
  useEffect(() => { setWardrobeVisible(false); }, [room?.id]);
  useEffect(() => {
    const previous = lastActorPosition.current;
    if (actor && previous?.id === actorId && (Math.abs(actor.position.x - previous.x) > 40 || actor.position.y !== previous.y)) walkRun.current++;
    lastActorPosition.current = actor ? { id: actorId, ...actor.position } : null;
  }, [actorId, actor?.position.x, actor?.position.y]);
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
      if (!next || next.position.x === current.position.x || Math.abs(next.position.x - current.position.x) > 20 || next.position.y !== current.position.y) break;
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
      {stripRooms.length ? stripRooms.map(r => {
        const view = roomMemoryPresentation(world, r);
        if (view.hidden) return <div key={r.id} data-testid={`scene-memory-fog-${r.id}`} data-memory-phase={view.phase} style={{ position: 'absolute', left: r.x_min * worldScale + cameraX, top: 0, width: (r.x_max - r.x_min) * worldScale, height: ground, pointerEvents: 'none', background: 'radial-gradient(ellipse at 45% 55%,#fff7e4 0%,#f3e6c9 65%,#dfcca5 100%)' }} />;
        const key = view.backgroundKey ?? levelId ?? '';
        const src = manifest?.backgrounds?.[key];
        if (!src) return null;
        const meta = sceneCameraGeometry(width, ground, r.x_max - r.x_min, manifest?.backgroundsMetadata?.[key]).metadata;
        const artScale = meta ? worldScale * (r.x_max - r.x_min) / meta.width : 1;
        return <img key={r.id} data-testid={r.id === room?.id ? 'scene-background' : `scene-background-room-${r.id}`} data-room-id={r.id} data-memory-phase={view.phase} src={`${src}?rev=${revision}`} alt="" draggable={false} style={{ position: 'absolute', left: r.x_min * worldScale + cameraX, top: meta ? ground - meta.floorY * artScale : 0, width: (r.x_max - r.x_min) * worldScale, height: meta ? meta.height * artScale : stageHeight, filter: view.filter, opacity: view.opacity, objectFit: 'cover', objectPosition: 'center bottom', pointerEvents: 'none' }} />;
      }) : background && <img data-testid="scene-background" src={`${background}?rev=${revision}`} alt="" draggable={false} style={metadata ? { position: 'absolute', left: worldMin * worldScale + cameraX, top: backgroundTop, width: metadata.width * backgroundScale, height: metadata.height * backgroundScale, pointerEvents: 'none' } : { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom', pointerEvents: 'none' }} />}
      {room && <div data-testid="scene-room-title" style={{ position: 'absolute', left: 72, bottom: toolHeight + 8, maxWidth: Math.max(0, width - 144), padding: '5px 12px', borderRadius: 12, background: '#fff7dcd9', color: '#755731', fontSize: 13, pointerEvents: 'none' }}>{activeView?.labelKey ? t(activeView.labelKey, { defaultValue: translateLabel(room.label) }) : translateLabel(room.label)}</div>}
      <div data-testid="scene-ground" data-ground-y={ground} style={{ position: 'absolute', top: ground, left: 0, right: 0, height: toolHeight, background: '#e9cf8d44', borderTop: '2px solid #bda06b66', pointerEvents: 'none' }} />
      <div data-testid="scene-world" data-camera-x={cameraX} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {platforms.map(p => <div key={p.id} data-testid={`scene-platform-${p.id}`} data-world-y={p.y} style={{ position: 'absolute', left: p.x_min * worldScale + cameraX, top: projectY(p.y), width: (p.x_max - p.x_min) * worldScale, height: p.y === 300 ? 0 : 12 * worldScale, borderRadius: 2, opacity: platformPresentation(p.id)?.hidden ? 0 : platformPresentation(p.id)?.opacity, filter: platformPresentation(p.id)?.filter, background: 'repeating-linear-gradient(90deg,#bd8d58 0 32px,#987044 32px 34px)', boxShadow: p.y === 300 ? undefined : '0 4px 0 #704f34', pointerEvents: 'none' }} />)}
        {(world?.scene?.portals ?? []).filter(p => p.from_room === room?.id || p.to_room === room?.id).map(portal => {
          const destination = world?.scene?.rooms?.find(r => r.id === (portal.from_room === room?.id ? portal.to_room : portal.from_room));
          const direction = destination && destination.x_min >= (room?.x_max ?? worldMax) ? 1 : -1;
          const destinationView = destination ? roomMemoryPresentation(world, destination) : undefined;
          const destinationLabel = destinationView?.hidden ? t('memory.unknownExit') : destinationView?.labelKey ? t(destinationView.labelKey, { defaultValue: translateLabel(destination?.label ?? '') }) : translateLabel(destination?.label ?? '');
          return <button key={portal.id} data-testid={`scene-portal-${portal.id}`} disabled={!enabled} aria-label={t('scene.enterRoom', { room: destinationLabel })} onClick={() => { void walkTo(portal.x + direction * 28); }} style={{ ...controlStyle, position: 'absolute', zIndex: 700, left: Math.max(22, Math.min(width - 22, portal.x * worldScale + cameraX)), top: ground - 56, transform: 'translateX(-50%)', pointerEvents: 'auto', background: '#fff7dccc' }}>{direction > 0 ? '›' : '‹'}</button>;
        })}
        {connectors.map(c => {
          if (platformPresentation(c.from_platform)?.hidden || platformPresentation(c.to_platform)?.hidden) return null;
          const from = world?.scene?.platforms.find(p => p.id === c.from_platform);
          const to = world?.scene?.platforms.find(p => p.id === c.to_platform);
          if (!from || !to) return null;
          if (c.kind === 'ladder') {
            const left = Math.min(c.from_x, c.to_x) - 16;
            const top = Math.min(from.y, to.y);
            const ladderWidth = Math.abs(c.to_x - c.from_x) + 32;
            const ladderHeight = Math.max(1, Math.abs(to.y - from.y));
            const x1 = c.from_x - left;
            const x2 = c.to_x - left;
            const y1 = from.y - top;
            const y2 = to.y - top;
            const rungCount = Math.max(1, Math.floor(ladderHeight / 18));
            return <svg key={c.id} data-testid={`scene-connector-${c.id}`} data-connector-kind="ladder" aria-hidden="true" viewBox={`0 0 ${ladderWidth} ${ladderHeight}`} style={{ position: 'absolute', left: left * worldScale + cameraX, top: projectY(top), width: ladderWidth * worldScale, height: ladderHeight * worldScale, overflow: 'visible', pointerEvents: 'none' }}>
              {[-11, 11].map(offset => <g key={offset} data-ladder-rail="true"><line x1={x1 + offset} y1={y1} x2={x2 + offset} y2={y2} stroke="#a97643" strokeWidth={6} strokeLinecap="round" /><line x1={x1 + offset - 1} y1={y1} x2={x2 + offset - 1} y2={y2} stroke="#dfb77b" strokeWidth={3} strokeLinecap="round" /></g>)}
              {Array.from({ length: rungCount }, (_, i) => {
                const ratio = (i + .5) / rungCount;
                const x = x1 + (x2 - x1) * ratio;
                const y = y1 + (y2 - y1) * ratio;
                return <g key={i} data-ladder-rung="true"><line x1={x - 11} y1={y} x2={x + 11} y2={y} stroke="#946438" strokeWidth={5} strokeLinecap="round" /><line x1={x - 11} y1={y - 1} x2={x + 11} y2={y - 1} stroke="#edca8f" strokeWidth={2} strokeLinecap="round" /></g>;
              })}
            </svg>;
          }
          const steps = Math.max(1, Math.round(Math.abs(to.y - from.y) / 15));
          return <div key={c.id} data-testid={`scene-connector-${c.id}`} style={{ display: 'contents' }}>{Array.from({ length: steps }, (_, i) => {
            const ratio = i / steps;
            const next = (i + 1) / steps;
            const x = c.from_x + (c.to_x - c.from_x) * ratio;
            const y = from.y + (to.y - from.y) * next;
            return <div key={i} style={{ position: 'absolute', left: x * worldScale + cameraX, top: projectY(y), width: Math.max(14, Math.abs(c.to_x - c.from_x) / steps + 3) * worldScale, height: (Math.abs(to.y - from.y) / steps + 2) * worldScale, background: '#ad7b4c', borderTop: '3px solid #e2bd7a', borderRight: '2px solid #765232', pointerEvents: 'none' }} />;
          })}</div>;
        })}
        {characters.map(character => <div key={`${levelId}:${character.id}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: presentationFor(world?.character_rooms?.[character.id] ?? fallbackRoom)?.filter, opacity: presentationFor(world?.character_rooms?.[character.id] ?? fallbackRoom)?.opacity }}><WorldCharacterSprite character={character} asset={resolveCharacterSprite(manifest, character.id, selectedOutfits[character.id])} revision={revision} posture={world?.character_postures?.[character.id] ?? 'standing'}
          x={character.position.x * worldScale + cameraX} ground={projectY(character.position.y)} scale={scale} projectionKey={projectionKey} selected={character.id === actorId} targeted={character.id === targetId}
          onSelect={e => { walkRun.current++; const state = gameStore.getState(); if (e.shiftKey || targetSelection) state.selectTarget(character.id); else state.selectActor(character.id); state.inspectCharacter(character.id); setTargetSelection(false); }} /></div>)}
        {itemsVisible && itemGroups.map(group => {
          const item = group[0];
          const itemView = presentationFor(world?.item_rooms?.[item.id] ?? fallbackRoom);
          const itemX = Math.max(24, Math.min(width - 24, item.position.x * worldScale + cameraX));
          const expanded = inspectedItem === item.id;
          return <button key={item.id} data-testid={`scene-item-${item.id}`} aria-label={group.map(entry => translateLabel(entry.label)).join(', ')} aria-expanded={expanded} onClick={() => setInspectedItem(expanded ? null : item.id)} style={{ ...controlStyle, position: 'absolute', left: itemX, top: projectY(item.position.y) - 38, transform: 'translate(-50%,-100%)', pointerEvents: 'auto', zIndex: 500, opacity: itemView?.opacity, filter: itemView?.filter }}>◆{group.length > 1 ? group.length : ''}
            {expanded && <span style={{ position: 'absolute', bottom: 48, left: itemX < width / 2 ? 0 : 'auto', right: itemX >= width / 2 ? 0 : 'auto', width: 160, maxHeight: 130, overflow: 'auto', boxSizing: 'border-box', padding: 8, border: '1px solid #b79861', borderRadius: 10, background: '#fff7dc', textAlign: 'left', fontSize: 12 }}>{group.map(entry => <span key={entry.id} data-testid={`scene-item-detail-${entry.id}`} style={{ display: 'block', padding: '4px 0' }}>{translateLabel(entry.label)}</span>)}</span>}
          </button>;
        })}
      </div>
      {notesHeight > 0 && world && <div style={{ position: 'absolute', left: 8, right: 8, bottom: baseToolHeight + 4, height: notesHeight - 8, zIndex: 800 }}><RoomMemoryNotes world={world} height={notesHeight - 8} /></div>}
      <div data-testid="scene-selected-info" style={{ position: 'absolute', bottom: 5, left: 8, right: 8, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 5 }}>
        {hasRoomMemory && <button data-testid="scene-memory-map" aria-label={t('memory.notes')} aria-expanded={notesVisible} onClick={() => { setNotesVisible(!notesVisible); setWardrobeVisible(false); }} style={{ ...controlStyle, fontSize: 13 }}>{t('memory.map')}</button>}
        {actorAsset?.paperDoll && <div data-testid="scene-wardrobe-anchor" style={{ position: 'relative', zIndex: 600, flexShrink: 0 }}>
          <button data-testid="scene-wardrobe" aria-label={t('scene.wardrobe')} aria-expanded={wardrobeVisible} onClick={() => setWardrobeVisible(!wardrobeVisible)} style={{ ...controlStyle, fontSize: 13 }}>{t('scene.wardrobe')}</button>
          {wardrobeVisible && <div data-testid="scene-outfits" style={{ position: 'absolute', left: 0, bottom: 'calc(100% + 8px)', display: 'flex', flexDirection: 'column', width: 138, maxWidth: Math.max(44, width - 32), maxHeight: Math.max(88, ground - 72), overflowY: 'auto', padding: 5, borderRadius: 12, background: '#fff7dc', boxShadow: '0 3px 16px #75573133' }}>{actorAsset.paperDoll.availableOutfits.map(outfit => <button key={outfit} data-testid={`scene-outfit-${outfit}`} aria-pressed={actorAsset.paperDoll?.outfitId === outfit} onClick={() => { if (actorId) setCharacterOutfit(actorId, outfit); }} style={{ ...controlStyle, fontSize: 13, flexShrink: 0 }}>{t(`scene.outfit.${outfit}`, { defaultValue: outfit })}</button>)}</div>}
        </div>}
        <button data-testid="scene-move-left" aria-label={t('scene.moveLeft')} disabled={!enabled} onClick={() => { walkRun.current++; void move(-28); }} style={controlStyle}>◀</button>
        <button data-testid="scene-select-target" aria-label={t('scene.selectTarget')} aria-pressed={targetSelection} onClick={() => setTargetSelection(!targetSelection)} style={controlStyle}>◎</button>
        <button data-testid="scene-posture" aria-label={t(posture === 'sitting' ? 'scene.stand' : 'scene.sit')} disabled={!enabled || (posture !== 'sitting' && !canCharacterSit(actorAsset))} onClick={() => { walkRun.current++; void gameStore.getState().setSelectedPosture(posture === 'sitting' ? 'standing' : 'sitting'); }} style={controlStyle}>{posture === 'sitting' ? '↟' : '▱'}</button>
        {connectors.length > 0 && <button data-testid="scene-traverse" aria-label={t('scene.traverse')} disabled={!enabled || !nearbyConnector} onClick={() => { walkRun.current++; if (nearbyConnector) void gameStore.getState().traverseSelectedConnector(nearbyConnector.id); }} style={controlStyle}>⇅</button>}
        <button data-testid="scene-move-right" aria-label={t('scene.moveRight')} disabled={!enabled} onClick={() => { walkRun.current++; void move(28); }} style={controlStyle}>▶</button>
        <button data-testid="scene-toggle-items" aria-label={t(itemsVisible ? 'scene.hideItems' : 'scene.showItems')} aria-pressed={itemsVisible} onClick={() => { setItemsVisible(!itemsVisible); setInspectedItem(null); }} style={{ ...controlStyle, width: 110, boxSizing: 'border-box', whiteSpace: 'nowrap', flexShrink: 0 }}>{t(itemsVisible ? 'scene.hideItems' : 'scene.showItems')}</button>
      </div>
    </div>
  </div>;
};
const controlStyle: React.CSSProperties = { minHeight: 44, minWidth: 44, padding: '5px 10px', borderRadius: 16, border: '1px solid #b79861', background: '#fff7dce8', color: '#755731', cursor: 'pointer', fontSize: 16 };
