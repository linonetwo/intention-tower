import React from 'react';
import { Node, NodeProps } from 'reaflow';
import { NodeType } from '../types/IntentionMap';

// 使用 SVG 路径代替 MUI 图标，更可靠
const getNodeIcon = (type: NodeType) => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return {
        path: "M13 3L4 14h5v5l9-11h-5V3z", // 闪电图标
        viewBox: "0 0 24 24"
      };
    case NodeType.MOTIVATION:
      return {
        path: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", // 星星图标
        viewBox: "0 0 24 24"
      };
    case NodeType.OBSERVATION:
      return {
        path: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z", // 眼睛图标
        viewBox: "0 0 24 24"
      };
    case NodeType.MEME:
      return {
        path: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z", // 分享图标
        viewBox: "0 0 24 24"
      };
    case NodeType.ACTION:
      return {
        path: "M8 5v14l11-7z", // 播放箭头图标
        viewBox: "0 0 24 24"
      };
    default:
      return {
        path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z", // 圆形图标
        viewBox: "0 0 24 24"
      };
  }
};

// 根据节点类型获取颜色样式
const getNodeStyle = (type: NodeType) => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return {
        background: '#E3F2FD',
        border: '#2196F3',
        iconColor: '#1976D2'
      };
    case NodeType.MOTIVATION:
      return {
        background: '#FFF3E0',
        border: '#FF9800',
        iconColor: '#F57C00'
      };
    case NodeType.OBSERVATION:
      return {
        background: '#F3E5F5',
        border: '#9C27B0',
        iconColor: '#7B1FA2'
      };
    case NodeType.MEME:
      return {
        background: '#E8F5E8',
        border: '#4CAF50',
        iconColor: '#388E3C'
      };
    case NodeType.ACTION:
      return {
        background: '#FFEBEE',
        border: '#F44336',
        iconColor: '#D32F2F'
      };
    default:
      return {
        background: '#F5F5F5',
        border: '#9E9E9E',
        iconColor: '#616161'
      };
  }
};

// 获取节点类型标签
const getNodeTypeLabel = (type: NodeType): string => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return '非条件刺激';
    case NodeType.MOTIVATION:
      return '动机';
    case NodeType.OBSERVATION:
      return '观察';
    case NodeType.MEME:
      return '模因';
    case NodeType.ACTION:
      return '行动';
    default:
      return '未知';
  }
};

export const MuiIconNode: React.FC<NodeProps> = (props) => {
  // 获取节点数据
  const nodeData = (props as any).data;
  
  if (!nodeData) {
    return (
      <Node
        {...props}
        style={{
          fill: '#f0f0f0',
          stroke: '#ccc',
          strokeWidth: 2,
          rx: props.width! / 2,
          ry: props.height! / 2
        }}
      />
    );
  }

  const nodeStyle = getNodeStyle(nodeData.type);
  const iconData = getNodeIcon(nodeData.type);
  const isActive = nodeData.isActive;

  return (
    <Node
      {...props}
      style={{
        fill: nodeStyle.background,
        stroke: nodeStyle.border,
        strokeWidth: isActive ? 4 : 3,
        rx: props.width! / 2, // 圆形
        ry: props.height! / 2, // 圆形
        filter: isActive ? `drop-shadow(0 0 8px ${nodeStyle.border}80)` : 'none',
        cursor: 'pointer'
      }}
      className={`mui-icon-node ${isActive ? 'active' : ''}`}
    >
      {/* SVG 图标 */}
      <path
        d={iconData.path}
        fill={nodeStyle.iconColor}
        transform={`translate(${props.width! / 2 - 12}, ${props.height! / 2 - 12}) scale(1)`}
      />
      
      {/* 数值指示器（小圆点） */}
      {nodeData.value > 0 && (
        <circle
          cx={props.width! - 10}
          cy={10}
          r={5}
          fill={nodeStyle.border}
          opacity={0.8}
        >
          <title>{`值: ${nodeData.value.toFixed(1)}`}</title>
        </circle>
      )}
      
      {/* 激活状态脉冲效果 */}
      {isActive && (
        <circle
          cx={props.width! / 2}
          cy={props.height! / 2}
          r={props.width! / 2 + 8}
          fill="none"
          stroke={nodeStyle.border}
          strokeWidth={2}
          opacity={0.4}
          className="pulse-ring"
        />
      )}
      
      {/* 进度条 */}
      {nodeData.threshold.length > 0 && nodeData.value > 0 && (
        <rect
          x={8}
          y={props.height! - 12}
          width={Math.min((nodeData.value / Math.max(...nodeData.threshold)) * (props.width! - 16), props.width! - 16)}
          height={4}
          fill={nodeStyle.border}
          rx={2}
          opacity={0.7}
        />
      )}
      
      {/* 简单的 SVG title tooltip */}
      <title>
        {`${nodeData.label}\n${nodeData.description}\n类型: ${getNodeTypeLabel(nodeData.type)}\n当前值: ${nodeData.value.toFixed(1)}\n状态: ${isActive ? '激活' : '未激活'}`}
      </title>
    </Node>
  );
};
