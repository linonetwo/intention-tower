/**
 * SaveManager — dialog for saving/loading game state.
 * Triggered from TimeControls via a save button.
 */
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameStore, useGameState } from '../../store/useGameState';

interface SaveManagerProps {
  open: boolean;
  onClose: () => void;
}

export const SaveManager: React.FC<SaveManagerProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const saves = useGameState((s) => s.saves);
  const currentLevelId = useGameState((s) => s.currentLevelId);
  const worldState = useGameState((s) => s.worldState);
  const [newSlotName, setNewSlotName] = useState('');
  const slotIsValid = /^[A-Za-z0-9_-]{1,64}$/.test(newSlotName);

  useEffect(() => {
    if (open) {
      gameStore.getState().refreshSaves();
      // Generate default slot name
      const level = currentLevelId ?? 'save';
      const tick = worldState?.tick ?? 0;
      setNewSlotName(`${level}-tick${tick}`);
    }
  }, [open, currentLevelId, worldState?.tick]);

  const handleSave = async () => {
    if (!newSlotName.trim()) return;
    await gameStore.getState().saveGame(newSlotName.trim());
  };

  const handleLoad = async (slot: string) => {
    onClose();
    await gameStore.getState().loadSave(slot);
  };

  const handleDelete = async (slot: string) => {
    await gameStore.getState().deleteSave(slot);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='sm'
      fullWidth
      slotProps={{
        paper: { sx: { bgcolor: '#1a1a2e', color: '#ddd' } },
      }}
    >
      <DialogTitle sx={{ fontSize: 16, fontWeight: 600 }}>
        {t('save.title')}
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: '#2a2a4e' }}>
        {/* New save section */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
          <TextField
            size='small'
            label={t('save.slotName')}
            value={newSlotName}
            error={newSlotName.length > 0 && !slotIsValid}
            helperText={newSlotName.length > 0 && !slotIsValid ? t('save.slotHelp') : ' '}
            onChange={(event) => {
              setNewSlotName(event.target.value);
            }}
            sx={{
              flex: 1,
              '& .MuiInputBase-root': { color: '#ddd', fontSize: 13 },
              '& .MuiInputLabel-root': { color: '#888', fontSize: 12 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#444' },
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave();
            }}
          />
          <Button
            variant='contained'
            size='small'
            startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
            onClick={handleSave}
            disabled={!slotIsValid}
            sx={{
              textTransform: 'none',
              fontSize: 12,
              bgcolor: 'rgba(100,100,255,0.2)',
              '&:hover': { bgcolor: 'rgba(100,100,255,0.35)' },
            }}
          >
            {t('save.save')}
          </Button>
        </Box>

        <Divider sx={{ borderColor: '#2a2a4e', mb: 1 }} />

        {/* Existing saves */}
        {saves.length === 0
          ? (
            <Typography sx={{ fontSize: 13, color: '#666', textAlign: 'center', py: 3 }}>
              {t('save.empty')}
            </Typography>
          )
          : (
            <List dense disablePadding>
              {saves.map((save) => (
                <ListItem
                  key={save.slot}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                  }}
                >
                  <ListItemText
                    primary={save.slot}
                    secondary={
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.3 }}>
                        <Chip
                          label={t('save.tick', { tick: save.tick })}
                          size='small'
                          sx={{ height: 18, fontSize: 10, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.05)' }}
                        />
                        <Chip
                          label={save.timestamp}
                          size='small'
                          sx={{ height: 18, fontSize: 10, color: '#888', bgcolor: 'rgba(255,255,255,0.03)' }}
                        />
                      </Box>
                    }
                    primaryTypographyProps={{ fontSize: 13, fontWeight: 500, color: '#ccc' }}
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title={t('save.load')} arrow>
                      <IconButton
                        size='small'
                        onClick={() => {
                          void handleLoad(save.slot);
                        }}
                        sx={{ color: '#4caf50' }}
                      >
                        <DownloadIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('save.delete')} arrow>
                      <IconButton
                        size='small'
                        onClick={() => {
                          void handleDelete(save.slot);
                        }}
                        sx={{ color: '#f44336' }}
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
      </DialogContent>

      <DialogActions sx={{ borderTop: '1px solid #2a2a4e' }}>
        <Button onClick={onClose} sx={{ color: '#888', textTransform: 'none', fontSize: 12 }}>
          {t('save.cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
