import { describe, expect, it } from 'vitest';
import en from './locales/en-ui.json';
import zh from './locales/zh-CN-ui.json';
import enContent from '../../assets/i18n/en.json';
import zhContent from '../../assets/i18n/zh-cn.json';
import cyberCommandsSource from '../../assets/levels/cyber-dream/commands.jsonld?raw';

const placeholders = (value: string) => [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(match => match[1]).sort();

describe('UI translations', () => {
  it('provides translations for each known command rejection reason', () => {
    const reasons = [
      'unknown_command', 'preconditions_failed', 'no_effect_applied', 'character_not_found',
      'invalid_effect_value', 'movement_rejected', 'resource_not_found', 'invalid_resource_amount',
      'insufficient_resource', 'trade_party_not_found', 'asset_not_found', 'invalid_quantity',
      'room_memory_disabled', 'not_memory_observer', 'observer_missing', 'memory_drug_not_here',
      'memory_drug_already_active', 'room_not_observed', 'memory_drug_required_or_expired',
      'room_not_visible', 'room_already_anchored', 'invalid_memory_witness', 'memory_witness_not_here',
      'no_forgotten_revisit', 'no_unconfirmed_forgotten_revisit', 'invalid_trade_value',
      'seller_does_not_own_asset', 'insufficient_supply', 'insufficient_funds', 'self_trade',
      'action_credit_invalid',
    ];
    for (const catalog of [en, zh]) {
      for (const reason of reasons) {
        const key = `event.commandRejection.${reason}`;
        expect((catalog as Record<string, string>)[key]?.trim(), key).toBeTruthy();
      }
    }
  });
  it('resolves every authored cyber command label in both merged resource catalogs', () => {
    const commands = JSON.parse(cyberCommandsSource).commands as { commandId: string; label: string }[];
    expect(commands).toHaveLength(6);
    for (const catalog of [{ ...enContent, ...en }, { ...zhContent, ...zh }]) {
      for (const command of commands) {
        const label = (catalog as Record<string, string>)[command.label];
        expect(label, command.commandId).toBeTruthy();
        expect(label, command.commandId).not.toMatch(/^command\./);
        expect(label?.trim(), command.commandId).not.toBe('');
      }
    }
  });
  it('also translates every authored concept, command and level in English', () => {
    expect(Object.keys(enContent).sort()).toEqual(Object.keys(zhContent).sort());
    for (const key of Object.keys(zhContent) as (keyof typeof zhContent)[]) {
      expect(enContent[key].trim(), key).not.toBe('');
      expect(enContent[key], key).not.toMatch(/[\u3400-\u9fff]/);
      expect(placeholders(enContent[key]), key).toEqual(placeholders(zhContent[key]));
    }
  });
  it('provides the same keys and interpolation parameters in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const key of Object.keys(zh) as (keyof typeof zh)[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]));
    }
  });

  it('keeps the game name separate from the association-graph feature', () => {
    expect(zh['app.title']).toBe('实验犬的意义之塔');
    expect(en['app.title']).toBe('Experimental Dog’s Tower of Meaning');
    expect(zh['graph.title']).toContain('联结图谱');
  });

  it('localizes the notebook and side-view interaction controls', () => {
    expect(en['command.earn-virtual-reward.label']).toBe('Collect virtual point');
    expect(zh['command.earn-virtual-reward.label']).toBe('领取虚拟积分');
  });
});
