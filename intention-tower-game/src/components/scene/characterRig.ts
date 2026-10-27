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
export interface CharacterPose { hip: { x: number; y: number }; leftLeg: LimbPose; rightLeg: LimbPose; leftArm: LimbPose; rightArm: LimbPose }
/** Angles are measured from down. IK keeps both feet on the canonical floor. */
function leg(x: number, hipY: number, footOffset: number): LimbPose {
  const dx = footOffset, dy = 240 - hipY;
  const distance = Math.min(96, Math.hypot(dx, dy));
  const bend = Math.acos(Math.max(-1, Math.min(1, (46 * 46 + 50 * 50 - distance * distance) / (2 * 46 * 50))));
  const knee = Math.PI - bend;
  const upper = Math.atan2(-dx, dy) - Math.atan2(50 * Math.sin(knee), 46 + 50 * Math.cos(knee));
  return { x, y: 0, upper: upper * 180 / Math.PI, lower: knee * 180 / Math.PI };
}
export function evaluateCharacterPose(posture: RigPosture, seconds = 0, reducedMotion = false): CharacterPose {
  const phase = reducedMotion ? 0 : Math.sin(seconds * Math.PI * 3);
  const walking = posture === 'walking' && !reducedMotion;
  const hipY = posture === 'sitting' ? 190 : walking ? 147 : 144;
  const sittingLeg = (x: number): LimbPose => ({ x, y: 0, upper: -90, lower: 90 });
  return {
    hip: { x: 128, y: hipY },
    leftLeg: posture === 'sitting' ? sittingLeg(-8) : leg(-8, hipY, walking ? phase * 16 : 0),
    rightLeg: posture === 'sitting' ? sittingLeg(8) : leg(8, hipY, walking ? -phase * 16 : 0),
    leftArm: { x: -24, y: -58, upper: posture === 'sitting' ? -28 : walking ? phase * 22 : 7, lower: posture === 'sitting' ? -55 : -8 },
    rightArm: { x: 18, y: -58, upper: posture === 'sitting' ? -28 : walking ? -phase * 22 : -7, lower: posture === 'sitting' ? -55 : 8 },
  };
}
export function limbEndpoint(origin: { x: number; y: number }, pose: LimbPose, upperLength: number, lowerLength: number) {
  const upper = pose.upper * Math.PI / 180, lower = (pose.upper + pose.lower) * Math.PI / 180;
  return { x: origin.x + pose.x - Math.sin(upper) * upperLength - Math.sin(lower) * lowerLength,
    y: origin.y + pose.y + Math.cos(upper) * upperLength + Math.cos(lower) * lowerLength };
}
