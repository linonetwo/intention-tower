/**
 * MobileStatusBar — compact top-line status for mobile devices.
 * Shows actor, target, resources in a single expandable row.
 */
import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Chip, Collapse, LinearProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

export const MobileStatusBar: React.FC = () => {
  const layout = useResponsiveLayout();
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const [expanded, setExpanded] = useState(false);

  const actor = selectedActorId ? worldState?.characters[selectedActorId] : null;

  const resources = useMemo(() => {
    if (!actor) return [];
    return Object.values(actor.mind_graph.nodes)
      .filter(n => n.prior_instinct?.is_resource)
      .sort((a, b) => a.schema_id.localeCompare(b.schema_id))
      .slice(0, 4);
  }, [actor]);

  if (!layout.isMobile) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 44,
        left: 0,
        right: 0,
        zIndex: 12,
        pointerEvents: 'auto',
      }}
    >
      {/* Compact line */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.3,
          bgcolor: 'rgba(14,14,26,0.8)',
          backdropFilter: 'blur(6px)',
          borderBottom: '1px solid rgba(42,42,78,0.4)',
          cursor: 'pointer',
        }}
      >
        {actor && (
          <Chip
            label={translateLabel(actor.label)}
            size="small"
            color="success"
            variant="outlined"
            sx={{ height: 18, fontSize: 9 }}
          />
        )}

        {/* Mini resource indicators */}
        {resources.map(res => (
          <Box key={res.instance_id} sx={{ flex: 1, maxWidth: 60 }}>
            <LinearProgress
              variant="determinate"
              value={Math.max(0, Math.min(100, res.value * 100))}
              sx={{
                height: 4,
                borderRadius: 1,
                bgcolor: 'rgba(255,255,255,0.06)',
                '& .MuiLinearProgress-bar': { bgcolor: '#66bb6a', borderRadius: 1 },
              }}
            />
          </Box>
        ))}

        <ExpandMoreIcon
          sx={{
            fontSize: 14,
            color: '#666',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </Box>

      {/* Expanded details */}
      <Collapse in={expanded}>
        <Box sx={{ bgcolor: 'rgba(14,14,26,0.9)', px: 1, py: 0.5, display: 'flex', flexDirection: 'column', gap: 0.3 }}>
          {resources.map(res => (
            <Box key={res.instance_id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: 9, color: '#999', width: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {translateLabel(res.label)}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, res.value * 100))}
                sx={{
                  flex: 1,
                  height: 6,
                  borderRadius: 1,
                  bgcolor: 'rgba(255,255,255,0.06)',
                  '& .MuiLinearProgress-bar': { bgcolor: '#66bb6a', borderRadius: 1 },
                }}
              />
              <Typography sx={{ fontSize: 8, color: '#777', width: 30, textAlign: 'right' }}>
                {(res.value * 100).toFixed(0)}%
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};
