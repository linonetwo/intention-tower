/**
 * 关卡选择页面
 */
import React from 'react';
import { levels } from '../../data/levels';
import { useEntityStore } from '../../store/entityStore';
import { useGameStore } from '../../store/gameStore';
import { useGraphStore } from '../../store/graphStore';

export const LevelSelect: React.FC = () => {
  const setMode = useGameStore((state) => state.setMode);
  const setCurrentLevel = useGameStore((state) => state.setCurrentLevel);
  const setCharacters = useEntityStore((state) => state.setCharacters);
  const setItems = useEntityStore((state) => state.setItems);
  const setGraph = useGraphStore((state) => state.setGraph);

  const handleSelectLevel = (levelId: string) => {
    const level = levels.find((l) => l.id === levelId);
    if (!level) return;

    // 加载关卡数据
    setCurrentLevel(levelId);
    setCharacters(level.characters);
    setItems(level.items);

    if (level.graph) {
      setGraph(level.graph.nodes, level.graph.edges);
    }

    // 切换到初始模式
    setMode(level.initialMode);
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0a0a1e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}
    >
      <h1 style={{ color: '#fff', marginBottom: 60, fontSize: 48 }}>意念之塔</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 30,
          maxWidth: 1200,
          width: '100%',
        }}
      >
        {levels.map((level) => (
          <div
            key={level.id}
            onClick={() => {
              handleSelectLevel(level.id);
            }}
            style={{
              backgroundColor: '#1a1a3e',
              borderRadius: 12,
              padding: 30,
              cursor: 'pointer',
              transition: 'all 0.3s',
              border: '2px solid #2a2a5e',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'translateY(-8px)';
              event.currentTarget.style.boxShadow = '0 8px 30px rgba(100, 100, 255, 0.3)';
              event.currentTarget.style.borderColor = '#4a4aff';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'translateY(0)';
              event.currentTarget.style.boxShadow = 'none';
              event.currentTarget.style.borderColor = '#2a2a5e';
            }}
          >
            <h2 style={{ color: '#fff', marginBottom: 15, fontSize: 24 }}>{level.name}</h2>
            <p style={{ color: '#aaa', lineHeight: 1.6, fontSize: 14 }}>{level.description}</p>

            {level.objectives && level.objectives.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>目标：</h3>
                <ul style={{ color: '#888', fontSize: 12, paddingLeft: 20 }}>
                  {level.objectives.map((objective, index) => (
                    <li key={index} style={{ marginBottom: 5 }}>
                      {objective}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 60, color: '#666', fontSize: 14 }}>
        <p>提示：使用 G 键切换模式 | Space/1234 控制时间 | ESC 返回菜单</p>
      </div>
    </div>
  );
};
