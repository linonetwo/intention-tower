/**
 * EventLog — bottom panel showing recent simulation events with filter tabs.
 */
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { t as translateLabel } from '../../i18n';
import { eventType, eventPayload, type WorldEvent } from '../../types/backend';
import type { WorldState } from '../../types/backend';

type EventCategory = 'all' | 'command' | 'node' | 'edge' | 'resource' | 'env';

function eventCategory(ev: WorldEvent): EventCategory {
  const type = eventType(ev);
  if (type === 'CommandExecuted') return 'command';
  if (type.startsWith('Node') || type === 'ThresholdCrossed') return 'node';
  if (type.startsWith('Edge')) return 'edge';
  if (type === 'ResourceConsumed') return 'resource';
  return 'env';
}

function formatEvent(ev: WorldEvent, worldState: WorldState | null): { icon: string; text: string; color: string } {
  const type = eventType(ev);
  const data = eventPayload(ev);

  const charName = (id: string) => {
    const c = worldState?.characters[id as string];
    return c ? translateLabel(c.label) : String(id);
  };

  const nodeName = (charId: string, instanceId: string) => {
    const node = worldState?.characters[charId]?.mind_graph.nodes[instanceId];
    return node ? translateLabel(node.label) : String(instanceId);
  };

  switch (type) {
    case 'NodeValueChanged': {
      const oldVal = (data.old_value as number).toFixed(2);
      const newVal = (data.new_value as number).toFixed(2);
      const delta = (data.new_value as number) - (data.old_value as number);
      const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
      return {
        icon: delta > 0 ? '📈' : delta < 0 ? '📉' : '📊',
        text: `${charName(data.character_id as string)}: ${nodeName(data.character_id as string, data.instance_id as string)} ${oldVal} ${arrow} ${newVal}`,
        color: delta > 0 ? '#81c784' : delta < 0 ? '#e57373' : '#aaa',
      };
    }
    case 'NodeSpawned':
      return { icon: '✨', text: `${charName(data.character_id as string)}: +${nodeName(data.character_id as string, data.instance_id as string)}`, color: '#66bb6a' };
    case 'NodeDespawned':
      return { icon: '💨', text: `${charName(data.character_id as string)}: -${String(data.instance_id)}`, color: '#ef5350' };
    case 'NodeActivated':
      return { icon: '⚡', text: `${charName(data.character_id as string)}: ${nodeName(data.character_id as string, data.instance_id as string)} ${translateLabel('event.activated')}`, color: '#42a5f5' };
    case 'NodeDeactivated':
      return { icon: '💤', text: `${charName(data.character_id as string)}: ${nodeName(data.character_id as string, data.instance_id as string)} ${translateLabel('event.deactivated')}`, color: '#888' };
    case 'EdgeCreated': {
      const srcLabel = nodeName(data.character_id as string, data.source_id as string);
      const tgtLabel = nodeName(data.character_id as string, data.target_id as string);
      return { icon: '🔗', text: `${charName(data.character_id as string)}: ${srcLabel} → ${tgtLabel} (w:${(data.weight as number).toFixed(2)})`, color: '#66bb6a' };
    }
    case 'EdgeWeightChanged': {
      const ow = (data.old_weight as number).toFixed(2);
      const nw = (data.new_weight as number).toFixed(2);
      const wd = (data.new_weight as number) - (data.old_weight as number);
      return { icon: wd > 0 ? '🔺' : '🔻', text: `${charName(data.character_id as string)}: ${String(data.edge_id)} ${ow} → ${nw}`, color: wd > 0 ? '#ffa726' : '#ff7043' };
    }
    case 'EdgeRemoved':
      return { icon: '✂️', text: `${charName(data.character_id as string)}: ${translateLabel('event.edgeRemoved')} ${String(data.edge_id)}`, color: '#ef5350' };
    case 'ResourceConsumed':
      return { icon: '💧', text: `${charName(data.character_id as string)}: ${String(data.resource_schema_id)} -${(data.amount as number).toFixed(2)} (${(data.remaining as number).toFixed(2)})`, color: '#ab47bc' };
    case 'CommandExecuted':
      return { icon: '🎮', text: `${charName(data.actor_id as string)}: ${String(data.command_id)}${data.target_id ? ` → ${charName(data.target_id as string)}` : ''}`, color: '#42a5f5' };
    case 'SoundEmitted':
      return { icon: '🔔', text: `🔊 ${String(data.about)} (${String(data.modality)})`, color: '#ffa726' };
    case 'FoodPresented':
      return { icon: '🍖', text: `🍽️ ${String(data.about)}`, color: '#ffa726' };
    case 'ThresholdCrossed':
      return { icon: '📐', text: `${charName(data.character_id as string)}: ⚡${String(data.trigger_id)} (${String(data.direction)})`, color: '#ab47bc' };
    default:
      return { icon: '❓', text: JSON.stringify(data), color: '#666' };
  }
}

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: 'all', label: 'event.filter.all' },
  { key: 'command', label: 'event.filter.command' },
  { key: 'node', label: 'event.filter.node' },
  { key: 'edge', label: 'event.filter.edge' },
  { key: 'resource', label: 'event.filter.resource' },
  { key: 'env', label: 'event.filter.env' },
];

export const EventLog: React.FC = () => {
  const { t } = useTranslation();
  const recentEvents = useGameState((s) => s.recentEvents);
  const worldState = useGameState((s) => s.worldState);
  const [filter, setFilter] = useState<EventCategory>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(() => {
    if (filter === 'all') return recentEvents;
    return recentEvents.filter((ev) => eventCategory(ev) === filter);
  }, [recentEvents, filter]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filtered.length, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAutoScroll(el.scrollTop < 10);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 0.5, px: 1, py: 0.4, borderBottom: '1px solid #1e1e36', flexShrink: 0, alignItems: 'center' }}>
        {CATEGORIES.map(({ key, label }) => (
          <Chip
            key={key}
            label={t(label)}
            size='small'
            onClick={() => setFilter(key)}
            sx={{
              height: 20,
              fontSize: 10,
              bgcolor: filter === key ? 'rgba(100,100,255,0.25)' : 'rgba(255,255,255,0.04)',
              color: filter === key ? '#c5cae9' : '#888',
              cursor: 'pointer',
            }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 9, color: '#555' }}>
          {filtered.length} / {recentEvents.length}
        </Typography>
      </Box>

      {/* Events */}
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 1,
          py: 0.5,
          fontFamily: 'monospace',
        }}
      >
        {filtered.length === 0 && (
          <Typography sx={{ fontSize: 11, color: '#555', textAlign: 'center', py: 1 }}>
            {t('event.empty')}
          </Typography>
        )}
        {filtered.map((ev, idx) => {
          const { icon, text, color } = formatEvent(ev, worldState);
          const evKey = `${eventType(ev)}-${idx}`;
          return (
            <Box key={evKey} sx={{ display: 'flex', gap: 0.5, py: 0.15, lineHeight: 1.3 }}>
              <Typography sx={{ fontSize: 11, flexShrink: 0 }}>{icon}</Typography>
              <Typography sx={{ fontSize: 11, color, wordBreak: 'break-word' }}>{text}</Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
