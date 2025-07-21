import React from 'react';
import { Node, NodeProps } from 'reaflow';
import { NodeType } from '../types/IntentionMap';

// 根据节点类型获取颜色
const getNodeColors = (type: NodeType) => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return {
        background: '#E3F2FD',
        border: '#2196F3',
        text: '#1976D2',
      };
    case NodeType.MOTIVATION:
      return {
        background: '#FFF3E0',
        border: '#FF9800',
        text: '#F57C00',
      };
    case NodeType.OBSERVATION:
      return {
        background: '#F3E5F5',
        border: '#9C27B0',
        text: '#7B1FA2',
      };
    case NodeType.MEME:
      return {
        background: '#E8F5E8',
        border: '#4CAF50',
        text: '#388E3C',
      };
    case NodeType.ACTION:
      return {
        background: '#FFEBEE',
        border: '#F44336',
        text: '#D32F2F',
      };
    default:
      return {
        background: '#F5F5F5',
        border: '#9E9E9E',
        text: '#616161',
      };
  }
};

export const CustomNode: React.FC<NodeProps> = (props) => {
  // 尝试获取节点数据
  const nodeData = (props as any).properties?.data;

  // 如果没有找到数据，显示默认节点
  if (!nodeData) {
    return (
      <Node
        {...props}
        style={{
          fill: '#f0f0f0',
          stroke: '#ccc',
          strokeWidth: 2,
          rx: 30,
          ry: 30,
        }}
      >
        <text
          x={props.width / 2}
          y={props.height / 2}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize='10'
          fill='#666'
        >
          {props.id}
        </text>
      </Node>
    );
  }

  const colors = getNodeColors(nodeData.type);
  const isActive = nodeData.isActive;

  return (
    <Node
      {...props}
      style={{
        fill: colors.background,
        stroke: colors.border,
        strokeWidth: isActive ? 3 : 2,
        rx: props.width / 2,
        ry: props.height / 2,
        filter: isActive ? 'drop-shadow(0 0 6px rgba(76, 175, 80, 0.4))' : 'none',
        cursor: 'pointer',
      }}
      className={isActive ? 'active-node' : ''}
    >
      {/* 节点标签 */}
      <text
        x={props.width / 2}
        y={props.height / 2 - 8}
        textAnchor='middle'
        dominantBaseline='middle'
        fontSize='10'
        fill={colors.text}
        fontWeight='bold'
      >
        {nodeData.label}
      </text>

      {/* 数值显示 */}
      <text
        x={props.width / 2}
        y={props.height / 2 + 6}
        textAnchor='middle'
        dominantBaseline='middle'
        fontSize='8'
        fill={colors.text}
      >
        {Math.round(nodeData.value)}
      </text>

      {/* 激活状态指示器 */}
      {isActive && (
        <circle
          cx={props.width - 8}
          cy={8}
          r={4}
          fill='#4CAF50'
          className='pulse-dot'
        />
      )}

      {/* 数值填充指示器 */}
      {nodeData.value > 0 && (
        <rect
          x={5}
          y={props.height - 8}
          width={Math.min((nodeData.value / Math.max(...nodeData.threshold, 1)) * (props.width - 10), props.width - 10)}
          height={3}
          fill={colors.border}
          rx={1.5}
          opacity={0.7}
        />
      )}
    </Node>
  );
};
