/**
 * CharacterPortrait — Galgame-style character portrait overlay.
 * Shows actor on the left and target on the right as silhouette placeholders.
 * Auto-hides when graph overlay is open.
 */
import React from 'react';
import { Box, Typography, Fade } from '@mui/material';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useModAssets } from '../../store/useModAssets';

const PortraitPlaceholder: React.FC<{
  label: string;
  color: string;
  side: 'left' | 'right';
  compact: boolean;
  imageUrl?: string;
}> = ({ label, color, side, compact, imageUrl }) => {
  const size = compact ? 48 : 80;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        [side === 'left' ? 'ml' : 'mr']: compact ? 1 : 2,
      }}
    >
      {/* Portrait image (fallback to silhouette placeholder) */}
      <Box
        sx={{
          width: size,
          height: size * 1.4,
          borderRadius: 2,
          bgcolor: imageUrl ? 'rgba(0,0,0,0.2)' : color,
          opacity: imageUrl ? 1 : 0.4,
          border: `2px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <Box
            component='img'
            src={imageUrl}
            alt={label}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Typography sx={{ fontSize: compact ? 20 : 32, opacity: 0.6 }}>
            👤
          </Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: compact ? 9 : 11, color: '#bbb', textAlign: 'center', maxWidth: size + 20 }}>
        {label}
      </Typography>
    </Box>
  );
};

export const CharacterPortrait: React.FC = () => {
  const layout = useResponsiveLayout();
  const uiMode = useGameState((s) => s.uiMode);
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const modManifest = useModAssets((s) => s.manifest);
  const modRevision = useModAssets((s) => s.revision);

  const actor = selectedActorId ? worldState?.characters[selectedActorId] : null;
  const target = selectedTargetId ? worldState?.characters[selectedTargetId] : null;

  // Hide when graph overlay is active or on mobile
  if (uiMode === 'graph' || layout.isMobile) return null;

  const compact = layout.isTablet;
  const bottomOffset = layout.dialogueHeight + 2; // above dialogue box
  const actorPortrait = actor
    ? modManifest?.portraitsByCharacter?.[actor.id] ?? modManifest?.portraits?.left
    : undefined;
  const targetPortrait = target
    ? modManifest?.portraitsByCharacter?.[target.id] ?? modManifest?.portraits?.right
    : undefined;

  const withRev = (url?: string) => {
    if (!url) return undefined;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${modRevision}`;
  };

  return (
    <Fade in={!!actor || !!target} timeout={300}>
      <Box
        sx={{
          position: 'absolute',
          bottom: `${bottomOffset}vh`,
          left: layout.statusBarWidth,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          px: 2,
          pointerEvents: 'none',
          zIndex: 8,
        }}
      >
        {/* Actor portrait (left) */}
        <Box>
          {actor && (
            <PortraitPlaceholder
              label={translateLabel(actor.label)}
              color="#4caf50"
              side="left"
              compact={compact}
              imageUrl={withRev(actorPortrait)}
            />
          )}
        </Box>

        {/* Target portrait (right) */}
        <Box>
          {target && (
            <PortraitPlaceholder
              label={translateLabel(target.label)}
              color="#ff9800"
              side="right"
              compact={compact}
              imageUrl={withRev(targetPortrait)}
            />
          )}
        </Box>
      </Box>
    </Fade>
  );
};
