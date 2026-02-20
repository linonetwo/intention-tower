/**
 * WorldPanel — left sidebar showing characters and items.
 * Click a character to inspect their mind graph or set them as actor/target.
 */
import React from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemIcon, ListItemText,
  Divider, Chip, Select, MenuItem, FormControl, InputLabel, type SelectChangeEvent,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import InventoryIcon from '@mui/icons-material/Inventory2';
import { useGameState } from '../../store/useGameState';
import { t } from '../../i18n';
import type { WorldCharacter, WorldItem } from '../../types/backend';

const CharacterEntry: React.FC<{
  char: WorldCharacter;
  isActor: boolean;
  isTarget: boolean;
  isInspected: boolean;
}> = ({ char, isActor, isTarget, isInspected }) => {
  const inspectCharacter = useGameState((s) => s.inspectCharacter);

  return (
    <ListItemButton
      selected={isInspected}
      onClick={() => inspectCharacter(char.id)}
      sx={{ py: 0.5, borderLeft: isActor ? '3px solid #4caf50' : isTarget ? '3px solid #ff9800' : '3px solid transparent' }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>
        <PersonIcon sx={{ fontSize: 18, color: isActor ? '#4caf50' : isTarget ? '#ff9800' : '#888' }} />
      </ListItemIcon>
      <ListItemText
        primary={t(char.label)}
        primaryTypographyProps={{ fontSize: 13, fontWeight: isInspected ? 600 : 400 }}
      />
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {isActor && <Chip label="执行" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />}
        {isTarget && <Chip label="目标" size="small" color="warning" sx={{ height: 18, fontSize: 10 }} />}
      </Box>
    </ListItemButton>
  );
};

const ItemEntry: React.FC<{ item: WorldItem }> = ({ item }) => {
  return (
    <ListItemButton sx={{ py: 0.5 }} disabled>
      <ListItemIcon sx={{ minWidth: 32 }}>
        <InventoryIcon sx={{ fontSize: 16, color: '#ffab00' }} />
      </ListItemIcon>
      <ListItemText
        primary={t(item.label)}
        primaryTypographyProps={{ fontSize: 12, color: '#aaa' }}
        secondary={item.schema_type.replace('schema:', '')}
        secondaryTypographyProps={{ fontSize: 10 }}
      />
    </ListItemButton>
  );
};

export const WorldPanel: React.FC = () => {
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);
  const selectedTargetId = useGameState((s) => s.selectedTargetId);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);
  const selectActor = useGameState((s) => s.selectActor);
  const selectTarget = useGameState((s) => s.selectTarget);

  if (!worldState) return null;

  const characters = Object.values(worldState.characters);
  const items = Object.values(worldState.items);

  const handleActorChange = (e: SelectChangeEvent) => {
    selectActor(e.target.value || null);
  };

  const handleTargetChange = (e: SelectChangeEvent) => {
    selectTarget(e.target.value || null);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Actor / Target selectors */}
      <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <FormControl size="small" fullWidth>
          <InputLabel sx={{ fontSize: 12 }}>执行者</InputLabel>
          <Select
            value={selectedActorId ?? ''}
            label="执行者"
            onChange={handleActorChange}
            sx={{ fontSize: 12 }}
          >
            {characters.map((c) => (
              <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12 }}>
                {t(c.label)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel sx={{ fontSize: 12 }}>目标</InputLabel>
          <Select
            value={selectedTargetId ?? ''}
            label="目标"
            onChange={handleTargetChange}
            sx={{ fontSize: 12 }}
          >
            <MenuItem value="" sx={{ fontSize: 12 }}><em>无</em></MenuItem>
            {characters.map((c) => (
              <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12 }}>
                {t(c.label)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Divider />

      {/* Characters */}
      <Typography variant="overline" sx={{ px: 1, pt: 0.5, fontSize: 10, color: '#888' }}>
        角色
      </Typography>
      <List dense disablePadding sx={{ flexShrink: 0 }}>
        {characters.map((c) => (
          <CharacterEntry
            key={c.id}
            char={c}
            isActor={c.id === selectedActorId}
            isTarget={c.id === selectedTargetId}
            isInspected={c.id === inspectedCharacterId}
          />
        ))}
      </List>

      <Divider />

      {/* Items */}
      <Typography variant="overline" sx={{ px: 1, pt: 0.5, fontSize: 10, color: '#888' }}>
        物品
      </Typography>
      <List dense disablePadding sx={{ overflow: 'auto', flex: 1 }}>
        {items.map((item) => (
          <ItemEntry key={item.id} item={item} />
        ))}
      </List>
    </Box>
  );
};
