/**
 * EventLog — bottom panel showing recent simulation events.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { t as translateLabel } from '../../i18n';
import { eventType, eventPayload, type WorldEvent } from '../../types/backend';
import type { WorldState } from '../../types/backend';

function formatEvent(ev: WorldEvent, worldState: WorldState | null): { icon: string; text: string; color: string } {
  const type = eventType(ev);
  const data = eventPayload(ev);

  const charName = (id: string) => {
    const c = worldState?.characters[id as string];
    return c ? translateLabel(c.label) : String(id);
  };

  switch (type) {
    case 'NodeValueChanged': {
      const oldVal = (data.old_value as number).toFixed(2);
      const newVal = (data.new_value as number).toFixed(2);
      const node = worldState?.characters[data.character_id as string]?.mind_graph.nodes[data.instance_id as string];
      const label = node ? translateLabel(node.label) : String(data.instance_id);
      return { icon: '📊', text: `${charName(data.character_id as string)}: ${label} ${oldVal} → ${newVal}`, color: '#aaa' };
    }
    case 'NodeSpawned':
      return { icon: '✨', text: `${charName(data.character_id as string)}: 新节点 ${data.instance_id}`, color: '#66bb6a' };
    case 'NodeDespawned':
      return { icon: '💨', text: `${charName(data.character_id as string)}: 移除 ${data.instance_id}`, color: '#ef5350' };
    case 'NodeActivated':
      return { icon: '⚡', text: `${charName(data.character_id as string)}: 激活 ${data.instance_id}`, color: '#42a5f5' };
    case 'NodeDeactivated':
      return { icon: '💤', text: `${charName(data.character_id as string)}: 休眠 ${data.instance_id}`, color: '#888' };
    case 'EdgeCreated':
      return { icon: '🔗', text: `${charName(data.character_id as string)}: 新边 ${data.source_id} → ${data.target_id} (w:${(data.weight as number).toFixed(2)})`, color: '#66bb6a' };
    case 'EdgeWeightChanged': {
      const ow = (data.old_weight as number).toFixed(2);
      const nw = (data.new_weight as number).toFixed(2);
      return { icon: '📈', text: `${charName(data.character_id as string)}: 边权 ${data.edge_id} ${ow} → ${nw}`, color: '#ffa726' };
    }
    case 'EdgeRemoved':
      return { icon: '✂️', text: `${charName(data.character_id as string)}: 断边 ${data.edge_id}`, color: '#ef5350' };
    case 'ResourceConsumed':
      return { icon: '💧', text: `${charName(data.character_id as string)}: 消耗 ${data.resource_schema_id} -${(data.amount as number).toFixed(2)} (剩${(data.remaining as number).toFixed(2)})`, color: '#ab47bc' };
    case 'CommandExecuted':
      return { icon: '🎮', text: `${charName(data.actor_id as string)} 执行命令: ${data.command_id}${data.target_id ? ` → ${charName(data.target_id as string)}` : ''}`, color: '#42a5f5' };
    case 'SoundEmitted':
      return { icon: '🔔', text: `声音: ${data.about} (${data.modality}) 来自 ${data.source_entity_id}`, color: '#ffa726' };
    case 'FoodPresented':
      return { icon: '🍖', text: `食物出现: ${data.about} 来自 ${data.source_entity_id}`, color: '#ffa726' };
    case 'ThresholdCrossed':
      return { icon: '📐', text: `${charName(data.character_id as string)}: 阈值触发 ${data.trigger_id} (${data.direction})`, color: '#ab47bc' };
    default:
      return { icon: '❓', text: JSON.stringify(data), color: '#666' };
  }
}

export const EventLog: React.FC = () => {
  const { t } = useTranslation();
  const recentEvents = useGameState((s) => s.recentEvents);
  const worldState = useGameState((s) => s.worldState);

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        px: 1,
        py: 0.5,
        fontFamily: 'monospace',
      }}
    >
      {recentEvents.length === 0 && (
        <Typography sx={{ fontSize: 11, color: '#555', textAlign: 'center', py: 1 }}>
          {t('event.empty')}
        </Typography>
      )}
      {recentEvents.map((ev, idx) => {
        const { icon, text, color } = formatEvent(ev, worldState);
        return (
          <Box key={idx} sx={{ display: 'flex', gap: 0.5, py: 0.1, lineHeight: 1.3 }}>
            <Typography sx={{ fontSize: 11, flexShrink: 0 }}>{icon}</Typography>
            <Typography sx={{ fontSize: 11, color, wordBreak: 'break-word' }}>{text}</Typography>
          </Box>
        );
      })}
    </Box>
  );
};
