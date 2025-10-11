/**
 * 角色渲染器 - 使用 React Pixi 渲染角色
 */
import React, { useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { Character } from '../../types/game';

interface CharacterRendererProps {
  character: Character;
  cameraOffset: { x: number; y: number };
}

export const CharacterRenderer: React.FC<CharacterRendererProps> = ({ character, cameraOffset }) => {
  const selectCharacter = useGameStore((state) => state.selectCharacter);
  const openCharacterDetail = useGameStore((state) => state.openCharacterDetail);
  const openCommandMenu = useGameStore((state) => state.openCommandMenu);
  const selectedIds = useGameStore((state) => state.selectedCharacterIds);

  const isSelected = selectedIds.includes(character.id);

  // 计算屏幕位置
  const screenX = character.position.x - cameraOffset.x;
  const screenY = character.position.y - cameraOffset.y;

  const handleClick = useCallback(() => {
    selectCharacter(character.id);
  }, [selectCharacter, character.id]);

  const handleDoubleClick = useCallback(() => {
    openCharacterDetail(character.id);
  }, [openCharacterDetail, character.id]);

  const handleRightClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const clientX = (event as unknown as { clientX: number }).clientX || screenX;
      const clientY = (event as unknown as { clientY: number }).clientY || screenY;
      openCommandMenu({ x: clientX, y: clientY }, character.id);
    },
    [openCommandMenu, character.id, screenX, screenY],
  );

  // 如果有贴图，使用贴图；否则使用文字渲染
  if (character.sprite) {
    return (
      <pixiContainer
        x={screenX}
        y={screenY}
        eventMode="static"
        onclick={handleClick}
        ondblclick={handleDoubleClick}
        onrightclick={handleRightClick}
      >
        <pixiSprite
          image={character.sprite}
          anchor={0.5}
          tint={isSelected ? 0xffff00 : 0xffffff}
        />
        {/* 名称标签 */}
        <pixiText
          text={character.name}
          y={-40}
          anchor={0.5}
          style={{
            fontSize: 14,
            fill: 0xffffff,
          }}
        />
      </pixiContainer>
    );
  }

  // 回退到 roguelike 字符
  return (
    <pixiContainer
      x={screenX}
      y={screenY}
      eventMode="static"
      onclick={handleClick}
      ondblclick={handleDoubleClick}
      onrightclick={handleRightClick}
    >
      {/* 选中框 */}
      {isSelected && (
        <pixiText
          text='[]'
          anchor={0.5}
          style={{
            fontSize: 32,
            fill: 0xffff00,
          }}
        />
      )}
      
      {/* 角色字符 */}
      <pixiText
        text={character.fallbackChar || '@'}
        anchor={0.5}
        style={{
          fontSize: 24,
          fill: 0xffffff,
          fontFamily: 'monospace',
        }}
      />
      
      {/* 名称标签 */}
      <pixiText
        text={character.name}
        y={20}
        anchor={0.5}
        style={{
          fontSize: 12,
          fill: 0xaaaaaa,
        }}
      />
    </pixiContainer>
  );
};
