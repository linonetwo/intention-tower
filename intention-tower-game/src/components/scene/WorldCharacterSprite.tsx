import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorldCharacter } from '../../types/backend';
import type { CharacterSpriteAsset } from '../../store/useModAssets';
import { translateLabel } from '../../i18n';
import { CharacterRig, useReducedMotion } from './CharacterRig';
import type { SceneMotion } from '../../animation/motion';
import { locomotion, useSceneMotion } from './sceneMotionPlayer';

export function WorldCharacterSprite({ character, asset, revision, x, ground, scale, worldScale = 1, motion, selected, targeted, onSelect, posture = 'standing' }: {
  character: WorldCharacter; asset?: CharacterSpriteAsset; revision: number; x: number; ground: number;
  scale: number; selected: boolean; targeted: boolean; onSelect: (event: React.MouseEvent) => void;
  posture?: 'standing' | 'sitting';
  worldScale?: number; motion?: SceneMotion;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const frame = useSceneMotion(motion, character.position, posture === 'sitting', asset?.facing ?? 'right', reducedMotion);
  const { facing } = frame;
  const moving = locomotion(frame.clip);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(2 / 3);
  useEffect(() => { setFailed(false); }, [asset?.src, asset?.paperDoll?.outfitId, asset?.paperDoll?.headSrc, revision]);
  const artHeight = (asset?.height ?? 150) * scale;
  const anchor = Math.max(0, Math.min(1, asset?.groundAnchor ?? .96));
  const color = selected ? '#a4f0b3' : targeted ? '#ffd281' : '#e7e6df';
  const hiveMind = character.id === 'it:entity/hive-mind' || character.id === 'hive-mind';
  const source = moving && !hiveMind && asset?.walkFrames?.length
    ? asset.walkFrames[Math.floor(frame.phase / (Math.PI * 2) * asset.walkFrames.length) % asset.walkFrames.length] : asset?.src;
  const pulse = Math.sin(Math.PI * frame.progress) ** 2;
  const feeding = frame.clip === 'eat' || frame.clip === 'drink' || frame.clip === 'observe';
  const reaching = frame.clip === 'interact' || frame.clip === 'offer' || frame.clip === 'work';
  const recoil = frame.clip === 'recoil';
  const breath = reducedMotion ? 0 : Math.sin(frame.phase * .35) * .012;
  const animalAngle = hiveMind || reducedMotion ? 0 : feeding ? 10 * pulse : reaching ? -8 * pulse : recoil ? -12 * pulse : frame.clip === 'speak' ? -5 * pulse : 0;
  const stretch = hiveMind ? (recoil ? -.16 : frame.clip === 'idle' ? 0 : .09) * pulse : recoil ? -.12 * pulse : frame.clip === 'celebrate' ? .08 * pulse : 0;
  const renderedX = x + (frame.position.x - character.position.x) * worldScale;
  const renderedGround = ground + (frame.position.y - character.position.y) * worldScale;
  const imageSource = (src: string | undefined) => `${src}${src?.includes('?') ? '&' : '?'}rev=${revision}`;
  return <button data-testid={`scene-character-${character.id}`} data-world-x={character.position.x} data-world-y={character.position.y}
    data-motion-clip={frame.clip} data-motion-sequence={motion?.sequence ?? 0} data-motion-progress={frame.progress} data-gait-phase={frame.phase} data-render-x={frame.position.x} data-render-y={frame.position.y}
    data-facing={facing} data-moving={moving} data-posture={posture} data-ground-y={ground} data-asset-missing={!asset || failed} aria-label={translateLabel(character.label)}
    aria-pressed={selected} onClick={onSelect} onContextMenu={event => { event.preventDefault(); window.dispatchEvent(new CustomEvent('scene-context-menu', { detail: { charId: character.id, clientX: event.clientX, clientY: event.clientY } })); }}
    style={{ position: 'absolute', left: renderedX, top: renderedGround - artHeight, transform: 'translateX(-50%)', width: artHeight * (asset?.paperDoll ? 256 / 224 : aspect), minWidth: 44, height: artHeight, padding: 0, border: 0, color, background: 'none', cursor: 'pointer', pointerEvents: 'auto', zIndex: Math.round(frame.position.y) }}>
    <span style={{ position: 'absolute', left: '15%', width: '70%', height: 12, bottom: -5, background: '#0007', borderRadius: '50%', boxShadow: selected || targeted ? `0 0 0 2px ${color}99` : undefined }} />
    {frame.sitting > 0 && asset?.chairSrc && <img data-testid={`scene-chair-${character.id}`} src={`${asset.chairSrc}?rev=${revision}`} alt="" style={{ position: 'absolute', bottom: 0, left: '10%', width: '80%', height: '55%', objectFit: 'contain', opacity: frame.sitting }} />}
    {asset?.paperDoll && !failed ? <CharacterRig doll={asset.paperDoll} characterId={character.id} revision={revision} pose={frame.pose} clip={frame.clip} reducedMotion={reducedMotion} facing={facing} height={artHeight} onError={() => setFailed(true)} /> : asset && !failed ? <span style={{ position: 'absolute', bottom: -(1 - anchor) * artHeight, left: 0, width: '100%', height: artHeight, transform: `scaleX(${facing === (asset.facing ?? 'right') ? 1 : -1})` }}>
      <span data-animal-motion={hiveMind ? 'pulse' : frame.clip} style={{ position: 'absolute', inset: 0, transformOrigin: `50% ${anchor * 100}%`, transform: `rotate(${animalAngle}deg) scale(${1 - stretch * .35},${1 + breath + stretch})` }}>
        <img className="it-world-art" data-testid={`scene-character-sprite-${character.id}`} src={imageSource(frame.sitting === 1 && asset.sittingSrc && !hiveMind ? asset.sittingSrc : source)} alt="" draggable={false} onLoad={event => { const image = event.currentTarget; if (image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight); }} onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: asset.sittingSrc && !hiveMind && frame.sitting < 1 ? 1 - frame.sitting : 1, filter: 'drop-shadow(0 3px 2px #0003)' }} />
        {asset.sittingSrc && !hiveMind && frame.sitting > 0 && frame.sitting < 1 && <img src={imageSource(asset.sittingSrc)} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: frame.sitting }} />}
      </span>
    </span> : <span style={{ position: 'absolute', bottom: 16, left: 0, right: 0, padding: 12, border: `1px dashed ${color}88`, background: '#fff2d9', color: '#755731', borderRadius: 16, fontSize: 11 }}>{t('scene.missingArt', { name: translateLabel(character.label) })}</span>}
    <span style={{ position: 'absolute', left: '50%', bottom: -23, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 11, color: '#654b31', padding: '2px 7px', borderRadius: 10, background: '#fff4d9db', border: '1px solid #c2a47d' }}>{selected ? '▸ ' : targeted ? '◇ ' : ''}{translateLabel(character.label)}</span>
  </button>;
}
