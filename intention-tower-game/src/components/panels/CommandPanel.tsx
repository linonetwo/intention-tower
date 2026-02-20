/**
 * CommandPanel — right sidebar showing available commands as clickable buttons.
 */
import React from 'react';
import {
  Box, Typography, Button, Divider, Chip, Tooltip, Alert,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useGameState } from '../../store/useGameState';
import { t } from '../../i18n';

export const CommandPanel: React.FC = () => {
  const availableCommands = useGameState((s) => s.availableCommands);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const worldState = useGameState((s) => s.worldState);
  const executeCommand = useGameState((s) => s.executeCommand);

  const actorLabel = selectedActorId && worldState?.characters[selectedActorId]
    ? t(worldState.characters[selectedActorId].label)
    : '未选择';
  const targetLabel = selectedTargetId && worldState?.characters[selectedTargetId]
    ? t(worldState.characters[selectedTargetId].label)
    : '无';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header: Actor → Target */}
      <Box sx={{ p: 1, pb: 0.5 }}>
        <Typography sx={{ fontSize: 10, color: '#888', mb: 0.5 }}>命令面板</Typography>
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
            请先选择执行者
          </Alert>
        )}

        {selectedActorId && availableCommands.length === 0 && (
          <Alert severity="info" sx={{ fontSize: 11, py: 0 }}>
            当前无可用命令
          </Alert>
        )}

        {availableCommands.map((cmd) => {
          const label = t(cmd.label);
          const needsTarget = cmd.targeting === 'RequiresTarget';
          const disabled = needsTarget && !selectedTargetId;

          return (
            <Tooltip
              key={cmd.command_id}
              title={disabled ? '此命令需要目标' : `执行: ${label}`}
              arrow
              placement="left"
            >
              <span> {/* Tooltip needs a non-disabled child */}
                <Button
                  variant="contained"
                  size="small"
                  fullWidth
                  disabled={disabled}
                  onClick={() => executeCommand(cmd.command_id)}
                  startIcon={<PlayArrowIcon sx={{ fontSize: 14 }} />}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontSize: 12,
                    py: 0.75,
                    bgcolor: 'rgba(100, 100, 255, 0.15)',
                    color: '#ccc',
                    '&:hover': { bgcolor: 'rgba(100, 100, 255, 0.3)' },
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
                        label="需目标"
                        size="small"
                        variant="outlined"
                        sx={{ height: 14, fontSize: 8, borderColor: '#666' }}
                      />
                    )}
                  </Box>
                </Button>
              </span>
            </Tooltip>
          );
        })}
      </Box>

      {/* Effect summary for selected command (future enhancement) */}
      <Divider />
      <Box sx={{ p: 1 }}>
        <Typography sx={{ fontSize: 9, color: '#555' }}>
          提示: 选择执行者和目标，然后点击命令按钮执行操作
        </Typography>
      </Box>
    </Box>
  );
};
