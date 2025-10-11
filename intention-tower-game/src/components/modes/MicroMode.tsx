/**
 * 微操模式组件
 */
import React, { useEffect } from 'react';
import { useEntityStore } from '../../store/entityStore';
import { useGameStore } from '../../store/gameStore';
import { SimpleRenderer } from '../renderers/SimpleRenderer';

const MOVE_SPEED = 3;

export const MicroMode: React.FC = () => {
  const controlledCharacterId = useGameStore((state) => state.controlledCharacterId);
  const updateCharacter = useEntityStore((state) => state.updateCharacter);
  const getCharacter = useEntityStore((state) => state.getCharacter);
  const setCameraPosition = useGameStore((state) => state.setCameraPosition);

  const controlledCharacter = controlledCharacterId ? getCharacter(controlledCharacterId) : undefined;

  // WAD 移动，W 跳跃
  useEffect(() => {
    if (!controlledCharacterId || !controlledCharacter) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === 'a') {
        updateCharacter(controlledCharacterId, {
          position: {
            x: controlledCharacter.position.x - MOVE_SPEED,
            y: controlledCharacter.position.y,
          },
        });
      } else if (key === 'd') {
        updateCharacter(controlledCharacterId, {
          position: {
            x: controlledCharacter.position.x + MOVE_SPEED,
            y: controlledCharacter.position.y,
          },
        });
      } else if (key === 'w') {
        // TODO: 实现跳跃逻辑
        console.log('Jump!');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [controlledCharacterId, controlledCharacter, updateCharacter]);

  // 摄像机跟随控制的角色
  useEffect(() => {
    if (controlledCharacter) {
      setCameraPosition({
        x: controlledCharacter.position.x - window.innerWidth / 2,
        y: controlledCharacter.position.y - window.innerHeight / 2,
      });
    }
  }, [controlledCharacter, setCameraPosition]);

  if (!controlledCharacter) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'white' }}>请先选择要控制的角色</p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SimpleRenderer />

      {/* 十字准星/中心标记 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 4,
          height: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
