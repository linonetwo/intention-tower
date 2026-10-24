import { describe, expect, it } from 'vitest';
import { evaluateCharacterPose, HUMANOID_RIG, limbEndpoint } from './characterRig';

describe('shared humanoid-v1 authored rig', () => {
  it('is four heads high with a fixed head and canonical ground anchor', () => {
    expect(HUMANOID_RIG.standingHeight / HUMANOID_RIG.headSize).toBe(4);
    expect(HUMANOID_RIG.head).toEqual({ x: -28, y: -128, width: 56, height: 56 });
  });
  it('grounds articulated feet throughout standing, walking and sitting', () => {
    for (const posture of ['standing', 'walking', 'sitting'] as const) {
      for (let frame = 0; frame < 120; frame++) {
        const pose = evaluateCharacterPose(posture, frame / 60);
        for (const joint of [pose.leftLeg, pose.rightLeg]) {
          expect(limbEndpoint(pose.hip, joint, 46, 50).y).toBeCloseTo(240, 7);
        }
      }
    }
    const sitting = evaluateCharacterPose('sitting');
    expect(sitting.hip.y).toBe(190);
    expect(sitting.leftLeg.upper).toBe(-90);
    expect(sitting.leftLeg.upper + sitting.leftLeg.lower).toBe(0);
  });
  it('is deterministic and freezes the walk clip for reduced motion', () => {
    expect(evaluateCharacterPose('walking', .33)).toEqual(evaluateCharacterPose('walking', .33));
    expect(evaluateCharacterPose('walking', 99, true)).toEqual(evaluateCharacterPose('standing'));
  });
});
