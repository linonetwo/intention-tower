import { Box, Tooltip, Typography } from '@mui/material';
import React, { useState } from 'react';
import { Node, NodeProps } from 'reaflow';
import { NodeType } from '../types/IntentionMap';

// 根据节点类型获取图标字符和颜色
const getNodeStyle = (type: NodeType) => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return {
        symbol: '⚡',
        background: '#E3F2FD',
        border: '#2196F3',
        color: '#1976D2',
      };
    case NodeType.MOTIVATION:
      return {
        symbol: '🎯',
        background: '#FFF3E0',
        border: '#FF9800',
        color: '#F57C00',
      };
    case NodeType.OBSERVATION:
      return {
        symbol: '👁️',
        background: '#F3E5F5',
        border: '#9C27B0',
        color: '#7B1FA2',
      };
    case NodeType.MEME:
      return {
        symbol: '💭',
        background: '#E8F5E8',
        border: '#4CAF50',
        color: '#388E3C',
      };
    case NodeType.ACTION:
      return {
        symbol: '⚡',
        background: '#FFEBEE',
        border: '#F44336',
        color: '#D32F2F',
      };
    default:
      return {
        symbol: '◯',
        background: '#F5F5F5',
        border: '#9E9E9E',
        color: '#616161',
      };
  }
};

// 获取节点类型标签
function getNodeTypeLabel(type: NodeType): string {
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
}

export const IconNode: React.FC<NodeProps> = (props) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);

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
          rx: 25,
          ry: 25,
        }}
      >
        <text
          x={props.width / 2}
          y={props.height / 2}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize='12'
          fill='#666'
        >
          ?
        </text>
      </Node>
    );
  }

  const nodeStyle = getNodeStyle(nodeData.type);
  const isActive = nodeData.isActive;
  const radius = Math.min(props.width, props.height) / 2 - 5;

  const TooltipContent = () => (
    <Box sx={{ maxWidth: 250, p: 1 }}>
      <Typography variant='subtitle2' sx={{ color: nodeStyle.color, mb: 1 }}>
        {nodeData.label}
      </Typography>
      <Typography variant='body2' sx={{ mb: 1, fontSize: '12px' }}>
        {nodeData.description}
      </Typography>
      <Box sx={{ fontSize: '11px', color: 'text.secondary' }}>
        <div>类型: {getNodeTypeLabel(nodeData.type)}</div>
        <div>当前值: {nodeData.value.toFixed(1)}</div>
        <div>阈值: {nodeData.threshold.join(', ')}</div>
        <div>状态: {isActive ? '激活' : '未激活'}</div>
      </Box>
    </Box>
  );

  return (
    <Tooltip
      title={<TooltipContent />}
      placement='top'
      arrow
      open={tooltipOpen}
      onClose={() => {
        setTooltipOpen(false);
      }}
      onOpen={() => {
        setTooltipOpen(true);
      }}
      enterDelay={300}
      leaveDelay={200}
    >
      <g
        onMouseEnter={() => {
          setTooltipOpen(true);
        }}
        onMouseLeave={() => {
          setTooltipOpen(false);
        }}
      >
        <Node
          {...props}
          style={{
            fill: nodeStyle.background,
            stroke: nodeStyle.border,
            strokeWidth: isActive ? 3 : 2,
            rx: radius,
            ry: radius,
            filter: isActive ? `drop-shadow(0 0 8px ${nodeStyle.border}60)` : 'none',
            cursor: 'pointer',
          }}
          className={`icon-node ${isActive ? 'active' : ''}`}
        >
          {/* 使用Emoji图标 */}
          <text
            x={props.width / 2}
            y={props.height / 2}
            textAnchor='middle'
            dominantBaseline='middle'
            fontSize='16'
            style={{ userSelect: 'none' }}
          >
            {nodeStyle.symbol}
          </text>

          {/* 数值指示器（小圆点） */}
          {nodeData.value > 0 && (
            <circle
              cx={props.width - 8}
              cy={8}
              r={3}
              fill={nodeStyle.border}
              opacity={0.8}
            />
          )}

          {/* 激活状态脉冲效果 */}
          {isActive && (
            <circle
              cx={props.width / 2}
              cy={props.height / 2}
              r={radius + 3}
              fill='none'
              stroke={nodeStyle.border}
              strokeWidth={1}
              opacity={0.5}
              className='pulse-ring'
            />
          )}

          {/* 进度条 */}
          {nodeData.threshold.length > 0 && (
            <rect
              x={5}
              y={props.height - 4}
              width={Math.min((nodeData.value / Math.max(...nodeData.threshold)) * (props.width - 10), props.width - 10)}
              height={2}
              fill={nodeStyle.border}
              rx={1}
              opacity={0.6}
            />
          )}
        </Node>
      </g>
    </Tooltip>
  );
};
