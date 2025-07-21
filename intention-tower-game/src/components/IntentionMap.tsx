import { Box, Paper, Typography } from '@mui/material';
import React, { useCallback, useMemo, useState } from 'react';
import { Canvas } from 'reaflow';
import { IntentionMapData, NodeData } from '../types/IntentionMap';
import { MuiIconNode } from './MuiIconNode';
import { NodeDetailDialog } from './NodeDetailDialog';
import { SimpleEdge } from './SimpleEdge';

interface IntentionMapProps {
  data: IntentionMapData;
  onNodeClick?: (node: NodeData) => void;
}

export const IntentionMap: React.FC<IntentionMapProps> = ({
  data,
  onNodeClick,
}) => {
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // 转换数据格式为 reaflow 需要的格式
  const reaflowNodes = useMemo(() => {
    return data.nodes.map(nodeData => ({
      id: nodeData.id,
      // 不传递 text 属性，这样就不会显示默认文本
      width: 80,
      height: 80,
      data: nodeData,
    }));
  }, [data.nodes]);

  const reaflowEdges = useMemo(() => {
    return data.edges.map(edgeData => ({
      id: edgeData.id,
      from: edgeData.from,
      to: edgeData.to,
      data: edgeData,
    }));
  }, [data.edges]);

  // 节点点击处理
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    // 检查点击的是否是节点
    const target = event.target as HTMLElement;
    const nodeElement = target.closest('[data-node-id]');

    if (nodeElement) {
      const nodeId = nodeElement.getAttribute('data-node-id');
      const nodeData = data.nodes.find(n => n.id === nodeId);

      if (nodeData) {
        setSelectedNode(nodeData);
        setDialogOpen(true);
        onNodeClick?.(nodeData);
      }
    }
  }, [data.nodes, onNodeClick]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      }}
    >
      {/* 标题 */}
      <Paper
        elevation={2}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 1000,
          p: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        <Typography variant='h6' gutterBottom>
          意义之塔 - 本能图谱
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          点击节点查看详细信息，观察数值流动和激活状态
        </Typography>
      </Paper>

      {/* 图例 */}
      <Paper
        elevation={2}
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          p: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          maxWidth: 200,
        }}
      >
        <Typography variant='subtitle2' gutterBottom>
          节点类型图例
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: '#E3F2FD',
                border: '2px solid #2196F3',
              }}
            />
            <Typography variant='caption'>非条件刺激</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: '#FFF3E0',
                border: '2px solid #FF9800',
              }}
            />
            <Typography variant='caption'>动机</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: '#F3E5F5',
                border: '2px solid #9C27B0',
              }}
            />
            <Typography variant='caption'>观察</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: '#E8F5E8',
                border: '2px solid #4CAF50',
              }}
            />
            <Typography variant='caption'>模因</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: '#FFEBEE',
                border: '2px solid #F44336',
              }}
            />
            <Typography variant='caption'>行动</Typography>
          </Box>
        </Box>
      </Paper>

      {/* 主画布 */}
      <div onClick={handleCanvasClick} style={{ width: '100%', height: '100%' }}>
        <Canvas
          nodes={reaflowNodes}
          edges={reaflowEdges}
          node={(nodeProps) => <MuiIconNode {...nodeProps} />}
          edge={(edgeProps) => <SimpleEdge {...edgeProps} />}
          direction='RIGHT'
          layoutOptions={{
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '80',
            'elk.layered.spacing.nodeNodeBetweenLayers': '120',
          }}
          pannable
          zoomable
          fit
        />
      </div>

      {/* 节点详情弹框 */}
      <NodeDetailDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
        }}
        node={selectedNode}
      />
    </Box>
  );
};
