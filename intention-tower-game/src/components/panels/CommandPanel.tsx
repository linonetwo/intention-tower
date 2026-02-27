/**
 * CommandPanel — right sidebar showing available commands with effect preview and execution feedback.
 */
import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Divider, Chip, Tooltip, Alert, Collapse,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { t as translateLabel } from '../../i18n';
import type { CommandDef, CommandEffect } from '../../types/backend';

function describeEffect(effect: CommandEffect, t: (key: string, vars?: Record<string, unknown>) => string): string {
  if ('SpawnObservation' in effect) {
    return t('command.effect.spawn', { schema: effect.SpawnObservation.schema_id.split('/').pop(), modality: effect.SpawnObservation.modality });
  }
  if ('ModifyNodeValue' in effect) {
    const d = effect.ModifyNodeValue.delta;
    return t('command.effect.modify', { schema: effect.ModifyNodeValue.schema_id.split('/').pop(), delta: `${d > 0 ? '+' : ''}${d}` });
  }
  if ('ConsumeResource' in effect) {
    return t('command.effect.consume', { schema: effect.ConsumeResource.resource_schema_id.split('/').pop(), amount: effect.ConsumeResource.amount });
  }
  if ('ReinforceEdge' in effect) {
    return t('command.effect.reinforce', { source: effect.ReinforceEdge.source_schema_id.split('/').pop(), target: effect.ReinforceEdge.target_schema_id.split('/').pop() });
  }
  if ('WeakenEdge' in effect) {
    return t('command.effect.weaken', { source: effect.WeakenEdge.source_schema_id.split('/').pop(), target: effect.WeakenEdge.target_schema_id.split('/').pop() });
  }
  if ('InjectMeme' in effect) {
    return t('command.effect.meme', { schema: effect.InjectMeme.meme_schema_id.split('/').pop() });
  }
  if ('DeleteNode' in effect) {
    return t('command.effect.delete', { schema: effect.DeleteNode.schema_id.split('/').pop() });
  }
  if ('ModifyResourceRegen' in effect) {
    return t('command.effect.modifyRegen', { schema: effect.ModifyResourceRegen.resource_schema_id.split('/').pop(), rate: effect.ModifyResourceRegen.new_regen_rate });
  }
  return '...';
}

function EffectPreview({ cmd, t }: { cmd: CommandDef; t: (key: string, vars?: Record<string, unknown>) => string }) {
  if (!cmd.effect_templates || cmd.effect_templates.length === 0) return null;
  return (
    <Box sx={{ pl: 3, pr: 0.5, py: 0.3, display: 'flex', flexDirection: 'column', gap: 0.2 }}>
      {cmd.effect_templates.map((eff, idx) => (
        <Typography key={idx} sx={{ fontSize: 9.5, color: '#7986cb', lineHeight: 1.3 }}>
          • {describeEffect(eff, t)}
        </Typography>
      ))}
    </Box>
  );
}

export const CommandPanel: React.FC = () => {
  const { t } = useTranslation();
  const availableCommands = useGameState((s) => s.availableCommands);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const worldState = useGameState((s) => s.worldState);
  const executeCommand = useGameState((s) => s.executeCommand);
  const cancelPendingCommand = useGameState((s) => s.cancelPendingCommand);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [justExecuted, setJustExecuted] = useState<string | null>(null);

  const paused = worldState?.paused ?? true;

  // Set of command_ids currently queued in backend
  const pendingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pc of worldState?.pending_commands ?? []) {
      ids.add(pc.command_id);
    }
    return ids;
  }, [worldState?.pending_commands]);

  const actorLabel = selectedActorId && worldState?.characters[selectedActorId]
    ? translateLabel(worldState.characters[selectedActorId].label)
    : t('world.none');
  const targetLabel = selectedTargetId && worldState?.characters[selectedTargetId]
    ? translateLabel(worldState.characters[selectedTargetId].label)
    : t('world.none');

  const handleExecute = async (commandId: string) => {
    const isQueued = pendingIds.has(commandId);
    if (isQueued) {
      // Already queued — cancel it
      await cancelPendingCommand(commandId);
      return;
    }
    setJustExecuted(commandId);
    await executeCommand(commandId);
    if (!paused) {
      setTimeout(() => setJustExecuted(null), 800);
    } else {
      setJustExecuted(null);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header: Actor → Target */}
      <Box sx={{ p: 1, pb: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: '#888', mb: 0.5 }}>{t('command.panel')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Chip label={actorLabel} size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
          <Typography sx={{ fontSize: 12, color: '#666' }}>→</Typography>
          <Chip label={targetLabel} size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
        </Box>
      </Box>

      <Divider />

      {/* Command buttons */}
      <Box sx={{ overflow: 'auto', flex: 1, p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {!selectedActorId && (
          <Alert severity="info" sx={{ fontSize: 11, py: 0 }}>
            {t('command.noActor')}
          </Alert>
        )}

        {selectedActorId && availableCommands.length === 0 && (
          <Alert severity="info" sx={{ fontSize: 11, py: 0 }}>
            {t('command.noneAvailable')}
          </Alert>
        )}

        {availableCommands.map((cmd) => {
          const label = translateLabel(cmd.label);
          const needsTarget = cmd.targeting === 'RequiresTarget';
          const disabled = needsTarget && !selectedTargetId;
          const wasExecuted = justExecuted === cmd.command_id;
          const isQueued = pendingIds.has(cmd.command_id);
          const isExpanded = expandedId === cmd.command_id;

          return (
            <Box key={cmd.command_id}>
              <Tooltip
                title={disabled
                  ? t('command.needTarget')
                  : isQueued
                    ? t('command.cancelQueued', { label })
                    : t('command.execute', { label })}
                arrow
                placement="left"
              >
                <span>
                  <Button
                    variant={isQueued ? 'outlined' : 'contained'}
                    size="small"
                    fullWidth
                    disabled={disabled}
                    onClick={() => handleExecute(cmd.command_id)}
                    onMouseEnter={() => setExpandedId(cmd.command_id)}
                    onMouseLeave={() => setExpandedId(null)}
                    data-tutorial={`command-${cmd.command_id}`}
                    startIcon={wasExecuted
                      ? <CheckCircleIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
                      : isQueued
                        ? <HourglassEmptyIcon sx={{ fontSize: 14, color: '#ffa726' }} />
                        : <PlayArrowIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      fontSize: 12,
                      py: 0.75,
                      bgcolor: isQueued
                        ? 'rgba(255,167,38,0.14)'
                        : wasExecuted
                          ? 'rgba(76,175,80,0.18)'
                          : 'rgba(100, 100, 255, 0.15)',
                      color: isQueued ? '#ffcc80' : '#ccc',
                      borderColor: isQueued ? 'rgba(255,167,38,0.5)' : undefined,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: isQueued
                          ? 'rgba(255,167,38,0.22)'
                          : 'rgba(100, 100, 255, 0.3)',
                        borderColor: isQueued ? 'rgba(255,167,38,0.7)' : undefined,
                      },
                      '&.Mui-disabled': { color: '#555', bgcolor: 'rgba(255,255,255,0.03)' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%' }}>
                      <Typography sx={{ fontSize: 12, flex: 1, textAlign: 'left' }}>
                        {label}
                      </Typography>
                      {cmd.hotkey && (
                        <Chip
                          label={cmd.hotkey}
                          size="small"
                          sx={{ height: 16, fontSize: 9, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.1)' }}
                        />
                      )}
                      {needsTarget && (
                        <Chip
                          label={t('command.needTargetTag')}
                          size="small"
                          variant="outlined"
                          sx={{ height: 14, fontSize: 8, borderColor: '#666' }}
                        />
                      )}
                      {isQueued && (
                        <Chip
                          label={t('command.queued')}
                          size="small"
                          sx={{ height: 16, fontSize: 9, bgcolor: 'rgba(255,167,38,0.3)', color: '#ffcc80' }}
                        />
                      )}
                    </Box>
                  </Button>
                </span>
              </Tooltip>
              <Collapse in={isExpanded} timeout={150}>
                <EffectPreview cmd={cmd} t={t} />
              </Collapse>
            </Box>
          );
        })}
      </Box>

      <Divider />
      <Box sx={{ p: 1 }}>
        <Typography sx={{ fontSize: 9, color: '#555' }}>
          {t('command.tip')}
        </Typography>
      </Box>
    </Box>
  );
};
