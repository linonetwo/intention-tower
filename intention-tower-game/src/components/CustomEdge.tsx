import React from 'react';
import { Edge, EdgeProps } from 'reaflow';
import { EdgeData } from '../types/IntentionMap';

export const CustomEdge: React.FC<EdgeProps> = (props) => {
  const edgeData = (props as any).properties?.data as EdgeData;
  
  // 如果没有数据，返回默认边
  if (!edgeData) {
    return <Edge {...props} />;
  }
  
  // 根据权重确定颜色和粗细
  const isPositive = edgeData.weight > 0;
  const strokeColor = isPositive ? '#4CAF50' : '#F44336';
  const strokeWidth = Math.abs(edgeData.weight) * 2 + 1;
  const opacity = edgeData.isFlowing ? 1 : 0.6;
  
  // 流动动画效果
  const dashArray = edgeData.isFlowing ? '5,5' : 'none';
  const animationDuration = edgeData.flowSpeed > 0 ? `${2 / edgeData.flowSpeed}s` : '2s';

  return (
    <Edge
      {...props}
      style={{
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeOpacity: opacity,
        strokeDasharray: dashArray,
        strokeDashoffset: edgeData.isFlowing ? '10' : '0',
        animation: edgeData.isFlowing ? `flow ${animationDuration} linear infinite` : 'none'
      }}
    />
  );
};
