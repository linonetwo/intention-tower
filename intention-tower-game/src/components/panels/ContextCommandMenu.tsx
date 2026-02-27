import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useTranslation } from 'react-i18next';
import * as api from '../../api/tauriApi';
import { t as translateLabel } from '../../i18n';
import { useGameState } from '../../store/useGameState';
import type { CommandDef } from '../../types/backend';

interface ContextCommandMenuProps {
  open: boolean;
  anchorPosition: { top: number; left: number } | null;
  actorId: string | null;
  targetId: string | null;
  actorLabel: string;
  targetLabel: string;
  onClose: () => void;
}

export const ContextCommandMenu: React.FC<ContextCommandMenuProps> = ({
  open,
  anchorPosition,
  actorId,
  targetId,
  actorLabel,
  targetLabel,
  onClose,
}) => {
  const { t } = useTranslation();
  const executeCommand = useGameState((s) => s.executeCommand);
  const selectActor = useGameState((s) => s.selectActor);
  const selectTarget = useGameState((s) => s.selectTarget);

  const [loading, setLoading] = useState(false);
  const [commands, setCommands] = useState<CommandDef[]>([]);

  useEffect(() => {
    if (!open) {
      setCommands([]);
      setLoading(false);
      return;
    }

    if (!actorId) {
      setCommands([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api.listCommands(actorId, targetId)
      .then((result) => {
        if (!cancelled) setCommands(result);
      })
      .catch(() => {
        if (!cancelled) setCommands([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, actorId, targetId]);

  const executableCommands = useMemo(() => {
    return commands.map((cmd) => ({
      ...cmd,
      disabled: cmd.targeting === 'RequiresTarget' && !targetId,
    }));
  }, [commands, targetId]);

  const runCommand = async (commandId: string) => {
    if (!actorId) return;
    selectActor(actorId);
    selectTarget(targetId);
    await executeCommand(commandId);
    onClose();
  };

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? undefined}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: {
            minWidth: 260,
            bgcolor: '#17172e',
            border: '1px solid #2a2a4e',
            color: '#ddd',
          },
        },
      }}
    >
      <Box sx={{ px: 1.25, py: 0.75 }}>
        <Typography sx={{ fontSize: 11, color: '#888' }}>
          {t('command.contextTitle')}
        </Typography>
        <Typography sx={{ fontSize: 12 }}>
          {actorLabel} → {targetLabel}
        </Typography>
      </Box>

      <Divider />

      {!actorId && (
        <MenuItem disabled>
          <ListItemText primary={t('command.noActor')} primaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
      )}

      {actorId && loading && (
        <MenuItem disabled>
          <CircularProgress size={14} sx={{ mr: 1 }} />
          <ListItemText primary={t('command.loading')} primaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
      )}

      {actorId && !loading && executableCommands.length === 0 && (
        <MenuItem disabled>
          <ListItemText primary={t('command.noneAvailable')} primaryTypographyProps={{ fontSize: 12 }} />
        </MenuItem>
      )}

      {actorId && !loading && executableCommands.map((cmd) => {
        const label = translateLabel(cmd.label);

        return (
          <MenuItem
            key={cmd.command_id}
            disabled={cmd.disabled}
            onClick={() => runCommand(cmd.command_id)}
            sx={{ gap: 1, minHeight: 30 }}
          >
            <PlayArrowIcon sx={{ fontSize: 14, color: cmd.disabled ? '#666' : '#90caf9' }} />
            <ListItemText
              primary={label}
              primaryTypographyProps={{ fontSize: 12 }}
            />
            {cmd.hotkey && (
              <Chip
                label={cmd.hotkey}
                size="small"
                sx={{ height: 16, fontSize: 9, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.1)' }}
              />
            )}
            {cmd.targeting === 'RequiresTarget' && (
              <Chip
                label={t('command.needTargetTag')}
                size="small"
                variant="outlined"
                sx={{ height: 16, fontSize: 9, borderColor: '#666', color: '#aaa' }}
              />
            )}
          </MenuItem>
        );
      })}
    </Menu>
  );
};
