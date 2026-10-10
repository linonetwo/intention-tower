import { i18n, translateLabel } from '../../i18n';
import { eventPayload, eventType, type WorldEvent, type WorldState } from '../../types/backend';

const readable = (label: string, fallback: string) => {
  const translated = translateLabel(label);
  return /^(it:|schema:|https?:)/.test(translated) || translated.includes('.label') ? i18n.t(fallback) : translated;
};

export function objectName(world: WorldState | null, id: string): string {
  for (const character of Object.values(world?.characters ?? {})) {
    const node = Object.values(character.mind_graph.nodes).find((candidate) => candidate.instance_id === id || candidate.schema_id === id);
    if (node) return readable(node.label, node.node_type === 'Meme' ? 'event.emergentMeme' : 'event.unknownObject');
  }
  const item = Object.values(world?.items ?? {}).find((candidate) => candidate.id === id || candidate.schema_type === id);
  if (item) return readable(item.label, 'event.unknownObject');
  const translated = translateLabel(id);
  return translated !== id ? readable(translated, 'event.unknownObject') : i18n.t('event.unknownObject');
}

export function presentEvent(event: WorldEvent, world: WorldState | null): { icon: string; text: string; color: string } {
  const type = eventType(event);
  const data = eventPayload(event);
  const character = Object.values(world?.characters ?? {}).find((candidate) => candidate.id === data.character_id || candidate.id === data.actor_id);
  const name = character ? readable(character.label, 'event.character') : i18n.t('event.character');
  const node = objectName(world, String(data.instance_id ?? data.resource_schema_id ?? data.item_id ?? ''));
  let icon = '📌';
  let text = i18n.t(`event.type.${type}`, { defaultValue: i18n.t('event.updated') });
  let color = '#9aaebd';
  switch (type) {
    case 'CommandExecuted':
    case 'CommandRejected': {
      const command = world?.command_defs.find((candidate) => candidate.command_id === data.command_id);
      const commandLabel = command?.label ?? `command.${String(data.command_id)}.label`;
      const label = readable(commandLabel, 'event.commandName');
      if (type === 'CommandRejected') {
        text = i18n.t('event.commandRejected', {
          name, command: label,
          reason: i18n.t(`event.commandRejection.${String(data.reason)}`, { defaultValue: i18n.t('event.commandRejection.unknown') }),
        });
        icon = '⚠️'; color = '#d88943'; break;
      }
      text = `${name} → ${label}`;
      icon = '🎮'; color = '#42a5f5'; break;
    }
    case 'NodeSpawned': icon = '✨'; color = '#66bb6a'; text = `${name}: +${node}`; break;
    case 'NodeActivated': icon = '⚡'; color = '#42a5f5'; text = `${name}: ${node} · ${i18n.t('event.activated')}`; break;
    case 'NodeDeactivated': text = `${name}: ${node} · ${i18n.t('event.deactivated')}`; break;
    case 'NodeDespawned': text = `${name}: ${node} · ${i18n.t('event.expired')}`; break;
    case 'NodeValueChanged': text = `${Number(data.new_value) > Number(data.old_value) ? '↑' : '↓'} ${name}: ${node} ${Number(data.new_value).toFixed(2)}`; break;
    case 'ActionExecuted': icon = '🐾'; color = '#557647'; text = i18n.t(data.autonomous ? 'event.actionAutonomous' : 'event.actionExecuted', { name, action: node }); break;
    case 'LearningUpdated': icon = '🔗'; color = '#64d8a2'; text = `${name}: ${i18n.t(`graph.learning.${String(data.phase)}`)} ${Number(data.old_weight).toFixed(2)} → ${Number(data.new_weight).toFixed(2)}`; break;
    case 'EdgeCreated': icon = '🔗'; text = `${name}: ${i18n.t('graph.learning.created')}`; break;
    case 'EdgeWeightChanged': icon = '🔗'; text = `${name}: ${i18n.t('event.relationChanged')} ${Number(data.new_weight).toFixed(2)}`; break;
    case 'EdgeRemoved': text = `${name}: ${i18n.t('event.edgeRemoved')}`; break;
    case 'SoundEmitted': icon = '🔔'; color = '#ffa726'; text = i18n.t('event.sound'); break;
    case 'FoodPresented': icon = '🍖'; color = '#ffa726'; text = i18n.t('event.food'); break;
    case 'ThresholdCrossed': icon = '📐'; text = `${name}: ${i18n.t('event.threshold')}`; break;
    case 'ResourceConsumed': text = `${name}: ${node} −${Number(data.amount).toFixed(3)}`; break;
    case 'CharacterMoved': icon = '🧭'; text = `${name}: ${i18n.t('event.moved')}`; break;
    case 'AssetTraded': icon = '🪙'; text = `${i18n.t('event.traded')}: ${node}`; break;
    case 'ObjectiveCompleted': icon = '✅'; color = '#66bb6a'; text = readable(String(data.label), 'event.objective'); break;
  }
  return { icon, text, color };
}
