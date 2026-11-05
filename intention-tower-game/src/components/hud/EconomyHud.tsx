import React, { useState } from 'react';
import { Box, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { translateLabel } from '../../i18n';
import { useGameState } from '../../store/useGameState';

export const EconomyHud: React.FC = () => {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const [expanded, setExpanded] = useState(false);
  const world = useGameState((state) => state.worldState);
  const actorId = useGameState((state) => state.selectedActorId);
  const assets = world ? Object.values(world.economy.assets) : [];

  if (!world || assets.length === 0) return null;
  const balance = actorId ? world.economy.accounts[actorId] ?? 0 : 0;
  const lastTrade = world.economy.transactions[world.economy.transactions.length - 1];

  return (
    <Box
      data-testid="economy-hud"
      sx={{
        position: 'relative',
        width: '100%',
        mb: 2,
        p: 0.75,
        bgcolor: 'rgba(255,248,232,0.94)',
        border: '1px solid rgba(255,202,40,0.35)',
        borderRadius: 1,
        backdropFilter: 'blur(7px)',
        pointerEvents: 'auto',
        zIndex: 12,
      }}
    >
      <Box role="button" tabIndex={0} aria-expanded={expanded} onClick={() => setExpanded(!expanded)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpanded(!expanded); } }} sx={{ display: 'flex', minHeight: 44, alignItems: 'center', gap: 0.5, mb: 0.5, cursor: 'pointer' }}>
        <Typography sx={{ flex: 1, fontSize: 13, color: '#7d653a', fontWeight: 700 }}>
          {t('economy.title')}
        </Typography>
        <Chip
          label={t('economy.balance', { value: balance.toFixed(0) })}
          size="small"
          sx={{ height: 17, fontSize: 8, bgcolor: 'rgba(255,202,40,0.12)' }}
        />
      </Box>
      {(!layout.isMobile || expanded) && assets.slice(0, 2).map((asset) => (
        <Box key={asset.item_id} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12, color: '#75644d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {translateLabel(world.items[asset.item_id]?.label ?? asset.item_id)}
          </Typography>
          <Typography sx={{ fontSize: 8, color: '#806c55' }}>
            {t('economy.asset', { price: asset.unit_price.toFixed(0), supply: asset.supply.toFixed(0) })}
          </Typography>
        </Box>
      ))}
      {lastTrade && (!layout.isMobile || expanded) && (
        <Typography sx={{ mt: 0.4, fontSize: 8, color: '#40775d' }}>
          {t('economy.lastTrade', { buyer: lastTrade.buyer_id, total: lastTrade.total_price.toFixed(0) })}
        </Typography>
      )}
    </Box>
  );
};
