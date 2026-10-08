import { describe, expect, it } from 'vitest';
import en from './locales/en-ui.json';
import zh from './locales/zh-CN-ui.json';
import enContent from '../../assets/i18n/en.json';
import zhContent from '../../assets/i18n/zh-cn.json';

const placeholders = (value: string) => [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(match => match[1]).sort();

describe('UI translations', () => {
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
    for (const key of ['game.notebook', 'scene.moveLeft', 'scene.moveRight', 'scene.selectTarget', 'scene.sit', 'scene.stand', 'scene.traverse', 'scene.missingArt'] as const) {
      expect(en[key]).toBeTruthy();
      expect(zh[key]).toBeTruthy();
    }
  });
});
