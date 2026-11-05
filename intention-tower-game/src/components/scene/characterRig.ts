import type { MotionClip } from '../../animation/motion';

/** Canonical authored geometry. All heads/outfits use these same joints and clips. */
export const HUMANOID_RIG = {
  width: 256, height: 256, foot: { x: 128, y: 240 }, standingHeight: 224, headSize: 56,
  head: { x: -28, y: -128, width: 56, height: 56 },
  torso: { x: -30, y: -72, width: 60, height: 72 },
  upperArm: 39, forearm: 39, thigh: 46, shin: 50,
  /** Texture bleed across pivots closes transparent PNG borders without changing IK. */
  jointOverlap: 4,
} as const;
export type RigPosture = 'standing' | 'walking' | 'sitting';
export interface LimbPose { x: number; y: number; upper: number; lower: number }
export interface CharacterPose { hip: { x: number; y: number }; torso: number; head: number; leftLeg: LimbPose; rightLeg: LimbPose; leftArm: LimbPose; rightArm: LimbPose }
/** Angles are measured from down. IK keeps both feet on the canonical floor. */
function leg(x: number, hipY: number, footOffset: number, lift = 0): LimbPose {
  const dx = footOffset, dy = 240 - lift - hipY;
  const distance = Math.min(96, Math.hypot(dx, dy));
  const bend = Math.acos(Math.max(-1, Math.min(1, (46 * 46 + 50 * 50 - distance * distance) / (2 * 46 * 50))));
  const knee = Math.PI - bend;
  const upper = Math.atan2(-dx, dy) - Math.atan2(50 * Math.sin(knee), 46 + 50 * Math.cos(knee));
  return { x, y: 0, upper: upper * 180 / Math.PI, lower: knee * 180 / Math.PI };
}
export const ease = (value: number) => { const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); };
export function blendCharacterPose(a: CharacterPose, b: CharacterPose, amount: number): CharacterPose {
  const mix = (x: number, y: number) => x + (y - x) * amount;
  const limb = (x: LimbPose, y: LimbPose): LimbPose => ({ x: mix(x.x, y.x), y: mix(x.y, y.y), upper: mix(x.upper, y.upper), lower: mix(x.lower, y.lower) });
  const hip = { x: mix(a.hip.x, b.hip.x), y: mix(a.hip.y, b.hip.y) };
  const plantedLeg = (x: LimbPose, y: LimbPose) => {
    const from = limbEndpoint(a.hip, x, 46, 50), to = limbEndpoint(b.hip, y, 46, 50), offset = mix(x.x, y.x);
    return leg(offset, hip.y, mix(from.x, to.x) - hip.x - offset, 240 - mix(from.y, to.y));
  };
  return { hip, torso: mix(a.torso, b.torso), head: mix(a.head, b.head),
    leftLeg: plantedLeg(a.leftLeg, b.leftLeg), rightLeg: plantedLeg(a.rightLeg, b.rightLeg), leftArm: limb(a.leftArm, b.leftArm), rightArm: limb(a.rightArm, b.rightArm) };
}

/** Pure joint sampling. Gait is distance-driven; one foot supports while the other clears the floor. */
export function sampleCharacterPose(clip: MotionClip, progress: number, phase: number, sitting = 0, reducedMotion = false): CharacterPose {
  if (reducedMotion) { clip = 'idle'; phase = 0; }
  if (clip === 'sit-down') sitting = ease(progress);
  if (clip === 'stand-up') sitting = 1 - ease(progress);
  const moving = clip === 'walk' || clip === 'stairs' || clip === 'climb';
  const stride = Math.sin(phase), breath = reducedMotion ? 0 : (1 - Math.cos(phase * .35)) * .7;
  const pulse = Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) ** 2;
  const hipY = 144 + sitting * 46 + (moving ? 4 + Math.abs(stride) * 1.5 : breath);
  const footReach = 46 * sitting;
  const pose: CharacterPose = {
    hip: { x: 128, y: hipY }, torso: 0, head: 0,
    leftLeg: leg(-8, hipY, footReach + (moving ? stride * 18 : 0), moving ? Math.max(0, Math.cos(phase)) * (clip === 'walk' ? 9 : 22) : 0),
    rightLeg: leg(8, hipY, footReach - (moving ? stride * 18 : 0), moving ? Math.max(0, -Math.cos(phase)) * (clip === 'walk' ? 9 : 22) : 0),
    leftArm: { x: -24, y: -58, upper: 7 - sitting * 35 + (moving ? stride * 28 : 0), lower: -8 - sitting * 47 },
    rightArm: { x: 18, y: -58, upper: -7 - sitting * 21 - (moving ? stride * 28 : 0), lower: 8 - sitting * 63 },
  };
  switch (clip) {
    case 'sit-down': case 'stand-up':
      pose.torso = -12 * pulse; pose.leftArm.upper -= 24 * pulse; pose.rightArm.upper -= 24 * pulse; break;
    case 'stairs':
      pose.torso = -7; pose.head = 5; break;
    case 'climb':
      pose.torso = -5; pose.leftArm.upper = -145 + stride * 28; pose.rightArm.upper = -145 - stride * 28;
      pose.leftArm.lower = -25 - stride * 18; pose.rightArm.lower = -25 + stride * 18; break;
    case 'observe':
      pose.torso = -9 * pulse; pose.head = 15 * pulse; pose.leftArm.upper -= 46 * pulse; pose.leftArm.lower -= 65 * pulse; break;
    case 'interact':
      pose.torso = -12 * pulse; pose.leftArm.upper -= 70 * pulse; pose.leftArm.lower -= 15 * pulse; break;
    case 'speak':
      pose.head = -7 * pulse; pose.leftArm.upper -= 48 * pulse; pose.leftArm.lower -= (45 + Math.sin(progress * Math.PI * 4) * 16) * pulse; break;
    case 'offer':
      pose.torso = -8 * pulse; pose.leftArm.upper -= 60 * pulse; pose.leftArm.lower -= 28 * pulse; pose.rightArm.upper -= 20 * pulse; break;
    case 'eat': case 'drink':
      pose.head = (clip === 'drink' ? -16 : 12) * pulse; pose.torso = -5 * pulse;
      pose.leftArm.upper -= 40 * pulse; pose.leftArm.lower -= 115 * pulse; break;
    case 'work': {
      const effort = pulse * (.5 + .5 * Math.sin(progress * Math.PI * 6));
      pose.torso = -20 * effort; pose.head = 9 * effort;
      pose.leftArm.upper -= 65 * effort; pose.rightArm.upper -= 60 * effort;
      pose.leftArm.lower -= 50 * pulse; pose.rightArm.lower -= 50 * pulse; break;
    }
    case 'celebrate':
      pose.torso = 5 * pulse; pose.head = -10 * pulse; pose.leftArm.upper -= 150 * pulse; pose.rightArm.upper += 135 * pulse;
      pose.leftArm.lower -= 22 * pulse; pose.rightArm.lower += 22 * pulse; break;
    case 'recoil':
      pose.torso = 20 * pulse; pose.head = -15 * pulse; pose.leftArm.upper -= 40 * pulse; pose.rightArm.upper -= 35 * pulse;
      pose.leftArm.lower -= 100 * pulse; pose.rightArm.lower -= 90 * pulse; break;
  }
  return pose;
}
export function evaluateCharacterPose(posture: RigPosture, seconds = 0, reducedMotion = false): CharacterPose {
  return sampleCharacterPose(posture === 'walking' ? 'walk' : 'idle', 0, seconds * Math.PI * 3, posture === 'sitting' ? 1 : 0, reducedMotion);
}
export function limbEndpoint(origin: { x: number; y: number }, pose: LimbPose, upperLength: number, lowerLength: number) {
  const upper = pose.upper * Math.PI / 180, lower = (pose.upper + pose.lower) * Math.PI / 180;
  return { x: origin.x + pose.x - Math.sin(upper) * upperLength - Math.sin(lower) * lowerLength,
    y: origin.y + pose.y + Math.cos(upper) * upperLength + Math.cos(lower) * lowerLength };
}
