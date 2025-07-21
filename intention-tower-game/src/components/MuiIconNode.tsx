import React from 'react';
import { Tooltip } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import StarIcon from '@mui/icons-material/Star';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ShareIcon from '@mui/icons-material/Share';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import LensIcon from '@mui/icons-material/Lens';
import { NodeType } from '../types/IntentionMap';
import { SxProps } from '@mui/material';
import { Node as ReaflowNode, NodeProps } from 'reaflow';

const getNodeIcon = (type: NodeType) => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return BoltIcon;
    case NodeType.MOTIVATION:
      return StarIcon;
    case NodeType.OBSERVATION:
      return VisibilityIcon;
    case NodeType.MEME:
      return ShareIcon;
    case NodeType.ACTION:
      return PlayArrowIcon;
    default:
      return LensIcon;
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
      <ReaflowNode
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
  const IconComponent = getNodeIcon(nodeData.type);
  const isActive = nodeData.isActive;

  // Tooltip内容
  const tooltip = (
    <div style={{ maxWidth: 220 }}>
      <div style={{ fontWeight: 'bold', color: nodeStyle.border, marginBottom: 4 }}>{nodeData.label}</div>
      <div style={{ fontSize: 13, marginBottom: 4 }}>{nodeData.description}</div>
      <div style={{ fontSize: 12, color: '#888' }}>
        类型: {getNodeTypeLabel(nodeData.type)}<br/>
        当前值: {nodeData.value.toFixed(1)}<br/>
        状态: {isActive ? '激活' : '未激活'}
      </div>
    </div>
  );

  return (
    <Tooltip title={tooltip} arrow placement="top">
      <g>
        <ReaflowNode
          {...props}
          style={{
            fill: nodeStyle.background,
            stroke: nodeStyle.border,
            strokeWidth: isActive ? 4 : 3,
            rx: props.width! / 2,
            ry: props.height! / 2,
            filter: isActive ? `drop-shadow(0 0 8px ${nodeStyle.border}80)` : 'none',
            cursor: 'pointer'
          }}
          className={`mui-icon-node ${isActive ? 'active' : ''}`}
        >
          {/* MUI 图标 */}
          <foreignObject
            x={props.width! / 2 - 16}
            y={props.height! / 2 - 16}
            width={32}
            height={32}
            style={{ pointerEvents: 'none' }}
          >
            <IconComponent sx={{ fontSize: 32, color: nodeStyle.iconColor }} />
          </foreignObject>

          {/* 数值指示器（小圆点） */}
          {nodeData.value > 0 && (
            <circle
              cx={props.width! - 10}
              cy={10}
              r={5}
              fill={nodeStyle.border}
              opacity={0.8}
            />
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
        </ReaflowNode>
      </g>
    </Tooltip>
  );
};
