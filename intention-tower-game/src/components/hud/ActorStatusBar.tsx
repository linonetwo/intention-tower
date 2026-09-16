/**
 * ActorStatusBar — left-side HUD showing selected actor info and resource bars.
 * Compact icon-strip on tablet, full sidebar on desktop, hidden on mobile (top bar instead).
 */
import React, { useMemo } from 'react';
import { Box, Typography, LinearProgress, Tooltip } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import { useTranslation } from 'react-i18next';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const RESOURCE_COLORS: Record<string, string> = {
  'health': '#66bb6a',
  'dopamine': '#ffa726',
  'attention': '#42a5f5',
};

function getResourceColor(schemaId: string): string {
  for (const [key, color] of Object.entries(RESOURCE_COLORS)) {
    if (schemaId.includes(key)) return color;
  }
  return '#9575cd';
}

export const ActorStatusBar: React.FC = () => {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);

  const actor = selectedActorId ? worldState?.characters[selectedActorId] : null;
  const target = selectedTargetId ? worldState?.characters[selectedTargetId] : null;
  // inspectedCharacterId available for future use
  void inspectedCharacterId;

  const actorResources = useMemo(() => {
    if (!actor) return [];
    return Object.values(actor.mind_graph.nodes)
      .filter(n => n.prior_instinct?.is_resource)
      .sort((a, b) => a.schema_id.localeCompare(b.schema_id));
  }, [actor]);

  const activeMotivations = useMemo(() => {
    if (!actor) return [];
    return Object.values(actor.mind_graph.nodes)
      .filter(n => n.node_type === 'Motivation' && n.active && n.attended)
      .slice(0, 3);
  }, [actor]);

  if (layout.statusBarWidth === 0) return null;

  const isCompact = layout.isTablet;
  const barWidth = layout.statusBarWidth;

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        top: 48,
        bottom: 0,
        width: barWidth,
        bgcolor: 'rgba(14,14,26,0.85)',
        backdropFilter: 'blur(8px)',
        borderRight: '1px solid rgba(42,42,78,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: isCompact ? 0.5 : 1,
        overflow: 'auto',
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    >
      {/* Actor section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box
          sx={{
            width: isCompact ? 32 : 40,
            height: isCompact ? 32 : 40,
            borderRadius: '50%',
            bgcolor: actor ? '#3949ab' : '#333',
            border: '2px solid #4caf50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <PersonIcon sx={{ fontSize: isCompact ? 16 : 20, color: '#ddd' }} />
        </Box>
        {!isCompact && (
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#4caf50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {actor ? translateLabel(actor.label) : t('world.none')}
            </Typography>
            <Typography sx={{ fontSize: 9, color: '#888' }}>
              {t('world.actor')}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Resource bars */}
      {actorResources.map((res) => {
        const pct = Math.max(0, Math.min(100, res.value * 100));
        const color = getResourceColor(res.schema_id);
        const label = translateLabel(res.label);
        return (
          <Tooltip key={res.instance_id} title={`${label}: ${res.value.toFixed(2)}`} placement="right" arrow>
            <Box sx={{ px: isCompact ? 0.3 : 0 }}>
              {!isCompact && (
                <Typography sx={{ fontSize: 9, color: '#999', mb: 0.2 }}>{label}</Typography>
              )}
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{
                  height: isCompact ? 6 : 8,
                  borderRadius: 1,
                  bgcolor: 'rgba(255,255,255,0.08)',
                  '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 1 },
                }}
              />
            </Box>
          </Tooltip>
        );
      })}

      {/* Active motivations */}
      {!isCompact && activeMotivations.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 9, color: '#888', mb: 0.3 }}>
            {t('node-type.motivation.label')}
          </Typography>
          {activeMotivations.map((mot) => (
            <Typography key={mot.instance_id} sx={{ fontSize: 10, color: '#ef5350', pl: 0.5 }}>
              ⚡ {translateLabel(mot.label)}
            </Typography>
          ))}
        </Box>
      )}

      {/* Target section */}
      {target && (
        <>
          <Box sx={{ borderTop: '1px solid rgba(42,42,78,0.4)', pt: 1, mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: isCompact ? 28 : 36,
                height: isCompact ? 28 : 36,
                borderRadius: '50%',
                bgcolor: '#5d4037',
                border: '2px solid #ff9800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PersonIcon sx={{ fontSize: isCompact ? 14 : 18, color: '#ddd' }} />
            </Box>
            {!isCompact && (
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#ff9800', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {translateLabel(target.label)}
                </Typography>
                <Typography sx={{ fontSize: 9, color: '#888' }}>
                  {t('world.target')}
                </Typography>
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};
