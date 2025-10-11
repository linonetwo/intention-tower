/**
 * 图谱渲染器 - 使用 SVG 渲染节点和边
 */
import React, { useMemo } from 'react';
import type { GraphEdge, GraphNode } from '../../types/game';

interface GraphRendererProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  activeNodeIds: Set<string>;
}

export const GraphRenderer: React.FC<GraphRendererProps> = ({ nodes, edges, activeNodeIds }) => {
  // 计算布局（简单的强制导向布局的初步位置）
  const layoutNodes = useMemo(() => {
    return nodes.map((node, index) => ({
      ...node,
      x: node.position?.x ?? 200 + (index % 5) * 150,
      y: node.position?.y ?? 100 + Math.floor(index / 5) * 150,
    }));
  }, [nodes]);

  return (
    <svg width="100%" height="100%" style={{ backgroundColor: 'transparent' }}>
      {/* 渲染边 */}
      {edges.map((edge) => {
        const sourceNode = layoutNodes.find((n) => n.id === edge.source);
        const targetNode = layoutNodes.find((n) => n.id === edge.target);

        if (!sourceNode || !targetNode) return null;

        const isInhibitory = edge.type === 'inhibitory';
        const strokeColor = isInhibitory ? '#ff4444' : '#44ff44';
        const strokeDasharray = edge.visualType === 'dashed' ? '5,5' : 'none';

        return (
          <g key={edge.id}>
            <line
              x1={sourceNode.x}
              y1={sourceNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke={strokeColor}
              strokeWidth={2 + edge.strength * 2}
              strokeDasharray={strokeDasharray}
              opacity={0.3 + edge.strength * 0.7}
            />
            {/* 箭头 */}
            {edge.visualType === 'solid' && (
              <polygon
                points={`${targetNode.x},${targetNode.y} ${targetNode.x - 10},${targetNode.y - 5} ${targetNode.x - 10},${targetNode.y + 5}`}
                fill={strokeColor}
                opacity={0.3 + edge.strength * 0.7}
              />
            )}
          </g>
        );
      })}

      {/* 渲染节点 */}
      {layoutNodes.map((node) => {
        const isActive = activeNodeIds.has(node.id);
        const nodeColor = {
          sensory: '#4a9eff',
          cognitive: '#ff9a4a',
          biological: '#4aff9a',
        }[node.layer];

        return (
          <g key={node.id}>
            {/* 激活光晕 */}
            {isActive && (
              <circle
                cx={node.x}
                cy={node.y}
                r={45}
                fill="none"
                stroke={nodeColor}
                strokeWidth={3}
                opacity={0.6}
              />
            )}
            
            {/* 节点圆圈 */}
            <circle
              cx={node.x}
              cy={node.y}
              r={30}
              fill={nodeColor}
              opacity={isActive ? 1 : 0.6}
              stroke="#fff"
              strokeWidth={2}
            />
            
            {/* 节点标签 */}
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize={12}
              fontWeight="bold"
            >
              {node.label.length > 8 ? `${node.label.slice(0, 8)}...` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
