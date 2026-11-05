import { useLayoutEffect, useRef, useState } from 'react';
import type { MotionClip, MotionPoint, SceneMotion } from '../../animation/motion';
import { blendCharacterPose, ease, sampleCharacterPose, type CharacterPose } from './characterRig';

export const locomotion = (clip: MotionClip) => clip === 'walk' || clip === 'stairs' || clip === 'climb';
export interface MotionFrame {
  position: MotionPoint; pose: CharacterPose; clip: MotionClip; phase: number; progress: number; sitting: number; facing: 'left' | 'right';
}
interface Playback {
  motion?: SceneMotion; from: MotionPoint; startedAt: number; duration: number; lastAt: number;
  phase: number; fromPose?: CharacterPose; frame: MotionFrame;
}
export function createPlayback(position: MotionPoint, sitting: boolean, facing: 'left' | 'right', now: number): Playback {
  return { from: position, startedAt: now, duration: 0, lastAt: now, phase: 0,
    frame: { position, pose: sampleCharacterPose('idle', 0, 0, Number(sitting)), clip: 'idle', phase: 0, progress: 1, sitting: Number(sitting), facing } };
}
export function acceptMotion(player: Playback, motion: SceneMotion | undefined, position: MotionPoint, sitting: boolean, now: number) {
  if (!motion) {
    player.motion = undefined; player.fromPose = undefined; player.phase = 0; player.lastAt = now;
    player.frame = { ...player.frame, position, clip: 'idle', sitting: Number(sitting) };
    return;
  }
  if (motion === player.motion) return;
  const continuing = player.motion && locomotion(player.motion.clip) && locomotion(motion.clip) && player.frame.clip !== 'idle';
  player.from = player.frame.position;
  player.fromPose = continuing ? undefined : player.frame.pose;
  player.startedAt = Math.max(motion.startedAt, now);
  // Repeated input targets arrive every 65ms. Preserve speed while chasing the
  // latest target from the current displayed world point, not the old snapshot.
  const authoredDistance = Math.hypot(motion.to.x - motion.from.x, motion.to.y - motion.from.y);
  const remainingDistance = Math.hypot(motion.to.x - player.from.x, motion.to.y - player.from.y);
  const previous = player.motion;
  const inputDistance = previous ? Math.hypot(motion.to.x - previous.to.x, motion.to.y - previous.to.y) : 0;
  const inputInterval = previous ? motion.startedAt - previous.startedAt : 0;
  player.duration = continuing && motion.clip === 'walk' && previous?.clip === 'walk' && inputDistance > 0 && inputInterval > 0
    ? remainingDistance * inputInterval / inputDistance
    : locomotion(motion.clip) && authoredDistance > 0 ? motion.durationMs * remainingDistance / authoredDistance : motion.durationMs;
  if (now >= motion.startedAt + motion.durationMs) {
    player.from = motion.to; player.startedAt = motion.startedAt; player.duration = motion.durationMs; player.fromPose = undefined;
  }
  player.motion = motion;
}
export function samplePlayback(player: Playback, now: number, reducedMotion = false): MotionFrame {
  const motion = player.motion;
  const elapsed = now - player.startedAt;
  const progress = motion ? Math.min(1, Math.max(0, elapsed / Math.max(1, player.duration))) : 1;
  const clip = motion && progress < 1 && !reducedMotion ? motion.clip : 'idle';
  const target = motion?.to ?? player.frame.position;
  const positionProgress = motion && locomotion(motion.clip) ? progress : ease(elapsed / 100);
  const position = motion && !reducedMotion
    ? { x: player.from.x + (target.x - player.from.x) * positionProgress, y: player.from.y + (target.y - player.from.y) * positionProgress }
    : target;
  const distance = Math.hypot(position.x - player.frame.position.x, position.y - player.frame.position.y);
  player.phase += locomotion(clip) ? distance * Math.PI / 24 : Math.max(0, now - player.lastAt) / 1000 * Math.PI * 2;
  const sitting = motion
    ? reducedMotion || progress === 1 ? Number(motion.toPosture === 'sitting')
      : motion.clip === 'sit-down' ? ease(progress) : motion.clip === 'stand-up' ? 1 - ease(progress)
        : locomotion(motion.clip) ? Number(motion.fromPosture === 'sitting') * (1 - ease(elapsed / 100)) : Number(motion.fromPosture === 'sitting')
    : player.frame.sitting;
  let pose = sampleCharacterPose(clip, progress, player.phase, sitting, reducedMotion);
  if (player.fromPose && elapsed < 100 && !reducedMotion) pose = blendCharacterPose(player.fromPose, pose, ease(elapsed / 100));
  player.lastAt = now;
  player.frame = { position, pose, phase: player.phase, clip, progress, sitting, facing: motion?.facing ?? player.frame.facing };
  return player.frame;
}

const frameListeners = new Set<(now: number) => void>();
let frameRequest = 0;
function animate(now: number) {
  for (const listener of frameListeners) listener(now);
  frameRequest = frameListeners.size ? requestAnimationFrame(animate) : 0;
}
function subscribeFrame(listener: (now: number) => void) {
  frameListeners.add(listener);
  if (!frameRequest) frameRequest = requestAnimationFrame(animate);
  return () => {
    frameListeners.delete(listener);
    if (!frameListeners.size) { cancelAnimationFrame(frameRequest); frameRequest = 0; }
  };
}

/** One animation clock for position, rig joints and animal frames. Camera and clothes never enter it. */
export function useSceneMotion(motion: SceneMotion | undefined, position: MotionPoint, sitting: boolean, facing: 'left' | 'right', reduced: boolean) {
  const player = useRef<Playback>(createPlayback(position, sitting, facing, performance.now()));
  const [frame, setFrame] = useState(player.current.frame);
  useLayoutEffect(() => {
    const now = performance.now();
    acceptMotion(player.current, motion, position, sitting, now);
    setFrame(samplePlayback(player.current, now, reduced));
  }, [motion, position.x, position.y, sitting, reduced]);
  useLayoutEffect(() => {
    if (reduced) return;
    return subscribeFrame(now => setFrame(samplePlayback(player.current, now)));
  }, [reduced]);
  return frame;
}
