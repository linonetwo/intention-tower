import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Divider,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { t as translateLabel } from '../../i18n';
import { useGameState } from '../../store/useGameState';

export const RoleDetailPanel: React.FC = () => {
  const { t } = useTranslation();
  const worldState = useGameState((s) => s.worldState);
  const inspectedCharacterId = useGameState((s) => s.inspectedCharacterId);
  const [tab, setTab] = useState(0);

  const character = inspectedCharacterId && worldState
    ? worldState.characters[inspectedCharacterId] ?? null
    : null;

  const graphStats = useMemo(() => {
    if (!character) {
      return { totalNodes: 0, activeNodes: 0, totalEdges: 0, memes: 0 };
    }
    const nodes = Object.values(character.mind_graph.nodes);
    const edges = Object.values(character.mind_graph.edges);
    return {
      totalNodes: nodes.length,
      activeNodes: nodes.filter((node) => node.active && node.attended).length,
      totalEdges: edges.length,
      memes: nodes.filter((node) => node.node_type === 'Meme').length,
    };
  }, [character]);

  const resources = useMemo(() => {
    if (!character) return [];
    return Object.values(character.mind_graph.nodes)
      .filter((node) => node.prior_instinct?.is_resource)
      .sort((a, b) => b.value - a.value);
  }, [character]);

  const nearbyItems = useMemo(() => {
    if (!character || !worldState) return [];
    const { x, y } = character.position;
    return Object.values(worldState.items)
      .map((item) => {
        const dx = item.position.x - x;
        const dy = item.position.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return { item, distance };
      })
      .filter((entry) => entry.distance <= 2.5)
      .sort((a, b) => a.distance - b.distance);
  }, [character, worldState]);

  return (
    <Box sx={{ borderTop: '1px solid #2a2a4e', bgcolor: '#111123' }}>
      <Box sx={{ px: 1, py: 0.6 }}>
        <Typography sx={{ fontSize: 10, color: '#888' }}>{t('role.title')}</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#ddd' }}>
          {character ? translateLabel(character.label) : t('role.empty')}
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        variant='fullWidth'
        sx={{
          minHeight: 28,
          borderTop: '1px solid #2a2a4e',
          borderBottom: '1px solid #2a2a4e',
          '& .MuiTab-root': { minHeight: 28, fontSize: 11, textTransform: 'none', color: '#999' },
          '& .Mui-selected': { color: '#ddd !important' },
        }}
      >
        <Tab label={t('role.tab.stats')} />
        <Tab label={t('role.tab.graph')} />
        <Tab label={t('role.tab.bag')} />
      </Tabs>

      <Box sx={{ p: 1, minHeight: 140, maxHeight: 200, overflow: 'auto' }}>
        {!character && (
          <Typography sx={{ fontSize: 12, color: '#666' }}>{t('role.empty')}</Typography>
        )}

        {character && tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
            <Typography sx={{ fontSize: 11, color: '#aaa' }}>
              {t('role.position', { x: character.position.x.toFixed(2), y: character.position.y.toFixed(2) })}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#aaa' }}>
              {t('role.tick', { tick: worldState?.tick ?? 0 })}
            </Typography>
            <Divider sx={{ borderColor: '#2a2a4e' }} />
            {resources.length === 0 && (
              <Typography sx={{ fontSize: 11, color: '#777' }}>{t('role.noResource')}</Typography>
            )}
            {resources.map((node) => (
              <Box key={node.instance_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {translateLabel(node.label)}
                </Typography>
                <Chip
                  label={node.value.toFixed(2)}
                  size='small'
                  sx={{ height: 18, fontSize: 10, fontFamily: 'monospace', bgcolor: 'rgba(255,255,255,0.06)' }}
                />
              </Box>
            ))}
          </Box>
        )}

        {character && tab === 1 && (
          <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
            <Chip label={t('role.graph.nodes', { count: graphStats.totalNodes })} size='small' sx={{ height: 20, fontSize: 10 }} />
            <Chip label={t('role.graph.active', { count: graphStats.activeNodes })} size='small' sx={{ height: 20, fontSize: 10 }} />
            <Chip label={t('role.graph.edges', { count: graphStats.totalEdges })} size='small' sx={{ height: 20, fontSize: 10 }} />
            <Chip label={t('role.graph.memes', { count: graphStats.memes })} size='small' sx={{ height: 20, fontSize: 10 }} />
          </Box>
        )}

        {character && tab === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
            {nearbyItems.length === 0 && (
              <Typography sx={{ fontSize: 11, color: '#777' }}>{t('role.bag.empty')}</Typography>
            )}
            {nearbyItems.map(({ item, distance }) => (
              <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {translateLabel(item.label)}
                </Typography>
                <Typography sx={{ fontSize: 10, color: '#777', fontFamily: 'monospace' }}>
                  {t('role.distance', { distance: distance.toFixed(2) })}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
