/**
 * SceneContextMenu — right-click command menu that appears over the scene canvas.
 * Listens for 'scene-context-menu' custom events from GameScene.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ContextCommandMenu } from '../panels/ContextCommandMenu';
import { useGameState } from '../../store/useGameState';
import { translateLabel } from '../../i18n';
import { useTranslation } from 'react-i18next';

export const SceneContextMenu: React.FC = () => {
  const { t } = useTranslation();
  const worldState = useGameState((s) => s.worldState);
  const selectedActorId = useGameState((s) => s.selectedActorId);

  const [menuState, setMenuState] = useState<{
    pos: { top: number; left: number } | null;
    charId: string | null;
  }>({ pos: null, charId: null });

  const handleContextMenu = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as { charId: string; clientX: number; clientY: number };
    setMenuState({
      pos: { top: detail.clientY, left: detail.clientX },
      charId: detail.charId,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('scene-context-menu', handleContextMenu);
    return () => window.removeEventListener('scene-context-menu', handleContextMenu);
  }, [handleContextMenu]);

  const handleClose = useCallback(() => {
    setMenuState({ pos: null, charId: null });
  }, []);

  const actorId = selectedActorId ?? menuState.charId;
  const targetId = selectedActorId === menuState.charId ? null : menuState.charId;

  const actorLabel = actorId && worldState?.characters[actorId]
    ? translateLabel(worldState.characters[actorId].label)
    : t('world.none');
  const targetLabel = targetId && worldState?.characters[targetId]
    ? translateLabel(worldState.characters[targetId].label)
    : t('world.none');

  return (
    <ContextCommandMenu
      open={!!menuState.pos}
      anchorPosition={menuState.pos}
      actorId={actorId}
      targetId={targetId}
      actorLabel={actorLabel}
      targetLabel={targetLabel}
      onClose={handleClose}
    />
  );
};
