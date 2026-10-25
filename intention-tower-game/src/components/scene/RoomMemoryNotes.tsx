import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateLabel } from '../../i18n';
import type { WorldState } from '../../types/backend';
import { primaryRoomMemory, roomMemoryDrugTicks, roomMemoryPresentation } from './roomMemory';

export const RoomMemoryNotes: React.FC<{ world: WorldState; height: number }> = ({ world, height }) => {
  const { t } = useTranslation();
  const [detailRoom, setDetailRoom] = useState<string | null>(null);
  const { observerId } = primaryRoomMemory(world);
  const currentRoom = observerId ? world.character_rooms?.[observerId] : undefined;
  const config = world.scene?.room_memory;
  return <section data-testid="room-memory-notes" aria-label={t('memory.notes')} style={{ height, overflowY: 'auto', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #c7ab78', borderRadius: 12, background: '#fff5dfee', color: '#715634', fontSize: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}><span>{t('memory.notes')}</span><span data-testid="memory-drug-remaining">{t('memory.drugRemaining', { ticks: roomMemoryDrugTicks(world) })}</span></div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{(world.scene?.rooms ?? []).map(room => {
      const view = roomMemoryPresentation(world, room);
      const selected = detailRoom === room.id;
      const label = view.hidden ? t('memory.phase.' + view.phase) : translateLabel(room.label);
      return <button key={room.id} data-testid={`memory-map-room-${room.id}`} aria-pressed={selected} onClick={() => setDetailRoom(selected ? null : room.id)} style={{ minWidth: 44, minHeight: 44, flex: '1 1 100px', padding: '6px 8px', border: `1px solid ${currentRoom === room.id ? '#a98042' : '#d4bf98'}`, borderRadius: 9, color: '#715634', background: currentRoom === room.id ? '#f5dfac' : '#fff9eb', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'block' }}>{currentRoom === room.id ? '◉ ' : '○ '}{label}</span>
        <span style={{ display: 'block', fontSize: 11 }}>{t(`memory.phase.${view.anchored ? 'anchored' : view.phase}`)}{currentRoom === room.id ? ` · ${t('memory.youAreHere')}` : ''}</span>
        {!view.hidden && view.entry && <span style={{ display: 'block', fontSize: 11 }}>{t(`memory.variant.${view.entry.variant_id}`, { defaultValue: view.entry.variant_id })}</span>}
        {selected && <span style={{ display: 'block', marginTop: 4 }}>{t('memory.visits', { count: view.entry?.visit_count ?? 0 })}</span>}
      </button>;
    })}</div>
    <p style={{ margin: '8px 0 0', lineHeight: 1.5 }}>{t('memory.stepHint', { fade: config?.fade_after_ticks, forget: config?.forget_after_ticks })}</p>
    <p style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{t('memory.drugHint')}</p>
  </section>;
};
