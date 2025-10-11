/**
 * 观察模式组件
 */
import React, { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { SimpleRenderer } from '../renderers/SimpleRenderer';

const CAMERA_SPEED = 5;

export const ObserveMode: React.FC = () => {
  const moveCamera = useGameStore((state) => state.moveCamera);

  // WASD 移动摄像机
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key.toLowerCase()) {
        case 'w':
          moveCamera({ x: 0, y: -CAMERA_SPEED });
          break;
        case 'a':
          moveCamera({ x: -CAMERA_SPEED, y: 0 });
          break;
        case 's':
          moveCamera({ x: 0, y: CAMERA_SPEED });
          break;
        case 'd':
          moveCamera({ x: CAMERA_SPEED, y: 0 });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moveCamera]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <SimpleRenderer />
    </div>
  );
};
