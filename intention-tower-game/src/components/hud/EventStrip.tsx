/**
 * EventStrip — compact single-line event scroller, sits above the dialogue box.
 */
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { eventType, eventPayload, type WorldEvent, type WorldState } from '../../types/backend';

function formatBrief(ev: WorldEvent, ws: WorldState | null): { icon: string; text: string; color: string } {
  const type = eventType(ev);
  const data = eventPayload(ev);
  const charName = (id: string) => ws?.characters[id] ? translateLabel(ws.characters[id].label) : String(id);

  switch (type) {
    case 'CommandExecuted':
      return { icon: '🎮', text: `${charName(data.actor_id as string)}: ${String(data.command_id).split('/').pop()}`, color: '#42a5f5' };
    case 'NodeSpawned':
      return { icon: '✨', text: `${charName(data.character_id as string)}: +${String(data.schema_id).split('/').pop()}`, color: '#66bb6a' };
    case 'NodeActivated':
      return { icon: '⚡', text: `${String(data.instance_id).split('/').pop()}`, color: '#42a5f5' };
    case 'SoundEmitted':
      return { icon: '🔔', text: String(data.about), color: '#ffa726' };
    case 'FoodPresented':
      return { icon: '🍖', text: String(data.about), color: '#ffa726' };
    case 'ThresholdCrossed':
      return { icon: '📐', text: String(data.trigger_id).split('/').pop() || '', color: '#ab47bc' };
    case 'CharacterMoved':
      return { icon: '🧭', text: `${charName(data.character_id as string)} (${Number(data.to_x).toFixed(0)}, ${Number(data.to_y).toFixed(0)})`, color: '#80cbc4' };
    case 'AssetTraded':
      return { icon: '🪙', text: `${charName(data.buyer_id as string)}: ${String(data.item_id)}`, color: '#73d5a6' };
    case 'ObjectiveCompleted':
      return { icon: '✅', text: translateLabel(data.label as string), color: '#66bb6a' };
    default:
      return { icon: '📌', text: type, color: '#888' };
  }
}

export const EventStrip: React.FC = () => {
  const recentEvents = useGameState((s) => s.recentEvents);
  const worldState = useGameState((s) => s.worldState);

  const last3 = useMemo(() => {
    return recentEvents
      .filter(e => !('TickCompleted' in e))
      .slice(0, 3)
      .map(e => formatBrief(e, worldState));
  }, [recentEvents, worldState]);

  if (last3.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 1,
        bgcolor: 'rgba(10,10,22,0.6)',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 5,
      }}
    >
      {last3.map((item, i) => (
        <Typography key={i} sx={{ fontSize: 10, color: item.color, whiteSpace: 'nowrap' }}>
          {item.icon} {item.text}
        </Typography>
      ))}
    </Box>
  );
};
