import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorldCharacter } from '../../types/backend';
import type { CharacterSpriteAsset } from '../../store/useModAssets';
import { translateLabel } from '../../i18n';

export function WorldCharacterSprite({ character, asset, revision, x, ground, scale, projectionKey, selected, targeted, onSelect, posture = 'standing' }: {
  character: WorldCharacter; asset?: CharacterSpriteAsset; revision: number; x: number; ground: number;
  scale: number; selected: boolean; targeted: boolean; onSelect: (event: React.MouseEvent) => void;
  posture?: 'standing' | 'sitting';
  projectionKey: string;
}) {
  const { t } = useTranslation();
  const committedProjection = useRef({ key: projectionKey, x: character.position.x, y: character.position.y, animate: false });
  const committed = committedProjection.current;
  // Camera/layout changes must land with the room, even during a walk. Keep
  // that decision across image-load/frame rerenders until the next world move.
  const animatePosition = committed.key !== projectionKey ? false
    : committed.x !== character.position.x || committed.y !== character.position.y ? true : committed.animate;
  useLayoutEffect(() => {
    committedProjection.current = { key: projectionKey, x: character.position.x, y: character.position.y, animate: animatePosition };
  });
  const previous = useRef(character.position);
  const [facing, setFacing] = useState<'left' | 'right'>(asset?.facing ?? 'right');
  const [moving, setMoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(2 / 3);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!moving || !asset?.walkFrames?.length) { setFrame(0); return; }
    const timer = window.setInterval(() => setFrame(value => value + 1), 90);
    return () => window.clearInterval(timer);
  }, [moving, asset?.walkFrames]);
  useEffect(() => {
    const dx = character.position.x - previous.current.x;
    const dy = character.position.y - previous.current.y;
    previous.current = character.position;
    if (dx) setFacing(dx < 0 ? 'left' : 'right');
    if (!dx && !dy) return;
    setMoving(true);
    const timer = window.setTimeout(() => setMoving(false), 240);
    return () => window.clearTimeout(timer);
  }, [character.position.x, character.position.y]);
  useEffect(() => { setFailed(false); }, [asset?.src, revision]);
  const artHeight = (asset?.height ?? 150) * scale;
  const anchor = Math.max(0, Math.min(1, asset?.groundAnchor ?? .96));
  const color = selected ? '#a4f0b3' : targeted ? '#ffd281' : '#e7e6df';
  const source = posture === 'sitting' && asset?.sittingSrc ? asset.sittingSrc
    : moving && asset?.walkFrames?.length ? asset.walkFrames[frame % asset.walkFrames.length] : asset?.src;
  return <button data-testid={`scene-character-${character.id}`} data-world-x={character.position.x} data-world-y={character.position.y}
    data-facing={facing} data-moving={moving} data-posture={posture} data-ground-y={ground} data-asset-missing={!asset || failed} aria-label={translateLabel(character.label)}
    aria-pressed={selected} onClick={onSelect} onContextMenu={event => { event.preventDefault(); window.dispatchEvent(new CustomEvent('scene-context-menu', { detail: { charId: character.id, clientX: event.clientX, clientY: event.clientY } })); }}
    style={{ position: 'absolute', left: x, top: ground - artHeight, transform: 'translateX(-50%)', width: artHeight * aspect, minWidth: 44, height: artHeight, padding: 0, border: 0, color, background: 'none', cursor: 'pointer', pointerEvents: 'auto', zIndex: Math.round(character.position.y), transition: animatePosition ? 'left 140ms linear,top 140ms linear' : 'none' }}>
    <span style={{ position: 'absolute', left: '15%', width: '70%', height: 12, bottom: -5, background: '#0007', borderRadius: '50%', boxShadow: selected || targeted ? `0 0 0 2px ${color}99` : undefined }} />
    {posture === 'sitting' && asset?.chairSrc && <img data-testid={`scene-chair-${character.id}`} src={`${asset.chairSrc}?rev=${revision}`} alt="" style={{ position: 'absolute', bottom: 0, left: '10%', width: '80%', height: '55%', objectFit: 'contain' }} />}
    {asset && !failed ? <span style={{ position: 'absolute', bottom: -(1 - anchor) * artHeight, left: 0, width: '100%', height: artHeight, transform: `scaleX(${facing === (asset.facing ?? 'right') ? 1 : -1})` }}>
      <img className="it-world-art" data-testid={`scene-character-sprite-${character.id}`} src={`${source}${source?.includes('?') ? '&' : '?'}rev=${revision}`} alt="" draggable={false} onLoad={event => { const image = event.currentTarget; if (image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight); }} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 3px 2px #0003)' }} />
    </span> : <span style={{ position: 'absolute', bottom: 16, left: 0, right: 0, padding: 12, border: `1px dashed ${color}88`, background: '#fff2d9', color: '#755731', borderRadius: 16, fontSize: 11 }}>{t('scene.missingArt', { name: translateLabel(character.label) })}</span>}
    <span style={{ position: 'absolute', left: '50%', bottom: -23, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 11, color: '#654b31', padding: '2px 7px', borderRadius: 10, background: '#fff4d9db', border: '1px solid #c2a47d' }}>{selected ? '▸ ' : targeted ? '◇ ' : ''}{translateLabel(character.label)}</span>
  </button>;
}
