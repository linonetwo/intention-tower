import React, { useMemo, useEffect, useRef } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { eventPayload, eventType } from '../../types/backend';

interface GuideStep {
  id: string;
  done: boolean;
  text: string;
  /** data-tutorial attribute value to highlight */
  highlightTarget?: string;
}

const TUTORIAL_LEVELS = new Set(['pavlov', 'smart-cat', 'gosling']);

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
  const currentLevelId = useGameState((s) => s.currentLevelId);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);
  const recentEvents = useGameState((s) => s.recentEvents);
  const worldState = useGameState((s) => s.worldState);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stepEls = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => { ensureHighlightStyle(); }, []);

  const commandHistory = useMemo(() => {
    return recentEvents
      .filter((event) => eventType(event) === 'CommandExecuted')
      .map((event) => eventPayload(event).command_id as string);
  }, [recentEvents]);

  const hasRing = commandHistory.some((id) => id.includes('ring'));
  const hasFeed = commandHistory.some((id) => id.includes('feed'));
  const ringCount = commandHistory.filter((id) => id.includes('ring')).length;
  const feedCount = commandHistory.filter((id) => id.includes('feed')).length;

  const conditionedWeight = useMemo(() => {
    if (!worldState) return 0;
    for (const character of Object.values(worldState.characters)) {
      for (const edge of Object.values(character.mind_graph.edges)) {
        if (edge.learnable && edge.learn_type === 'Classical') {
          const srcNode = character.mind_graph.nodes[edge.source_instance_id];
          if (srcNode?.schema_id?.includes('hear-metronome')) {
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
          done: !!selectedActorId && !!selectedTargetId,
          text: t('tutorial.pavlov.step.select'),
          highlightTarget: 'actor-selector',
        },
        {
          id: 'inspect-dog',
          done: inspectedCharacterId === 'dog',
          text: t('tutorial.pavlov.step.inspect-dog'),
          highlightTarget: 'character-dog',
        },
        {
          id: 'unpause',
          done: (worldState?.tick ?? 0) >= 2,
          text: t('tutorial.pavlov.step.unpause'),
          highlightTarget: 'step-button',
        },
        {
          id: 'pair',
          done: hasRing && hasFeed,
          text: t('tutorial.pavlov.step.pair'),
          highlightTarget: 'command-ring-bell',
        },
        {
          id: 'repeat',
          done: ringCount >= 3 && feedCount >= 3,
          text: t('tutorial.pavlov.step.repeat', { ring: ringCount, feed: feedCount }),
          highlightTarget: conditionedWeight > 0 ? 'command-feed' : 'command-ring-bell',
        },
        {
          id: 'verify',
          done: conditionedWeight >= 0.3,
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
    feedCount,
    hasFeed,
    hasRing,
    inspectedCharacterId,
    ringCount,
    selectedActorId,
    selectedTargetId,
    t,
    worldState?.tick,
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
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeStep?.id]);

  if (!currentLevelId || !TUTORIAL_LEVELS.has(currentLevelId)) {
    return null;
  }

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <Paper
      elevation={0}
      sx={{
        mx: 1,
        mt: 0.8,
        p: 1,
        bgcolor: '#141428',
        border: '1px solid #2a2a4e',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>
          {t('tutorial.title')}
        </Typography>
        <Chip
          size='small'
          label={t('tutorial.progress', { done: doneCount, total: steps.length })}
          sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(255,255,255,0.06)' }}
        />
      </Box>

      {/* Scrollable steps list — auto-scrolls to active step */}
      <Box
        ref={scrollRef}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.4,
          maxHeight: 220,
          overflowY: 'auto',
          pr: 0.3,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.18)', borderRadius: 2 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        }}
      >
        {steps.map((step) => {
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
                py: 0.4,
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
              <Typography sx={{ fontSize: 11, color: step.done ? '#c8e6c9' : isActive ? '#ffe082' : '#888', lineHeight: 1.5 }}>
                {step.text}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};
