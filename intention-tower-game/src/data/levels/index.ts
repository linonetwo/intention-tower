/**
 * 关卡索引
 */
import { goslingImprintingLevel } from './goslingImprinting';
import { pavlovsDogLevel } from './pavlovsDog';

export const levels = [pavlovsDogLevel, goslingImprintingLevel];

export function getLevelById(id: string) {
  return levels.find((level) => level.id === id);
}
