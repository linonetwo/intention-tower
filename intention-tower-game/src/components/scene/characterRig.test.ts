import { describe, expect, it } from 'vitest';
import { evaluateCharacterPose, HUMANOID_RIG, limbEndpoint, sampleCharacterPose } from './characterRig';
import { acceptMotion, createPlayback, samplePlayback } from './sceneMotionPlayer';
import type { SceneMotion } from '../../animation/motion';

describe('shared humanoid-v1 authored rig', () => {
  it('is four heads high with a fixed head and canonical ground anchor', () => {
    expect(HUMANOID_RIG.standingHeight / HUMANOID_RIG.headSize).toBe(4);
    expect(HUMANOID_RIG.head).toEqual({ x: -28, y: -128, width: 56, height: 56 });
  });
  it('keeps a support foot grounded while the swing foot clears the floor', () => {
    for (const posture of ['standing', 'walking', 'sitting'] as const) {
      for (let frame = 0; frame < 120; frame++) {
        const pose = evaluateCharacterPose(posture, frame / 60);
        const feet = [pose.leftLeg, pose.rightLeg].map(joint => limbEndpoint(pose.hip, joint, 46, 50).y);
        expect(Math.max(...feet)).toBeCloseTo(240, 7);
        expect(Math.min(...feet)).toBeLessThanOrEqual(240.000001);
        expect(Math.min(...feet)).toBeGreaterThanOrEqual(230);
      }
    }
    const sitting = evaluateCharacterPose('sitting');
    expect(sitting.hip.y).toBe(190);
    expect(sitting.leftLeg.upper).toBe(-90);
    expect(sitting.leftLeg.upper + sitting.leftLeg.lower).toBeCloseTo(0);
  });
  it('is deterministic and freezes the walk clip for reduced motion', () => {
    expect(evaluateCharacterPose('walking', .33)).toEqual(evaluateCharacterPose('walking', .33));
    expect(evaluateCharacterPose('walking', 99, true)).toEqual(evaluateCharacterPose('standing'));
  });
  it('articulates posture and gesture clips, with grounded final poses', () => {
    const standing = sampleCharacterPose('idle', 0, 0);
    const sitting = sampleCharacterPose('idle', 0, 0, 1);
    expect(sampleCharacterPose('sit-down', 0, 0).hip).toEqual(standing.hip);
    expect(sampleCharacterPose('sit-down', 0, 0).leftLeg).toEqual(standing.leftLeg);
    expect(sampleCharacterPose('sit-down', 1, 0).hip).toEqual(sitting.hip);
    expect(sampleCharacterPose('stand-up', 1, 0).hip).toEqual(standing.hip);
    expect(sampleCharacterPose('sit-down', .5, 0).leftLeg.lower).toBeGreaterThan(standing.leftLeg.lower);
    for (const clip of ['observe', 'interact', 'speak', 'offer', 'eat', 'drink', 'work', 'celebrate', 'recoil'] as const) {
      const active = sampleCharacterPose(clip, .4, 0);
      expect(active.leftArm).not.toEqual(standing.leftArm);
      expect(limbEndpoint(active.hip, active.leftLeg, 46, 50).y).toBeCloseTo(240);
      expect(sampleCharacterPose(clip, 1, 0).leftArm.upper).toBeCloseTo(standing.leftArm.upper);
    }
    expect(sampleCharacterPose('climb', .5, 1).leftArm.upper).toBeLessThan(-100);
    expect(sampleCharacterPose('stairs', .5, 1).torso).toBeLessThan(0);
  });
  it('retargets 65ms walk updates from the rendered point without restarting gait, then snaps resets', () => {
    const player = createPlayback({ x: 100, y: 300 }, false, 'right', 0);
    const motion: SceneMotion = { sequence: 1, clip: 'walk', startedAt: 0, durationMs: 180, from: { x: 100, y: 300 }, to: { x: 118, y: 300 }, fromPosture: 'standing', toPosture: 'standing', facing: 'right' };
    acceptMotion(player, motion, motion.to, false, 0);
    const midway = samplePlayback(player, 65);
    expect(midway.position.x).toBeGreaterThan(100);
    expect(midway.position.x).toBeLessThan(118);
    const next = { ...motion, sequence: 2, startedAt: 65, from: motion.to, to: { x: 136, y: 300 } };
    acceptMotion(player, next, next.to, false, 65);
    const continued = samplePlayback(player, 65);
    expect(continued.position).toEqual(midway.position);
    expect(continued.phase).toBe(midway.phase);
    expect(samplePlayback(player, 130).phase).toBeGreaterThan(midway.phase);
    expect(samplePlayback(player, 350).position).toEqual(next.to);
    acceptMotion(player, undefined, { x: 600, y: 180 }, true, 350);
    expect(samplePlayback(player, 350).position).toEqual({ x: 600, y: 180 });
    expect(samplePlayback(player, 350).clip).toBe('idle');
    expect(samplePlayback(player, 350).sitting).toBe(1);
    const fromSeat = { ...motion, sequence: 3, startedAt: 350, fromPosture: 'sitting' as const, from: { x: 600, y: 180 }, to: { x: 620, y: 180 } };
    acceptMotion(player, fromSeat, fromSeat.to, false, 350);
    expect(samplePlayback(player, 400).sitting).toBeCloseTo(.5);
    const rising = samplePlayback(player, 415);
    const secondStep = { ...fromSeat, sequence: 4, startedAt: 415, fromPosture: 'standing' as const, from: fromSeat.to, to: { x: 640, y: 180 } };
    acceptMotion(player, secondStep, secondStep.to, false, 415);
    const retargeted = samplePlayback(player, 415);
    expect(retargeted.sitting).toBe(rising.sitting);
    expect(retargeted.pose.hip).toEqual(rising.pose.hip);
    expect(retargeted.pose.leftArm).toEqual(rising.pose.leftArm);
    expect(samplePlayback(player, 455).sitting).toBe(0);
  });
  it('plays connector paths continuously and reduced motion lands immediately', () => {
    const motion: SceneMotion = { sequence: 1, clip: 'climb', startedAt: 0, durationMs: 800, from: { x: 100, y: 300 }, to: { x: 110, y: 100 }, fromPosture: 'standing', toPosture: 'standing', facing: 'right' };
    const player = createPlayback(motion.from, false, 'right', 0);
    acceptMotion(player, motion, motion.to, false, 0);
    expect(samplePlayback(player, 400).position).toEqual({ x: 105, y: 200 });
    expect(samplePlayback(player, 410, true).position).toEqual(motion.to);
    const ladder = { ...motion, from: { x: 80, y: 300 }, via: { x: 100, y: 300 }, to: { x: 100, y: 100 }, durationMs: 880 };
    const approach = createPlayback(ladder.from, false, 'right', 0);
    acceptMotion(approach, ladder, ladder.to, false, 0);
    expect(samplePlayback(approach, 40).position).toEqual({ x: 90, y: 300 });
    expect(samplePlayback(approach, 40).clip).toBe('walk');
    expect(samplePlayback(approach, 80).position).toEqual(ladder.via);
    expect(samplePlayback(approach, 480).position).toEqual({ x: 100, y: 200 });
    expect(samplePlayback(approach, 480).clip).toBe('climb');
    const slanted = { ...ladder, to: { x: 160, y: 220 }, durationMs: 480 };
    const diagonal = createPlayback(slanted.from, false, 'right', 0);
    acceptMotion(diagonal, slanted, slanted.to, false, 0);
    expect(samplePlayback(diagonal, 280).position).toEqual({ x: 130, y: 260 });
    expect(samplePlayback(diagonal, 300, true).position).toEqual(slanted.to);
  });
});
