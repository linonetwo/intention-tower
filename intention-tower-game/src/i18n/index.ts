/**
 * Minimal i18n resolver.
 * Loads zh-cn.json and resolves i18n keys to display strings.
 */
import zhCN from '../../assets/i18n/zh-cn.json';

const translations: Record<string, string> = zhCN as Record<string, string>;

/**
 * Translate an i18n key. Returns the translated string or the key itself as fallback.
 * Handles nested concept keys like "concept.attention.label".
 */
export function t(key: string): string {
  if (!key) return '';
  const result = translations[key];
  if (result) return result;
  // If key doesn't look like an i18n key (no dots), return as-is
  if (!key.includes('.')) return key;
  return key;
}

/**
 * Check if a string looks like an i18n key.
 */
export function isI18nKey(s: string): boolean {
  return s.includes('.') && s.includes('/') === false && s.startsWith('it:') === false;
}
