import React from 'react';
import { Edge, EdgeProps } from 'reaflow';
import { EdgeData } from '../types/IntentionMap';

export const SimpleEdge: React.FC<EdgeProps> = (props) => {
  const edgeData = (props as any).data as EdgeData;
  
  // 如果没有数据，返回默认边
  if (!edgeData) {
    return <Edge {...props} />;
  }
  
  // 根据权重确定样式
  const isPositive = edgeData.weight > 0;
  const strokeColor = isPositive ? '#4CAF50' : '#F44336';
  const strokeWidth = Math.abs(edgeData.weight) * 3 + 2;
  const opacity = edgeData.isFlowing ? 0.9 : 0.6;
  
  // 流动效果
  const strokeDasharray = edgeData.isFlowing ? '8,4' : 'none';
  const animationClass = edgeData.isFlowing ? 'simple-edge-flowing' : '';

  return (
    <Edge
      {...props}
      style={{
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeOpacity: opacity,
        strokeDasharray: strokeDasharray,
        cursor: 'pointer'
      }}
      className={`simple-edge ${animationClass} ${isPositive ? 'positive' : 'negative'}`}
    />
  );
};
