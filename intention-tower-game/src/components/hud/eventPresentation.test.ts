import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '../../i18n';
import type { WorldState } from '../../types/backend';
import { objectName, presentEvent } from './eventPresentation';

const world = {
  characters: { dog: { id: 'dog', label: 'Dog', mind_graph: { nodes: {
    bell: { instance_id: 'bell', schema_id: 'it:concept/hear-metronome', label: 'Bell', node_type: 'Observation' },
    emergent: { instance_id: 'emergent', schema_id: 'it:emergent/test', label: 'it:emergent/test', node_type: 'Meme' },
  } } } },
  command_defs: [{ command_id: 'ring-bell', label: 'Ring Bell' }], items: {},
} as unknown as WorldState;
afterEach(async () => { await i18n.changeLanguage('zh-CN'); });

describe('human-readable event presentation', () => {
  it.each(['zh-CN', 'en'])('uses historical layered facts, contexts and meal receipts in %s', async language => {
    await i18n.changeLanguage(language);
    const changed = { ...world, layered_world: { dog: { context_id: 'reality', observations: {}, need_receipt: { before: .7, after: .1 } } } } as unknown as WorldState;
    const observed = presentEvent({ LayeredWorldChanged: { actor_id: 'dog', context_id: 'inner', depth: 2, kind: 'observed', fact: { sequence: 5, id: 'old', context_id: 'inner', room_id: 'inner-archive', item_id: 'inner-cue', position: { x: 4300, y: 300 }, fact: 'layer.fact.inner', depth: 2, is_virtual: true, observed_at_tick: 5 } } }, changed);
    expect(observed.text).toContain(i18n.t('layer.context.inner'));
    expect(observed.text).toContain(i18n.t('layer.fact.inner'));
    const meal = presentEvent({ LayeredWorldChanged: { actor_id: 'dog', context_id: 'reality', depth: 0, kind: 'need_satisfied', fact: { sequence: 9, item_id: 'meal', room_id: 'garden', position: { x: 1300, y: 300 }, before: .9, after: .2, satisfied_at_tick: 8 } } }, changed);
    expect(meal.text).toContain('0.90'); expect(meal.text).toContain('0.20');
    for (const kind of ['entered', 'returned', 'observed', 'compared', 'rewarded', 'need_satisfied', 'migrated', 'future_kind']) {
      expect(presentEvent({ LayeredWorldChanged: { actor_id: 'dog', context_id: 'outer', depth: 1, kind, fact: null } }, changed).text).not.toMatch(/event\.|future_kind|layer\./);
    }
  });
  it.each(['zh-CN', 'en'])('names all room-memory changes and existing observation contents without raw IDs in %s', async language => {
    await i18n.changeLanguage(language);
    const scene = { ...world, characters: { agent: { id: 'agent', label: 'Agent', mind_graph: { nodes: { location: { instance_id: 'location', schema_id: 'it:concept/memory-of-location', label: 'Memory', node_type: 'Observation', observation: { about: 'it:room/archive/variant/maproom' } } } } } }, scene: { rooms: [{ id: 'archive', label: 'room.antimeme.archive' }] }, character_rooms: { agent: 'archive' }, room_memory: { agent: { drug_until_tick: 50 } } } as unknown as WorldState;
    const kinds = ['room_observed', 'room_left', 'room_fading', 'room_forgotten', 'forgotten_room_revisited', 'room_anchored', 'anchored_room_revisited', 'memory_drug_taken', 'memory_drug_expired', 'witness_you_forgot_this_place', 'room_investigated', 'future_memory_change'];
    for (const kind of kinds) {
      const result = presentEvent({ RoomMemoryChanged: { observer_id: 'agent', room_id: 'archive', variant_id: 'maproom', drug_ticks_remaining: 40, kind, tick: 10 } }, scene);
      expect(result.text).toContain('Agent');
      expect(result.text).not.toMatch(/event\.|observer_id|future_memory_change|room_observed|it:/);
      if (kind === 'witness_you_forgot_this_place') expect(result.text).toContain(language === 'en' ? 'You simply forgot' : '你只是忘记了');
      if (kind === 'memory_drug_taken') { expect(result.text).toContain('40'); expect(result.text).toContain(language === 'en' ? 'drug alone' : '仅服药'); }
    }
    const name = objectName(scene, 'location');
    expect(name).not.toContain(i18n.t('room.antimeme.archive'));
    expect(name).toContain(i18n.t('memory.variant.maproom'));
    expect(objectName(scene, 'it:room/archive/variant/maproom')).toBe(name);
    expect(objectName(scene, 'it:room/conservatory/variant/archive')).toBe(i18n.t('event.unknownObject'));
  });
  it('keeps historical room identity and medicine duration after later regeneration or dosing', () => {
    const changed = { ...world, room_memory: { agent: { drug_until_tick: 200, rooms: { archive: { variant_id: 'archive' } } } } } as unknown as WorldState;
    const event = { RoomMemoryChanged: { observer_id: 'agent', room_id: 'archive', variant_id: 'maproom', drug_ticks_remaining: 40, kind: 'room_fading', tick: 10 } };
    expect(presentEvent(event, changed).text).toContain(i18n.t('memory.variant.maproom'));
    expect(presentEvent(event, changed).text).not.toContain(i18n.t('memory.variant.archive'));
    expect(presentEvent({ RoomMemoryChanged: { ...event.RoomMemoryChanged, kind: 'memory_drug_taken' } }, changed).text).toContain('40');
    const legacy = presentEvent({ RoomMemoryChanged: { observer_id: 'agent', room_id: 'archive', kind: 'room_fading', tick: 10 } }, changed);
    expect(legacy.text).toContain(i18n.t('memory.location'));
    expect(legacy.text).not.toContain(i18n.t('memory.variant.archive'));
  });
  const rejectionReasons = [
    'unknown_command', 'preconditions_failed', 'no_effect_applied', 'character_not_found',
    'invalid_effect_value', 'movement_rejected', 'resource_not_found', 'invalid_resource_amount',
    'insufficient_resource', 'trade_party_not_found', 'asset_not_found', 'invalid_quantity',
    'room_memory_disabled', 'not_memory_observer', 'observer_missing', 'memory_drug_not_here', 'memory_drug_already_active', 'room_not_observed', 'memory_drug_required_or_expired', 'room_not_visible', 'room_already_anchored', 'invalid_memory_witness', 'memory_witness_not_here', 'no_forgotten_revisit', 'no_unconfirmed_forgotten_revisit',
    'invalid_trade_value', 'seller_does_not_own_asset', 'insufficient_supply', 'insufficient_funds', 'self_trade', 'action_credit_invalid',
  ];
  it.each(['zh-CN', 'en'])('localizes every rejection reason in %s', async (language) => {
    await i18n.changeLanguage(language);
    for (const reason of rejectionReasons) {
      const { text, icon } = presentEvent({ CommandRejected: {
        actor_id: 'dog', command_id: 'ring-bell', target_id: null, reason,
      } }, world);
      expect(text).toContain('Dog');
      expect(text).toContain('Ring Bell');
      expect(text).toContain(i18n.t(`event.commandRejection.${reason}`));
      expect(text).not.toContain(reason);
      expect(text).not.toContain('event.');
      expect(icon).toBe('⚠️');
    }
  });
  it('uses a readable fallback for unknown rejection reasons and command IDs', () => {
    const { text } = presentEvent({ CommandRejected: {
      actor_id: 'dog', command_id: 'missing-command', target_id: null, reason: 'future_reason',
    } }, world);
    expect(text).toContain(i18n.t('event.commandName'));
    expect(text).toContain(i18n.t('event.commandRejection.unknown'));
    expect(text).not.toContain('future_reason');
    expect(text).not.toContain('missing-command');
  });
  it('distinguishes an executed need-driven action from mere selection', () => {
    const { text } = presentEvent({ ActionExecuted: { character_id: 'dog', instance_id: 'bell', executed_at: 5, autonomous: true } }, world);
    expect(text).toContain('自身需求');
    expect(text).toContain('Bell');
    expect(text).not.toContain('ActionExecuted');
  });
  it('names dormant nodes instead of exposing enum names', () => {
    const { text } = presentEvent({ NodeDeactivated: { character_id: 'dog', instance_id: 'bell' } }, world);
    expect(text).toContain('Bell');
    expect(text).toContain('休眠');
    expect(text).not.toContain('NodeDeactivated');
  });

  it.each(['zh-CN', 'en'])('names the actual exclusion actor, target and consequence in %s', async language => {
    await i18n.changeLanguage(language);
    const episode = { action_id: 'exclude', executed_at: 7, physical_outcome: {
      type: 'SocialExclusion', target_character_id: 'outsider', target_need_schema_id: 'it:concept/loneliness', from: .1, to: .3,
    } };
    const scene = { characters: {
      tim: { id: 'tim', label: 'Tim', mind_graph: { nodes: {}, action_episodes: [episode] } },
      outsider: { id: 'outsider', label: 'Classmate', mind_graph: { nodes: {} } },
    }, items: {} } as unknown as WorldState;
    const event = { ActionExecuted: { character_id: 'tim', instance_id: 'exclude', executed_at: 7, autonomous: false } };
    const result = presentEvent(event, scene);
    expect(result.text).toContain('Tim');
    expect(result.text).toContain('Classmate');
    expect(result.text).toContain('0.20');
    expect(result.text).toContain(i18n.t('concept.loneliness.label'));
    expect(result.text).not.toContain('SocialExclusion');
    expect(result.text).not.toContain('it:');
    // An older generic event must not borrow a later outcome with the same action ID.
    expect(presentEvent({ ActionExecuted: { ...event.ActionExecuted, executed_at: 6 } }, scene).text).not.toContain('Classmate');
  });

  it('hides raw schema and missing instance IDs and labels actual commands', () => {
    expect(objectName(world, 'emergent')).toBe('新形成的模因');
    expect(objectName(world, 'obs_it_concept_missing')).toBe('观察内容');
    expect(presentEvent({ SoundEmitted: { source_entity_id: 'dog', about: 'it:concept/hear-metronome', modality: 'Auditory' } }, world).text).not.toContain('it:');
    expect(presentEvent({ CommandExecuted: { actor_id: 'dog', command_id: 'ring-bell', target_id: null } }, world).text).toContain('Ring Bell');
  });

  it('uses English event copy when the language changes', async () => {
    await i18n.changeLanguage('en');
    expect(presentEvent({ NodeDeactivated: { character_id: 'dog', instance_id: 'bell' } }, world).text).toContain('Dormant');
    expect(presentEvent({ LevelWon: { level_id: 'pavlov', tick: 72 } }, world).text).toBe('Level complete');
  });
});
