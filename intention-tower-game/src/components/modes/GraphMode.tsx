/**
 * 图谱模式组件
 */
import React, { useEffect, useRef } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { GraphRenderer } from '../renderers/GraphRenderer';

export const GraphMode: React.FC = () => {
  const nodes = useGraphStore((state) => Object.values(state.nodes));
  const edges = useGraphStore((state) => Object.values(state.edges));
  const propagateSignal = useGraphStore((state) => state.propagateSignal);
  const activeNodeIds = useGraphStore((state) => state.activeNodeIds);

  const containerRef = useRef<HTMLDivElement>(null);

  // TODO: qwer 使用技能
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      
      if (key === 'q') {
        console.log('Use ability Q');
        // 测试：激活第一个节点
        if (nodes.length > 0) {
          propagateSignal(nodes[0].id);
        }
      } else if (key === 'w') {
        console.log('Use ability W');
      } else if (key === 'e') {
        console.log('Use ability E');
      } else if (key === 'r') {
        console.log('Use ability R');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [nodes, propagateSignal]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a2e',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 左侧角色立绘 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 200,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#888', fontSize: 12 }}>我方角色</p>
      </div>

      {/* 右侧角色立绘 */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 200,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#888', fontSize: 12 }}>对手</p>
      </div>

      {/* 中间图谱区域 */}
      <div
        style={{
          position: 'absolute',
          left: 200,
          right: 200,
          top: 0,
          bottom: 100,
        }}
      >
        <GraphRenderer nodes={nodes} edges={edges} activeNodeIds={activeNodeIds} />
      </div>

      {/* 底部技能栏 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 100,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: 18, marginBottom: 4 }}>Q</div>
          <div style={{ color: '#888', fontSize: 12 }}>技能1</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: 18, marginBottom: 4 }}>W</div>
          <div style={{ color: '#888', fontSize: 12 }}>技能2</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: 18, marginBottom: 4 }}>E</div>
          <div style={{ color: '#888', fontSize: 12 }}>技能3</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: 18, marginBottom: 4 }}>R</div>
          <div style={{ color: '#888', fontSize: 12 }}>技能4</div>
        </div>
      </div>
    </div>
  );
};
