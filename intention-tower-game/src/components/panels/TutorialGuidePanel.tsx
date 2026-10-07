import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Box, Chip, Paper, Typography, IconButton } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { eventPayload, eventType } from '../../types/backend';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

interface GuideStep {
  id: string;
  done: boolean;
  text: string;
  /** data-tutorial attribute value to highlight */
  highlightTarget?: string;
}

const TUTORIAL_LEVELS = new Set(['pavlov', 'smart-cat', 'gosling']);
const shortId = (id: string | null) => id?.split('/').pop() ?? '';

// CSS keyframe injected once for the tutorial highlight class
let _styleInjected = false;
function ensureHighlightStyle() {
  if (_styleInjected || typeof document === 'undefined') return;
  _styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    [data-tutorial] {
      transition: box-shadow 0.3s, border-color 0.3s;
    }
    .tutorial-highlight {
      animation: tutorial-pulse 1.4s ease-in-out infinite;
      outline: 2px solid rgba(255,167,38,0.8) !important;
      outline-offset: 2px;
    }
    @keyframes tutorial-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 167, 38, 0.7); }
      60%  { box-shadow: 0 0 0 8px rgba(255, 167, 38, 0.0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 167, 38, 0.0); }
    }
  `;
  document.head.appendChild(style);
}

export const TutorialGuidePanel: React.FC = () => {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const currentLevelId = useGameState((s) => s.currentLevelId);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);
  const recentEvents = useGameState((s) => s.recentEvents);
  const worldState = useGameState((s) => s.worldState);
  const uiMode = useGameState((s) => s.uiMode);
  const [expanded, setExpanded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stepEls = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => { ensureHighlightStyle(); }, []);

  const commandHistory = useMemo(() => {
    return recentEvents
      .filter((event) => eventType(event) === 'CommandExecuted')
      .map((event) => eventPayload(event).command_id as string);
  }, [recentEvents]);

  const hasRing = commandHistory.some((id) => id.includes('ring')) || (worldState?.pending_commands ?? []).some((command) => command.command_id === 'ring-bell' && shortId(command.target_id) === 'dog');
  const hasFeed = commandHistory.some((id) => id.includes('feed')) || (worldState?.pending_commands ?? []).some((command) => command.command_id === 'feed' && shortId(command.target_id) === 'dog');
  const dog = Object.values(worldState?.characters ?? {}).find((character) => shortId(character.id) === 'dog');
  const cueRegistered = Object.values(dog?.mind_graph.nodes ?? {}).some((node) => node.schema_id === 'it:concept/hear-metronome');
  const foodActive = Object.values(dog?.mind_graph.nodes ?? {}).some((node) => node.schema_id === 'it:concept/see-food' && node.active);
  const objectiveDone = (id: string) => worldState?.progress.objectives.some((objective) => objective.objective_id === id && objective.completed) ?? false;
  const pairedDone = objectiveDone('pair-bell-and-food');
  const edgeDone = objectiveDone('learn-conditioned-edge');
  const responseDone = objectiveDone('verify-bell-response');
  const settled = recentEvents.some((event) => 'LearningUpdated' in event && shortId(event.LearningUpdated.character_id) === 'dog' && event.LearningUpdated.reward > 0);

  const conditionedWeight = useMemo(() => {
    if (!worldState) return 0;
    for (const character of Object.values(worldState.characters)) {
      for (const edge of Object.values(character.mind_graph.edges)) {
        if (shortId(character.id) === 'dog' && edge.learnable && edge.learn_type === 'Classical') {
          const srcNode = character.mind_graph.nodes[edge.source_instance_id];
          const targetNode = character.mind_graph.nodes[edge.target_instance_id];
          if (srcNode?.schema_id === 'it:concept/hear-metronome' && targetNode?.schema_id === 'it:concept/salivate') {
            return edge.weight;
          }
        }
      }
    }
    return 0;
  }, [worldState]);

  const steps = useMemo<GuideStep[]>(() => {
    if (currentLevelId === 'pavlov') {
      return [
        {
          id: 'select',
          done: shortId(selectedActorId) === 'pavlov' && shortId(selectedTargetId) === 'dog',
          text: t('tutorial.pavlov.step.select'),
          highlightTarget: 'actor-selector',
        },
        {
          id: 'inspect-dog',
          done: shortId(inspectedCharacterId) === 'dog',
          text: t('tutorial.pavlov.step.inspect-dog'),
          highlightTarget: 'character-dog',
        },
        {
          id: 'ring',
          done: hasRing,
          text: t('tutorial.pavlov.step.ring'),
          highlightTarget: 'command-ring-bell',
        },
        {
          id: 'unpause',
          done: cueRegistered,
          text: t('tutorial.pavlov.step.unpause'),
          highlightTarget: 'step-button',
        },
        {
          id: 'pair',
          done: hasFeed,
          text: t('tutorial.pavlov.step.pair'),
          highlightTarget: 'command-feed',
        },
        {
          id: 'settle',
          done: settled || pairedDone,
          text: t('tutorial.pavlov.step.settle'),
          highlightTarget: 'step-button',
        },
        {
          id: 'repeat',
          done: pairedDone && edgeDone,
          text: t('tutorial.pavlov.step.repeat', { weight: conditionedWeight.toFixed(2) }),
          highlightTarget: conditionedWeight > 0 ? 'command-feed' : 'command-ring-bell',
        },
        {
          id: 'wait-food',
          done: pairedDone && edgeDone && !foodActive,
          text: t('tutorial.pavlov.step.wait-food'),
          highlightTarget: 'step-button',
        },
        {
          id: 'verify',
          done: responseDone,
          text: t('tutorial.pavlov.step.verify', { weight: conditionedWeight.toFixed(2) }),
        },
      ];
    }

    if (currentLevelId === 'smart-cat') {
      return [
        { id: 'a', done: !!selectedActorId, text: t('tutorial.smart-cat.step.1'), highlightTarget: 'actor-selector' },
        { id: 'b', done: commandHistory.length >= 2, text: t('tutorial.smart-cat.step.2') },
        { id: 'c', done: commandHistory.length >= 4, text: t('tutorial.smart-cat.step.3') },
      ];
    }

    return [
      { id: 'a', done: !!selectedActorId, text: t('tutorial.gosling.step.1'), highlightTarget: 'actor-selector' },
      { id: 'b', done: commandHistory.length >= 1, text: t('tutorial.gosling.step.2') },
      { id: 'c', done: commandHistory.length >= 3, text: t('tutorial.gosling.step.3') },
    ];
  }, [
    commandHistory.length,
    conditionedWeight,
    currentLevelId,
    cueRegistered,
    foodActive,
    pairedDone,
    edgeDone,
    responseDone,
    settled,
    hasFeed,
    hasRing,
    inspectedCharacterId,
    selectedActorId,
    selectedTargetId,
    t,
  ]);

  // Highlight the target element of the first incomplete step
  const activeStep = steps.find((s) => !s.done);
  useEffect(() => {
    document.querySelectorAll('.tutorial-highlight').forEach((el) => {
      el.classList.remove('tutorial-highlight');
    });
    if (activeStep?.highlightTarget) {
      const el = document.querySelector(`[data-tutorial="${activeStep.highlightTarget}"]`);
      if (el) el.classList.add('tutorial-highlight');
    }
    return () => {
      document.querySelectorAll('.tutorial-highlight').forEach((el) => {
        el.classList.remove('tutorial-highlight');
      });
    };
  }, [activeStep?.highlightTarget]);

  // Auto-scroll the active step into view
  useEffect(() => {
    if (!activeStep) return;
    const el = stepEls.current.get(activeStep.id);
    if (el) {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeStep?.id]);

  if (!currentLevelId || !TUTORIAL_LEVELS.has(currentLevelId) || uiMode === 'graph') {
    return null;
  }

  const doneCount = steps.filter((step) => step.done).length;
  const panelTop = layout.isMobile ? 116 : 92;
  const panelLeft = layout.isMobile ? 8 : layout.statusBarWidth + 8;
  const panelRight = layout.isMobile ? 8 : undefined;

  return (
    <Box
      data-testid='tutorial-guide'
      sx={{
        position: 'absolute',
        top: panelTop,
        left: panelLeft,
        right: panelRight,
        zIndex: 18,
        width: layout.isMobile ? 'auto' : 290,
        pointerEvents: 'auto',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: expanded ? 1 : 0.65,
          bgcolor: '#141428',
          border: '1px solid #2a2a4e',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: expanded ? 0.6 : 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>
            {t('tutorial.title')}
          </Typography>
          <Chip
            size='small'
            label={t('tutorial.progress', { done: doneCount, total: steps.length })}
            sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(255,255,255,0.06)' }}
          />
          <IconButton size='small' data-testid='tutorial-expand' aria-label={expanded ? t('tutorial.collapse') : t('tutorial.expand')} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Box>

      {/* Scrollable steps list — auto-scrolls to active step */}
        <Box
          ref={scrollRef}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.4,
            maxHeight: expanded ? 220 : 90,
            overflowY: 'auto',
            pr: 0.3,
            '&::-webkit-scrollbar': { width: 3 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.18)', borderRadius: 2 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          }}
        >
          {(expanded ? steps : [activeStep ?? steps[steps.length - 1]]).map((step) => {
            const isActive = step === activeStep;
            return (
              <Box
                key={step.id}
                ref={(el: HTMLDivElement | null) => {
                  if (el) stepEls.current.set(step.id, el);
                  else stepEls.current.delete(step.id);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.8,
                  px: 0.5,
                  py: expanded ? 0.4 : 0.2,
                  borderRadius: 0.5,
                  bgcolor: step.done
                    ? 'rgba(76,175,80,0.12)'
                    : isActive
                      ? 'rgba(255,167,38,0.1)'
                      : 'transparent',
                  border: isActive ? '1px solid rgba(255,167,38,0.35)' : '1px solid transparent',
                }}
              >
                <Box sx={{ mt: 0.15, flexShrink: 0 }}>
                  {step.done
                    ? <CheckCircleIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
                    : isActive
                      ? <ArrowForwardIcon sx={{ fontSize: 13, color: '#ffa726' }} />
                      : <RadioButtonUncheckedIcon sx={{ fontSize: 13, color: '#555' }} />}
                </Box>
                <Typography sx={{ fontSize: 11, color: step.done ? '#c8e6c9' : isActive ? '#ffe082' : '#888', lineHeight: 1.5, ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
                  {step.text}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
};
