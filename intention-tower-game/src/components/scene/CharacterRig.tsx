import { useEffect, useState } from 'react';
import type { ResolvedPaperDoll } from '../../store/useModAssets';
import { HUMANOID_RIG, type CharacterPose, type LimbPose } from './characterRig';
import type { MotionClip } from '../../animation/motion';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener?.('change', changed);
    return () => media.removeEventListener?.('change', changed);
  }, []);
  return reducedMotion;
}

export function CharacterRig({ doll, characterId, revision, pose, clip, facing, onError, height, reducedMotion }: {
  doll: ResolvedPaperDoll; characterId: string; revision: number; pose: CharacterPose; clip: MotionClip; reducedMotion: boolean;
  facing: 'left' | 'right'; onError: () => void; height: number;
}) {
  const overlap = HUMANOID_RIG.jointOverlap;
  const image = (src: string | undefined, name: string, width: number, height: number, left: number, top: number) =>
    <img key={name} data-testid={name === 'head' ? `scene-character-sprite-${characterId}` : undefined} data-rig-part={name}
      src={src ? `${src}${src.includes('?') ? '&' : '?'}rev=${revision}` : undefined} alt="" draggable={false} onError={onError}
      style={{ position: 'absolute', width, height, left, top, pointerEvents: 'none' }} />;
  const limb = (name: string, joint: LimbPose, upperSrc: string, lowerSrc: string, length: number, lowerLength: number, width: number) =>
    <span data-rig-joint={name} style={{ position: 'absolute', left: joint.x, top: joint.y, transform: `rotate(${joint.upper}deg)`, transformOrigin: '0 0' }}>
      {image(upperSrc, `${name}-upper`, width, length + overlap * 2, -width / 2, -overlap)}
      <span data-rig-joint={`${name}-lower`} style={{ position: 'absolute', left: 0, top: length, transform: `rotate(${joint.lower}deg)`, transformOrigin: '0 0' }}>
        {image(lowerSrc, `${name}-lower`, width, lowerLength + overlap, -width / 2, -overlap)}
      </span>
    </span>;
  const parts = doll.parts;
  useEffect(() => { if (!doll.headSrc || !parts || Object.values(parts).some(src => !src)) onError(); }, [doll, parts, onError]);
  if (!parts) return null;
  return <span data-testid={`scene-character-rig-${characterId}`} data-rig="humanoid-v1" data-outfit={doll.outfitId} data-head={doll.headId}
    data-pose={clip} data-reduced-motion={reducedMotion} style={{ position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 }}>
    <span style={{ position: 'absolute', width: 256, height: 256, left: '50%', top: height - 240 * height / 224, marginLeft: -128,
      transform: `scale(${height / 224}) scaleX(${facing === 'left' ? -1 : 1})`, transformOrigin: '128px 0' }}>
      <span data-rig-joint="hip" style={{ position: 'absolute', left: pose.hip.x, top: pose.hip.y }}>
        {limb('left-leg', pose.leftLeg, parts.thigh, parts.shin, 46, 50, 22)}
        {limb('right-leg', pose.rightLeg, parts.thigh, parts.shin, 46, 50, 22)}
        <span data-rig-joint="torso" style={{ position: 'absolute', transform: `rotate(${pose.torso}deg)`, transformOrigin: '0 0' }}>
          {limb('right-arm', pose.rightArm, parts.upperArm, parts.forearm, 39, 39, 18)}
          {image(parts.torso, 'torso', 60, 72 + overlap, -30, -72 - overlap)}
          <span data-rig-joint="head" style={{ position: 'absolute', left: 0, top: -72, transform: `rotate(${pose.head}deg)`, transformOrigin: '0 0' }}>
            {image(doll.headSrc, 'head', HUMANOID_RIG.headSize, HUMANOID_RIG.headSize, -28, -56)}
          </span>
          {limb('left-arm', pose.leftArm, parts.upperArm, parts.forearm, 39, 39, 18)}
        </span>
      </span>
    </span>
  </span>;
}
