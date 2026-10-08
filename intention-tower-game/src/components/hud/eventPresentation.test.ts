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
  const rejectionReasons = [
    'unknown_command', 'preconditions_failed', 'no_effect_applied', 'character_not_found',
    'invalid_effect_value', 'movement_rejected', 'resource_not_found', 'invalid_resource_amount',
    'insufficient_resource', 'trade_party_not_found', 'asset_not_found', 'invalid_quantity',
    'invalid_trade_value', 'seller_does_not_own_asset', 'insufficient_supply', 'insufficient_funds', 'self_trade',
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
