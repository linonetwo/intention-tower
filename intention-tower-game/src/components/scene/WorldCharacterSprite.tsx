import React, { useEffect, useRef, useState } from 'react';
import type { WorldCharacter } from '../../types/backend';
import type { CharacterSpriteAsset } from '../../store/useModAssets';
import { translateLabel } from '../../i18n';

export function WorldCharacterSprite({ character, asset, revision, x, ground, scale, selected, targeted, onSelect }: {
  character: WorldCharacter; asset?: CharacterSpriteAsset; revision: number; x: number; ground: number;
  scale: number; selected: boolean; targeted: boolean; onSelect: (event: React.MouseEvent) => void;
}) {
  const previous = useRef(character.position);
  const [facing, setFacing] = useState<'left' | 'right'>(asset?.facing ?? 'right');
  const [moving, setMoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(2 / 3);
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
  return <button data-testid={`scene-character-${character.id}`} data-world-x={character.position.x} data-world-y={character.position.y}
    data-facing={facing} data-moving={moving} data-ground-y={ground} data-asset-missing={!asset || failed} aria-label={translateLabel(character.label)}
    aria-pressed={selected} onClick={onSelect} onContextMenu={event => { event.preventDefault(); window.dispatchEvent(new CustomEvent('scene-context-menu', { detail: { charId: character.id, clientX: event.clientX, clientY: event.clientY } })); }}
    style={{ position: 'absolute', left: x, top: ground - artHeight, transform: 'translateX(-50%)', width: artHeight * aspect, minWidth: 44, height: artHeight, padding: 0, border: 0, color, background: 'none', cursor: 'pointer', pointerEvents: 'auto', zIndex: Math.round(character.position.y), transition: 'left 140ms linear,top 140ms linear' }}>
    <span style={{ position: 'absolute', left: '15%', width: '70%', height: 12, bottom: -5, background: '#0007', borderRadius: '50%', boxShadow: selected || targeted ? `0 0 0 2px ${color}99` : undefined }} />
    {asset && !failed ? <span style={{ position: 'absolute', bottom: -(1 - anchor) * artHeight, left: 0, width: '100%', height: artHeight, transform: `scaleX(${facing === (asset.facing ?? 'right') ? 1 : -1})` }}>
      <img className="it-world-art" data-testid={`scene-character-sprite-${character.id}`} src={`${asset.src}${asset.src.includes('?') ? '&' : '?'}rev=${revision}`} alt="" draggable={false} onLoad={event => { const image = event.currentTarget; if (image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight); }} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'contain', animation: moving ? 'it-world-walk 180ms infinite' : undefined, filter: 'drop-shadow(0 3px 2px #0006)' }} />
    </span> : <span style={{ position: 'absolute', bottom: 16, left: 0, right: 0, padding: 12, border: `1px dashed ${color}88`, background: '#182232d9', borderRadius: 16, fontSize: 11 }}>全身素材待加载</span>}
    <span style={{ position: 'absolute', left: '50%', bottom: -36, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 12, padding: '3px 8px', borderRadius: 10, background: '#0b1422d9', border: `1px solid ${color}66` }}>{selected ? '▸ ' : targeted ? '◇ ' : ''}{translateLabel(character.label)}</span>
  </button>;
}
