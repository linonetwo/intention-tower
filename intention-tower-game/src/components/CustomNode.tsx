import React from 'react';
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

export const CustomNode: React.FC<any> = (props) => {
  // 提取基本属性
  const width = props.width || 120;
  const height = props.height || 60;
  const id = props.id;
  const text = props.text;

  // 尝试获取节点数据
  let nodeData = props.data;

  // 如果data不存在，尝试从其他可能的位置获取
  if (!nodeData && props.properties) {
    nodeData = props.properties.data;
  }

  if (!nodeData && props.node) {
    nodeData = props.node.data;
  }

  // 如果没有节点数据，返回默认节点
  if (!nodeData) {
    const radius = Math.min(width, height) * 0.4;
    return (
      <g>
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill='#f0f0f0'
          stroke='#ccc'
          strokeWidth={2}
        />
        <text
          x={0}
          y={0}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize='10'
          fill='#666'
        >
          {text || (typeof id === 'string' ? id.replace(/^ref-\d+-node-/, '') : 'Node')}
        </text>
      </g>
    );
  }

  const colors = getNodeColors(nodeData.type);
  const isActive = nodeData.isActive;
  const radius = Math.min(width, height) * 0.4;

  return (
    <g
      className={`custom-node ${isActive ? 'active' : ''}`}
      data-node-id={id}
      style={{ cursor: 'pointer' }}
    >
      {/* 主节点圆形 - 使用相对坐标 */}
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill={colors.background}
        stroke={colors.border}
        strokeWidth={isActive ? 3 : 2}
        style={{
          filter: isActive ? 'drop-shadow(0 0 6px rgba(76, 175, 80, 0.4))' : 'none',
          transition: 'all 0.2s ease',
        }}
      />

      {/* 激活状态的脉冲效果 */}
      {isActive && (
        <circle
          cx={0}
          cy={0}
          r={radius + 5}
          fill='none'
          stroke={colors.border}
          strokeWidth={1}
          opacity={0.6}
          className='pulse-ring'
        />
      )}

      {/* 数值填充指示器（圆环进度条） */}
      {nodeData.threshold.length > 0 && nodeData.value > 0 && (
        <circle
          cx={0}
          cy={0}
          r={radius - 8}
          fill='none'
          stroke={colors.border}
          strokeWidth={4}
          opacity={0.3}
          strokeDasharray={`${(nodeData.value / Math.max(...nodeData.threshold)) * 2 * Math.PI * (radius - 8)} ${2 * Math.PI * (radius - 8)}`}
          strokeDashoffset={-Math.PI * (radius - 8) / 2}
          transform='rotate(-90)'
        />
      )}

      {/* 节点文本 */}
      <text
        x={0}
        y={-3}
        textAnchor='middle'
        dominantBaseline='middle'
        fontSize='10'
        fontWeight={isActive ? 'bold' : 'normal'}
        fill={colors.text}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {nodeData.label}
      </text>

      {/* 数值显示 */}
      <text
        x={0}
        y={8}
        textAnchor='middle'
        dominantBaseline='middle'
        fontSize='8'
        fill={colors.text}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {Math.round(nodeData.value)}
      </text>

      {/* 激活状态指示器 */}
      {isActive && (
        <circle
          cx={radius - 5}
          cy={-radius + 5}
          r={4}
          fill='#4CAF50'
          stroke='white'
          strokeWidth={1}
          className='pulse-dot'
        />
      )}
    </g>
  );
};
