import React from 'react';
import { useTranslation } from 'react-i18next';
import { translateLabel } from '../../i18n';
import type { CommandDef, WorldState } from '../../types/backend';

export const layerControlStyle: React.CSSProperties = { minWidth: 44, minHeight: 44, border: '1px solid #b79861', borderRadius: 12, padding: '6px 10px', color: '#654c2b', background: '#fff7e7ee', cursor: 'pointer', fontSize: 12 };

/** Positions and command availability come from the same authoritative snapshot. */
export function layeredHotspots(world: WorldState, actorId: string, roomId: string) {
  const config = world.scene?.layered_world;
  const state = world.layered_world?.[actorId];
  const context = config?.contexts.find(c => c.id === state?.context_id);
  if (!config || !context || !state) return [];
  return [
    { itemId: context.entry_item_id, commands: ['enter-vr'], kind: 'enter' },
    { itemId: context.return_item_id, commands: ['exit-vr'], kind: 'return' },
    { itemId: context.cue_item_id, commands: ['examine-reality', ...(state.stack.length ? ['earn-virtual-reward'] : [])], kind: 'inspect' },
    ...(state.stack.length ? [] : [{ itemId: config.meal_item_id, commands: ['satisfy-real-need'], kind: 'meal' }]),
  ].flatMap(marker => {
    const item = marker.itemId ? world.items[marker.itemId] : undefined;
    return item && world.item_rooms?.[item.id] === roomId ? [{ ...marker, item }] : [];
  });
}

export const LayeredWorldStatus: React.FC<{ world: WorldState; actorId: string; notes: boolean; height?: number; available: CommandDef[]; execute: (id: string) => void }> = ({ world, actorId, notes, height, available, execute }) => {
  const { t } = useTranslation();
  const config = world.scene?.layered_world;
  const state = world.layered_world?.[actorId];
  if (!config || !state) return null;
  const hunger = Object.values(world.characters[actorId]?.mind_graph.nodes ?? {}).find(n => n.schema_id === config.need_schema_id)?.value;
  const path = [...state.stack.map(frame => frame.context_id), state.context_id];
  if (!notes) return <div data-testid="layer-context-status" aria-live="polite" style={{ position: 'absolute', top: 12, left: 72, right: 12, zIndex: 710, color: '#654c2b', fontSize: 12, pointerEvents: 'none' }}>
    <span style={{ display: 'inline-block', borderRadius: 12, padding: '6px 10px', background: '#fff7e7ed' }}>{path.map(id => t(`layer.context.${id}`)).join(' › ')} · {t('layer.depth', { depth: state.stack.length })}<br />{t('layer.hunger', { value: hunger == null ? '—' : hunger.toFixed(2) })} · {t('layer.points', { count: state.rewards[state.context_id] ?? 0 })}</span>
    {world.layered_world_migration && <p role="status" data-testid="layer-migration-notice" style={{ maxWidth: 540, margin: '4px 0', padding: '5px 9px', borderRadius: 10, background: '#fff2cfef' }}>{t('layer.migration.legacy-reset')}</p>}
  </div>;
  return <section data-testid="layer-notebook" aria-label={t('layer.notebook')} style={{ height, overflowY: 'auto', padding: '8px 12px', boxSizing: 'border-box', border: '1px solid #c7ab78', borderRadius: 12, background: '#fff5dff5', color: '#654c2b', fontSize: 12 }}>
    <strong>{t('layer.notebook')}</strong>
    {world.layered_world_migration && <p>{t('layer.migration.legacy-reset')}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{config.contexts.map(context => {
      const observation = state.observations[context.id];
      return <div key={context.id} data-testid={`layer-note-${context.id}`} style={{ flex: '1 1 130px', padding: 6, background: '#fffaf0', borderRadius: 8 }}><span>{t(`layer.context.${context.id}`)} · {t(observation ? 'layer.observed' : 'layer.unobserved')}</span>{observation && <p style={{ margin: '4px 0' }}>{translateLabel(observation.fact)}</p>}</div>;
    })}</div>
    <p style={{ margin: '6px 0' }}>{t('layer.rewardExplanation')}</p>
    {state.comparison && <p data-testid="layer-comparison" style={{ margin: '6px 0' }}>{t('layer.comparisonRecorded')}</p>}
    {available.filter(command => command.command_id === 'compare-layers').map(command => <button key={command.command_id} style={layerControlStyle} onClick={() => execute(command.command_id)}>{translateLabel(command.label)}</button>)}
    {state.need_receipt && <p data-testid="layer-meal-receipt">{t('layer.mealReceipt', { before: state.need_receipt.before.toFixed(2), after: state.need_receipt.after.toFixed(2) })}</p>}
  </section>;
};

export const LayeredWorldHotspots: React.FC<{ world: WorldState; actorId: string; roomId: string; available: CommandDef[]; cameraX: number; scale: number; ground: number; width: number; enabled: boolean; execute: (id: string) => void; walkTo: (x: number) => void }> = ({ world, actorId, roomId, cameraX, scale, ground, width, enabled, walkTo }) => {
  const { t } = useTranslation();
  return <>{layeredHotspots(world, actorId, roomId).map(marker => {
    const x = marker.item.position.x * scale + cameraX;
    // Do not pin off-screen terminals to the viewport: their world position matters.
    if (x < -30 || x > width + 30) return null;
    return <div key={marker.item.id} data-testid={`layer-hotspot-${marker.item.id}`} data-world-x={marker.item.position.x} style={{ position: 'absolute', left: x, top: ground - 70, transform: 'translateX(-50%)', zIndex: 200, pointerEvents: 'auto' }}>
      <button style={{ ...layerControlStyle, maxWidth: 120 }} disabled={!enabled} onClick={() => walkTo(marker.item.position.x)} aria-label={t('layer.approach', { object: translateLabel(marker.item.label) })}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}><rect x="3" y="2" width="18" height="15" rx="3" fill={marker.kind === 'return' ? '#d9b98a' : '#a8c6ae'} stroke="#765c3a" /><path d="M8 21h8M12 17v4M8 8h8M8 11h5" stroke="#765c3a" strokeWidth="2" /></svg>{translateLabel(marker.item.label)}
      </button>
    </div>;
  })}</>;
};

/** A reserved floor rail, never an overlay on the character or an overflow carousel. */
export const LayeredWorldActionRail: React.FC<{ world: WorldState; actorId: string; roomId: string; available: CommandDef[]; bottom: number; height: number; enabled: boolean; execute: (id: string) => void }> = ({ world, actorId, roomId, available, bottom, height, enabled, execute }) => {
  const { t } = useTranslation();
  const local = new Set(layeredHotspots(world, actorId, roomId).flatMap(marker => marker.commands));
  const commands = available.filter(command => local.has(command.command_id) || command.command_id === 'compare-layers');
  return <div data-testid="layer-action-rail" aria-label={t('layer.nearbyActions')} style={{ position: 'absolute', left: 8, right: 8, bottom, height, display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 4, zIndex: 730 }}>
    {commands.length ? commands.map(command => <button key={command.command_id} data-testid={`layer-action-${command.command_id}`} style={{ ...layerControlStyle, flex: '0 1 auto', maxWidth: '100%', lineHeight: 1.25 }} disabled={!enabled} onClick={() => execute(command.command_id)}>{translateLabel(command.label)}</button>) : <span style={{ alignSelf: 'center', color: '#755731', fontSize: 12 }}>{t('layer.approachHint')}</span>}
  </div>;
};
