import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { NodeType } from '../types/backend';
import enBase from '../../assets/i18n/en.json';
import zhCNBase from '../../assets/i18n/zh-cn.json';
import enUI from './locales/en-ui.json';
import zhCNUI from './locales/zh-CN-ui.json';

const resources = {
  'zh-CN': {
    translation: {
      ...(zhCNBase as Record<string, string>),
      ...(zhCNUI as Record<string, string>),
    },
  },
  en: {
    translation: {
      ...(enBase as Record<string, string>),
      ...(enUI as Record<string, string>),
    },
  },
} as const;

const savedLanguage = localStorage.getItem('it-language');

if (!i18next.isInitialized) {
  i18next
    .use(initReactI18next)
    .init({
      resources,
      lng: savedLanguage || 'zh-CN',
      fallbackLng: 'zh-CN',
      interpolation: { escapeValue: false },
    });
}

export const i18n = i18next;

export function setLanguage(language: 'zh-CN' | 'en') {
  i18next.changeLanguage(language);
  localStorage.setItem('it-language', language);
}

function schemaIdToLabelKey(schemaLike: string): string | null {
  if (!schemaLike.startsWith('it:')) return null;
  if (schemaLike.startsWith('it:concept/')) {
    return `concept.${schemaLike.slice('it:concept/'.length)}.label`;
  }
  if (schemaLike.startsWith('it:node-type/')) {
    return `node-type.${schemaLike.slice('it:node-type/'.length)}.label`;
  }
  if (schemaLike.startsWith('it:quadrant/')) {
    return `quadrant.${schemaLike.slice('it:quadrant/'.length)}.label`;
  }
  if (schemaLike.startsWith('it:level/')) {
    return `level.${schemaLike.slice('it:level/'.length)}.name`;
  }
  return null;
}

export function translateLabel(raw: string): string {
  if (!raw) return '';

  if (raw.includes('.') && i18next.exists(raw)) {
    return i18next.t(raw);
  }

  const mappedKey = schemaIdToLabelKey(raw);
  if (mappedKey && i18next.exists(mappedKey)) {
    return i18next.t(mappedKey);
  }

  return raw;
}

export function nodeTypeLabel(nodeType: NodeType): string {
  const keyByType: Record<NodeType, string> = {
    Observation: 'node-type.observation.label',
    PriorInstinct: 'node-type.prior-instinct.label',
    Motivation: 'node-type.motivation.label',
    Action: 'node-type.action.label',
    Meme: 'node-type.meme.label',
  };
  return i18next.t(keyByType[nodeType]);
}

export function t(key: string, options?: Record<string, unknown>): string {
  if (!key) return '';
  if (i18next.exists(key)) return i18next.t(key, options);
  return translateLabel(key);
}
