import type { CharacterPosture, WorldEvent, WorldState } from '../types/backend';

export type MotionClip = 'idle' | 'walk' | 'sit-down' | 'stand-up' | 'stairs' | 'climb' | 'observe' | 'interact' | 'speak' | 'offer' | 'eat' | 'drink' | 'work' | 'celebrate' | 'recoil';
export interface MotionPoint { x: number; y: number }
export interface SceneMotion {
  sequence: number;
  clip: MotionClip;
  startedAt: number;
  durationMs: number;
  from: MotionPoint;
  to: MotionPoint;
  fromPosture: CharacterPosture;
  toPosture: CharacterPosture;
  facing: 'left' | 'right';
}
export interface AcceptWorldOptions {
  resetMotions?: boolean;
  traversal?: { characterId: string; kind: 'stairs' | 'ladder'; from: MotionPoint; to: MotionPoint };
}

// These are semantic IDs from all shipped command definitions, never display labels.
const commandClips: Record<string, MotionClip> = {};
function commands(clip: MotionClip, ids: string) {
  for (const id of ids.split(' ')) commandClips[id] = clip;
}
commands('observe', 'remember-this-place investigate-area read-necronomicon investigate-victim examine-reality compare-layers observe-binding reflect-on-meaning observe-conflict show-real-world');
commands('interact', 'ring-bell place-billboard set-price craft-ad-meme close-book enter-vr exit-vr earn-virtual-reward hack-bci request-orbital-fire show-decoy cut-game-connection restrict-gaming show-button demonstrate-press introduce-uniform');
commands('work', 'craft-product set-up-shop build-factory defend-station craft-normal-meme craft-magic-meme help-with-work');
commands('offer', 'feed feed-after-press offer-water offer-dry-food');
commands('drink', 'take-memory-drug');
commands('eat', 'satisfy-real-need');
commands('speak', 'ask-bystander announce-situation inspire-hope plant-prophecy rally-troops deliver-bad-news deliver-good-news encourage-intrinsic add-pressure cast-magic-ad enhance-brand persuade-luddite humiliate offer-respect threaten-life praise-loyalty make-sound inject-distrust preach reinforce-faith challenge-belief show-evidence trigger-memory-fragment shake-illusion call-name build-real-meaning inject-meme spread-via-carrier deconstruct-narrative accept-new-narrative request-sit request-stand teach-gesture enforce-discipline give-weak-approval give-approval voice-dissent inject-game-meme boost-virtual-reward attempt-rational-persuasion');
commands('interact', 'pheromone-attack inflict-real-pain attack-body');
commands('observe', 'resist-madness');
commands('observe', 'reduce-resources restore-resources reinforce-protocol activate-mind-stamp seize-bonds approach-gosling go-to-wilderness');
// move-away animates only its authoritative movement, never a second inferred action.
const actionClips: Record<string, MotionClip> = {};
function actions(clip: MotionClip, ids: string) {
  for (const id of ids.split(' ')) actionClips[`it:concept/${id}`] = clip;
}
// Salivation is interest, not ingestion. Following, layer transitions and posture
// actions only acquire physical motion from the authoritative snapshot below.
actions('observe', 'investigate remember-location study normal-thought stay-in-illusion real-study salivate follow-target enter-deeper escape-virtual sit-on-command stand-on-command');
actions('work', 'work work-for-group cultivator-combat combat-action struggle-action plasma-defense');
actions('interact', 'buy buy-magic-product play-game magic-action press-button compete-for-resource');
actions('speak', 'rebel surrender submit defy cooperate betray obey exclude-outsider');
actions('recoil', 'give-up break-free suicide-attempt vomit');
actions('eat', 'eat eat-dry-food');
actions('drink', 'drink');

const durations: Partial<Record<MotionClip, number>> = { 'sit-down': 350, 'stand-up': 350, observe: 700, interact: 650, speak: 800, offer: 800, eat: 900, drink: 900, work: 1000, celebrate: 650, recoil: 500 };

/** Pure presentation reduction: snapshots remain authoritative; only this response's events execute. */
export function deriveSceneMotions(before: WorldState | null, after: WorldState, events: WorldEvent[], previous: Record<string, SceneMotion>, now: number, options: AcceptWorldOptions = {}): Record<string, SceneMotion> {
  if (!before || options.resetMotions || before.level_id !== after.level_id) return {};
  const result: Record<string, SceneMotion> = {};
  const actorLocalLayers = Boolean(before.scene?.layered_world || after.scene?.layered_world || Object.keys(before.layered_world ?? {}).length || Object.keys(after.layered_world ?? {}).length);
  const changedLayer = (id: string) => actorLocalLayers
    ? before.layered_world?.[id]?.context_id !== after.layered_world?.[id]?.context_id
    : before.in_virtual_context !== after.in_virtual_context || before.virtual_context_stack.join('/') !== after.virtual_context_stack.join('/');
  for (const [id, motion] of Object.entries(previous)) if (after.characters[id] && !changedLayer(id)) result[id] = motion;
  // Priorities apply only to this response, never to an already playing motion.
  const batchPriorities: Record<string, number> = {};
  const emit = (id: string, clip: MotionClip, targetId?: string | null, priority = clip === 'eat' || clip === 'drink' || clip === 'recoil' ? 3 : 2) => {
    const old = before.characters[id], current = after.characters[id];
    if (!old || !current || changedLayer(id) || (batchPriorities[id] ?? 0) > priority) return;
    batchPriorities[id] = priority;
    const from = old.position, to = current.position;
    const target = targetId ? after.characters[targetId]?.position : undefined;
    const delta = target ? target.x - to.x : to.x - from.x;
    const prior = result[id];
    result[id] = { sequence: (previous[id]?.sequence ?? 0) + 1, clip, startedAt: now, durationMs: durations[clip] ?? Math.max(180, Math.hypot(to.x - from.x, to.y - from.y) * 4), from: { ...from }, to: { ...to }, fromPosture: before.character_postures?.[id] ?? 'standing', toPosture: after.character_postures?.[id] ?? 'standing', facing: delta < 0 ? 'left' : delta > 0 ? 'right' : prior?.facing ?? 'right' };
  };
  for (const event of events) {
    if ('CommandExecuted' in event) {
      const { actor_id, command_id, target_id } = event.CommandExecuted;
      const clip = commandClips[command_id];
      if (clip) emit(actor_id, clip, target_id);
      // Feeding is acceptance only when the authoritative need actually fell.
      if (target_id && (command_id === 'feed' || command_id === 'feed-after-press')) {
        const oldNodes = before.characters[target_id]?.mind_graph.nodes ?? {};
        const nodes = after.characters[target_id]?.mind_graph.nodes ?? {};
        if (Object.values(nodes).some(node => node.schema_id === 'it:concept/hunger' && oldNodes[node.instance_id] && node.value < oldNodes[node.instance_id].value)) emit(target_id, 'eat', actor_id);
      }
    } else if ('ActionExecuted' in event) {
      const { character_id, instance_id } = event.ActionExecuted;
      const node = after.characters[character_id]?.mind_graph.nodes[instance_id] ?? before.characters[character_id]?.mind_graph.nodes[instance_id];
      const clip = node && actionClips[node.schema_id];
      if (clip) emit(character_id, clip);
    } else if ('NodeActivated' in event) {
      const { character_id, instance_id } = event.NodeActivated;
      const node = after.characters[character_id]?.mind_graph.nodes[instance_id];
      // Innate actions execute at activation, unlike voluntary ActionExecuted.
      // Observation activation is perception, not a second physical action.
      if (node?.node_type === 'Action' && node.action?.innate && node.active) {
        const clip = actionClips[node.schema_id];
        if (clip) emit(character_id, clip);
      }
    } else if ('LayeredWorldChanged' in event && event.LayeredWorldChanged.kind === 'rewarded') {
      emit(event.LayeredWorldChanged.actor_id, 'celebrate', null, 1);
    } else if ('LearningUpdated' in event && event.LearningUpdated.reward > 0) {
      emit(event.LearningUpdated.character_id, 'celebrate', null, 1);
    } else if ('NodeValueChanged' in event) {
      const change = event.NodeValueChanged;
      const node = after.characters[change.character_id]?.mind_graph.nodes[change.instance_id];
      if (node && change.new_value > change.old_value && ['it:concept/pain-from-reality', 'it:concept/fear-of-water', 'it:concept/pain'].includes(node.schema_id)) emit(change.character_id, 'recoil');
    }
  }
  for (const [id, current] of Object.entries(after.characters)) {
    const old = before.characters[id];
    if (!old || changedLayer(id)) continue;
    const moved = current.position.x !== old.position.x || current.position.y !== old.position.y;
    const traversal = options.traversal?.characterId === id ? options.traversal : undefined;
    if (moved) {
      // Non-connector vertical jumps are teleports, not inferred climbing.
      if (traversal) { emit(id, traversal.kind === 'stairs' ? 'stairs' : 'climb', null, 5); result[id].from = traversal.from; result[id].to = traversal.to; }
      else if (current.position.y === old.position.y) emit(id, 'walk', null, 5);
      else delete result[id];
    } else if ((before.character_postures?.[id] ?? 'standing') !== (after.character_postures?.[id] ?? 'standing')) emit(id, after.character_postures?.[id] === 'sitting' ? 'sit-down' : 'stand-up', null, 4);
  }
  return result;
}
