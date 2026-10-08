/**
 * DialogueBox — bottom Galgame-style dialogue box with command options.
 *
 * Shows recent events as narrative text and available commands as dialogue choices.
 * Replaces the old CommandPanel for the map-centric UI.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, Collapse, IconButton,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { type WorldEvent, type WorldState, type CommandEffect } from '../../types/backend';
import { objectName, presentEvent } from './eventPresentation';

/* ── Event formatting (simplified for dialogue) ── */
function formatEventBrief(ev: WorldEvent, ws: WorldState | null): string {
  const presentation = presentEvent(ev, ws);
  return `${presentation.icon} ${presentation.text}`;
}

function describeEffect(effect: CommandEffect, t: (k: string, v?: Record<string, unknown>) => string, world: WorldState | null): string {
  const name = (id: string) => objectName(world, id);
  if ('MoveCharacter' in effect) return t('command.effect.move', { x: effect.MoveCharacter.delta_x, y: effect.MoveCharacter.delta_y });
  if ('SpawnObservation' in effect) return t('command.effect.spawn', { schema: name(effect.SpawnObservation.schema_id), modality: t(`event.modality.${effect.SpawnObservation.modality}`, { defaultValue: t('event.modality.other') }) });
  if ('ModifyNodeValue' in effect) { const d = effect.ModifyNodeValue.delta; return t('command.effect.modify', { schema: name(effect.ModifyNodeValue.schema_id), delta: `${d > 0 ? '+' : ''}${d}` }); }
  if ('InjectMeme' in effect) return t('command.effect.meme', { schema: name(effect.InjectMeme.meme_schema_id) });
  if ('ReinforceEdge' in effect) return t('command.effect.reinforce', { source: name(effect.ReinforceEdge.source_schema_id), target: name(effect.ReinforceEdge.target_schema_id) });
  if ('WeakenEdge' in effect) return t('command.effect.weaken', { source: name(effect.WeakenEdge.source_schema_id), target: name(effect.WeakenEdge.target_schema_id) });
  if ('ConsumeResource' in effect) return t('command.effect.consume', { schema: name(effect.ConsumeResource.resource_schema_id), amount: effect.ConsumeResource.amount });
  if ('DeleteNode' in effect) return t('command.effect.delete', { schema: name(effect.DeleteNode.schema_id) });
  return t('event.updated');
}

export const DialogueBox: React.FC = () => {
  const { t, i18n } = useTranslation();
  const layout = useResponsiveLayout();
  const worldState = useGameState((s) => s.worldState);
  const availableCommands = useGameState((s) => s.availableCommands);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const recentEvents = useGameState((s) => s.recentEvents);
  const executeCommand = useGameState((s) => s.executeCommand);
  const cancelPendingCommand = useGameState((s) => s.cancelPendingCommand);

  const [expanded, setExpanded] = useState(true);
  const [justExecuted, setJustExecuted] = useState<string | null>(null);
  const [hoveredCmd, setHoveredCmd] = useState<string | null>(null);

  const paused = worldState?.paused ?? true;

  const pendingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pc of worldState?.pending_commands ?? []) ids.add(pc.command_id);
    return ids;
  }, [worldState?.pending_commands]);

  // Recent event text (last 5 meaningful events)
  const recentText = useMemo(() => {
    const meaningful = recentEvents.filter(e => !('TickCompleted' in e));
    const prominent: WorldEvent[] = meaningful.filter(e => 'ActionExecuted' in e || 'LearningUpdated' in e || 'ObjectiveCompleted' in e);
    return [...prominent, ...meaningful.filter(e => !prominent.includes(e))]
      .slice(0, 5)
      .map(e => formatEventBrief(e, worldState));
  }, [recentEvents, worldState, i18n.language]);

  const actorLabel = selectedActorId && worldState?.characters[selectedActorId]
    ? translateLabel(worldState.characters[selectedActorId].label)
    : t('world.none');
  const targetLabel = selectedTargetId && worldState?.characters[selectedTargetId]
    ? translateLabel(worldState.characters[selectedTargetId].label)
    : null;

  const handleExecute = useCallback(async (commandId: string) => {
    if (pendingIds.has(commandId)) {
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
  }, [pendingIds, cancelPendingCommand, executeCommand, paused]);

  const leftPadding = layout.statusBarWidth;

  return (
    <Box
      data-testid="dialogue-hud"
      data-expanded={expanded}
      sx={{
        position: 'absolute',
        bottom: 0,
        left: leftPadding,
        right: 0,
        pointerEvents: 'auto',
        zIndex: 15,
        maxHeight: `${layout.dialogueHeight}dvh`,
      }}
    >
      {/* Collapse toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: -0.5 }}>
        <IconButton
          data-testid="dialogue-toggle"
          size="small"
          onClick={() => setExpanded(!expanded)}
          aria-label={t('command.toggle')}
          sx={{
            color: '#79644d',
            bgcolor: 'rgba(255,248,232,0.94)',
            borderRadius: '8px 8px 0 0',
            px: 2,
            py: 0.2,
            '&:hover': { bgcolor: 'rgba(255,248,232,0.94)' },
          }}
        >
          {expanded ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ExpandLessIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      <Box
        sx={{
          bgcolor: 'rgba(255,248,232,0.94)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(154,113,62,0.3)',
          px: layout.isMobile ? 1 : 2,
          py: expanded ? 1.5 : 0.5,
          // Include padding and the toggle in the reserved dialogue footprint.
          boxSizing: 'border-box',
          maxHeight: expanded ? `calc(${layout.dialogueHeight}dvh - 44px)` : 36,
          overflow: 'auto',
          transition: 'max-height 0.3s ease',
        }}
      >
        {/* Event narrative (collapsed: single line; expanded: up to 5 lines) */}
        <Box sx={{ mb: expanded ? 1 : 0 }}>
          {!expanded && recentText.length > 0 && (
            <Typography sx={{ fontSize: 11, color: '#806c55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {recentText[0]}
            </Typography>
          )}
          {expanded && recentText.map((text, i) => (
            <Typography key={i} sx={{ fontSize: 11, color: i === 0 ? '#68543f' : '#777', lineHeight: 1.5 }}>
              {text}
            </Typography>
          ))}
          {expanded && recentText.length === 0 && (
            <Typography sx={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>
              {t('event.empty')}
            </Typography>
          )}
        </Box>

        {/* Command options (Galgame dialogue choices) */}
        {expanded && (
          <>
            {/* Actor → Target indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.8 }}>
              <Chip label={actorLabel} size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: 9 }} />
              {targetLabel && (
                <>
                  <Typography sx={{ fontSize: 10, color: '#666' }}>→</Typography>
                  <Chip label={targetLabel} size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: 9 }} />
                </>
              )}
            </Box>

            {/* Command buttons as dialogue choices */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {!selectedActorId && (
                <Typography sx={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                  {t('command.noActor')}
                </Typography>
              )}

              {selectedActorId && availableCommands.length === 0 && (
                <Typography sx={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                  {t('command.noneAvailable')}
                </Typography>
              )}

              {availableCommands.map((cmd, idx) => {
                const label = translateLabel(cmd.label);
                const needsTarget = cmd.targeting === 'RequiresTarget';
                const disabled = needsTarget && !selectedTargetId;
                const wasExecuted = justExecuted === cmd.command_id;
                const isQueued = pendingIds.has(cmd.command_id);
                const isHovered = hoveredCmd === cmd.command_id;

                return (
                  <Box key={cmd.command_id}>
                    <Button
                      data-testid={`command-${cmd.command_id}`}
                      variant="text"
                      size="small"
                      fullWidth
                      disabled={disabled}
                      onClick={() => handleExecute(cmd.command_id)}
                      onMouseEnter={() => setHoveredCmd(cmd.command_id)}
                      onMouseLeave={() => setHoveredCmd(null)}
                      startIcon={
                        wasExecuted ? <CheckCircleIcon sx={{ fontSize: 13, color: '#66bb6a' }} />
                        : isQueued ? <HourglassEmptyIcon sx={{ fontSize: 13, color: '#ffa726' }} />
                        : <PlayArrowIcon sx={{ fontSize: 13, color: '#9b693b' }} />
                      }
                      sx={{
                        justifyContent: 'flex-start',
                        textTransform: 'none',
                        fontSize: layout.isMobile ? 13 : 12,
                        py: layout.isMobile ? 1 : 0.6,
                        px: 1.5,
                        color: isQueued ? '#92622f' : '#68543f',
                        bgcolor: isQueued
                          ? 'rgba(255,167,38,0.1)'
                          : wasExecuted
                            ? 'rgba(76,175,80,0.1)'
                            : 'rgba(154,113,62,0.08)',
                        border: '1px solid',
                        borderColor: isQueued ? '#c79d55' : wasExecuted ? '#7b9761' : '#cfb68d',
                        boxShadow: '0 2px 0 #bfa17b',
                        borderRadius: 2,
                        '&:hover': { bgcolor: 'rgba(154,113,62,0.18)' },
                        '&.Mui-disabled': { color: '#8f7f69', bgcolor: 'rgba(149,112,64,0.02)', borderColor: '#d5c8b4', boxShadow: 'none' },
                        minHeight: layout.touchTarget,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 0.5 }}>
                        {/* Number prefix */}
                        <Typography sx={{ fontSize: 10, color: '#9b693b', fontFamily: 'monospace', mr: 0.5 }}>
                          {idx + 1}.
                        </Typography>
                        <Typography sx={{ fontSize: 12, flex: 1, textAlign: 'left' }}>
                          {label}
                        </Typography>
                        {cmd.hotkey && (
                          <Chip label={cmd.hotkey.toUpperCase()} size="small" sx={{ height: 16, fontSize: 8, fontFamily: 'monospace', bgcolor: 'rgba(149,112,64,0.08)' }} />
                        )}
                        {needsTarget && (
                          <Chip label={t('command.needTargetTag')} size="small" variant="outlined" sx={{ height: 14, fontSize: 7, borderColor: '#555' }} />
                        )}
                        {isQueued && (
                          <Chip label={t('command.queued')} size="small" sx={{ height: 14, fontSize: 7, bgcolor: 'rgba(255,167,38,0.3)', color: '#92622f' }} />
                        )}
                      </Box>
                    </Button>

                    {/* Effect preview on hover */}
                    <Collapse in={isHovered && !disabled} timeout={100}>
                      <Box sx={{ pl: 4, pr: 1, py: 0.2 }}>
                        {cmd.effect_templates?.map((eff, i) => (
                          <Typography key={i} sx={{ fontSize: 9, color: '#7986cb', lineHeight: 1.3 }}>
                            • {describeEffect(eff, t, worldState)}
                          </Typography>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </Box>

            {/* Keyboard hint */}
            <Typography sx={{ fontSize: 8, color: '#444', mt: 0.5, textAlign: 'center' }}>
              {t('command.tip')}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};
