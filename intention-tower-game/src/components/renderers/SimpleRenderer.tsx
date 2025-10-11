/**
 * 简单的 Canvas 游戏渲染器
 */
import React, { useEffect, useRef } from 'react';
import { useEntityStore } from '../../store/entityStore';
import { useGameStore } from '../../store/gameStore';

export const SimpleRenderer: React.FC = () => {
  const canvasReference = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasReference.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrameId: number;

    const render = () => {
      // 获取最新状态
      const cameraPosition = useGameStore.getState().cameraPosition;
      const characters = Object.values(useEntityStore.getState().characters);
      const items = Object.values(useEntityStore.getState().items);
      const selectedIds = useGameStore.getState().selectedCharacterIds;

      // 清空画布
      context.fillStyle = '#1a1a1a';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // 渲染角色
      characters.forEach((character) => {
        const screenX = character.position.x - cameraPosition.x;
        const screenY = character.position.y - cameraPosition.y;

        // 选中框
        if (selectedIds.includes(character.id)) {
          context.strokeStyle = '#ffff00';
          context.lineWidth = 2;
          context.strokeRect(screenX - 20, screenY - 20, 40, 40);
        }

        // 角色字符
        context.fillStyle = '#ffffff';
        context.font = '24px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(character.fallbackChar || '@', screenX, screenY);

        // 名称
        context.fillStyle = '#aaaaaa';
        context.font = '12px sans-serif';
        context.fillText(character.name, screenX, screenY + 25);
      });

      // 渲染物品
      items.forEach((item) => {
        if (!item.position) return;
        
        const screenX = item.position.x - cameraPosition.x;
        const screenY = item.position.y - cameraPosition.y;

        context.fillStyle = '#ffaa00';
        context.font = '20px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(item.fallbackChar || '?', screenX, screenY);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // 处理鼠标点击
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasReference.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cameraPosition = useGameStore.getState().cameraPosition;
    const characters = Object.values(useEntityStore.getState().characters);
    const clickX = event.clientX - rect.left + cameraPosition.x;
    const clickY = event.clientY - rect.top + cameraPosition.y;

    // 查找点击的角色
    for (const character of characters) {
      const distance = Math.hypot(clickX - character.position.x, clickY - character.position.y);
      if (distance < 30) {
        useGameStore.getState().selectCharacter(character.id);
        return;
      }
    }
  };

  // 处理双击
  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasReference.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cameraPosition = useGameStore.getState().cameraPosition;
    const characters = Object.values(useEntityStore.getState().characters);
    const clickX = event.clientX - rect.left + cameraPosition.x;
    const clickY = event.clientY - rect.top + cameraPosition.y;

    for (const character of characters) {
      const distance = Math.hypot(clickX - character.position.x, clickY - character.position.y);
      if (distance < 30) {
        useGameStore.getState().openCharacterDetail(character.id);
        return;
      }
    }
  };

  // 处理右键
  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasReference.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cameraPosition = useGameStore.getState().cameraPosition;
    const characters = Object.values(useEntityStore.getState().characters);
    const clickX = event.clientX - rect.left + cameraPosition.x;
    const clickY = event.clientY - rect.top + cameraPosition.y;

    for (const character of characters) {
      const distance = Math.hypot(clickX - character.position.x, clickY - character.position.y);
      if (distance < 30) {
        useGameStore.getState().openCommandMenu(
          { x: event.clientX, y: event.clientY },
          character.id,
        );
        return;
      }
    }
  };

  return (
    <canvas
      ref={canvasReference}
      width={window.innerWidth}
      height={window.innerHeight}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      style={{ display: 'block' }}
    />
  );
};
