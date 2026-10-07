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
