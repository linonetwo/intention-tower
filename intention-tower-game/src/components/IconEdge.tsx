import React from 'react';
import { Tooltip } from 'react-tooltip';
import { Edge, EdgeProps } from 'reaflow';
import { EdgeData } from '../types/IntentionMap';

export const IconEdge: React.FC<EdgeProps> = (props) => {
  const edgeData = (props as any).data as EdgeData;

  // 如果没有数据，返回默认边
  if (!edgeData) {
    return <Edge {...props} />;
  }

  // 根据权重确定样式
  const isPositive = edgeData.weight > 0;
  const strokeColor = isPositive ? '#4CAF50' : '#F44336';
  const strokeWidth = Math.abs(edgeData.weight) * 3 + 1;
  const opacity = edgeData.isFlowing ? 0.9 : 0.6;

  // 流动效果
  const strokeDasharray = edgeData.isFlowing ? '8,4' : 'none';

  // Tooltip 内容
  const tooltipContent = `
    <div style="max-width: 200px;">
      <h5 style="margin: 0 0 4px 0;">连接详情</h5>
      <div style="font-size: 12px;">
        <div>权重: ${isPositive ? '+' : ''}${edgeData.weight.toFixed(2)}</div>
        <div>类型: ${isPositive ? '促进' : '抑制'}</div>
        <div>流动速度: ${edgeData.flowSpeed.toFixed(1)}</div>
        <div>状态: ${edgeData.isFlowing ? '流动中' : '静止'}</div>
      </div>
    </div>
  `;

  return (
    <>
      <Edge
        {...props}
        style={{
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeOpacity: opacity,
          strokeDasharray: strokeDasharray,
          cursor: 'pointer',
        }}
        className={`icon-edge ${edgeData.isFlowing ? 'flowing' : ''} ${isPositive ? 'positive' : 'negative'}`}
        data-tooltip-id={`edge-tooltip-${edgeData.id}`}
        data-tooltip-html={tooltipContent}
      />

      {/* Tooltip */}
      <Tooltip
        id={`edge-tooltip-${edgeData.id}`}
        place='top'
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          borderRadius: '6px',
          padding: '8px',
          fontSize: '12px',
          zIndex: 1000,
        }}
      />
    </>
  );
};
