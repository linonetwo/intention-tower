/**
 * 主应用组件
 */
import React, { useEffect } from 'react';
import { GraphMode } from './components/modes/GraphMode';
import { MicroMode } from './components/modes/MicroMode';
import { ObserveMode } from './components/modes/ObserveMode';
import { LevelSelect } from './components/pages/LevelSelect';
import { useGameStore } from './store/gameStore';

const App: React.FC = () => {
  const mode = useGameStore((state) => state.mode);
  const setMode = useGameStore((state) => state.setMode);
  const setTimeSpeed = useGameStore((state) => state.setTimeSpeed);
  const timeSpeed = useGameStore((state) => state.timeSpeed);

  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      // ESC 返回菜单
      if (key === 'escape') {
        setMode('menu');
        return;
      }

      // G 切换到图谱模式
      if (key === 'g' && mode !== 'menu') {
        setMode(mode === 'graph' ? 'observe' : 'graph');
        return;
      }

      // M 切换到微操模式
      if (key === 'm' && mode !== 'menu') {
        setMode(mode === 'micro' ? 'observe' : 'micro');
        return;
      }

      // 时间控制：Space, 1, 2, 3, 4
      if (key === ' ') {
        setTimeSpeed(timeSpeed === 0 ? 1 : 0);
        event.preventDefault();
      } else if (key === '1') {
        setTimeSpeed(1);
      } else if (key === '2') {
        setTimeSpeed(2);
      } else if (key === '3') {
        setTimeSpeed(3);
      } else if (key === '4') {
        setTimeSpeed(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, setMode, setTimeSpeed, timeSpeed]);

  // 渲染当前模式
  const renderMode = () => {
    switch (mode) {
      case 'menu':
        return <LevelSelect />;
      case 'observe':
        return <ObserveMode />;
      case 'micro':
        return <MicroMode />;
      case 'graph':
        return <GraphMode />;
      default:
        return <LevelSelect />;
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {renderMode()}

      {/* 模式指示器 */}
      {mode !== 'menu' && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
          }}
        >
          {mode === 'observe' && '观察模式'}
          {mode === 'micro' && '微操模式'}
          {mode === 'graph' && '图谱模式'}
        </div>
      )}

      {/* 时间流速指示器 */}
      {mode !== 'menu' && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            padding: '8px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
          }}
        >
          时间: {timeSpeed === 0 ? '暂停' : `x${timeSpeed}`}
        </div>
      )}
    </div>
  );
};

export default App;
