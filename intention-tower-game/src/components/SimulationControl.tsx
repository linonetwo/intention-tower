import { Pause, PlayArrow, Refresh } from '@mui/icons-material';
import { Box, Button, FormControl, FormControlLabel, FormLabel, Paper, Slider, Switch, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { IntentionMapData } from '../types/IntentionMap';

interface SimulationControlProps {
  data: IntentionMapData;
  onDataUpdate: (newData: IntentionMapData) => void;
}

export const SimulationControl: React.FC<SimulationControlProps> = ({
  data,
  onDataUpdate,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [autoFlow, setAutoFlow] = useState(true);

  // 模拟更新逻辑
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const newData = { ...data };

      // 更新节点数值
      newData.nodes = data.nodes.map(node => {
        const newNode = { ...node };

        // 基于输入边计算新数值
        const inputEdges = data.edges.filter(edge => edge.to === node.id);
        let inputValue = 0;

        inputEdges.forEach(edge => {
          const sourceNode = data.nodes.find(n => n.id === edge.from);
          if (sourceNode && sourceNode.isActive) {
            inputValue += edge.weight * simulationSpeed * 0.1;
          }
        });

        // 自然衰减
        newNode.value = Math.max(0, newNode.value + inputValue - 0.05 * simulationSpeed);

        // 检查激活状态
        if (newNode.threshold.length > 0) {
          newNode.isActive = newNode.value >= newNode.threshold[0];
        }

        return newNode;
      });

      // 更新流动状态
      if (autoFlow) {
        newData.edges = data.edges.map(edge => {
          const sourceNode = newData.nodes.find(n => n.id === edge.from);
          return {
            ...edge,
            isFlowing: sourceNode ? sourceNode.isActive : false,
          };
        });
      }

      onDataUpdate(newData);
    }, 1000 / simulationSpeed);

    return () => {
      clearInterval(interval);
    };
  }, [isRunning, simulationSpeed, autoFlow, data, onDataUpdate]);

  const handleReset = () => {
    const resetData = { ...data };
    resetData.nodes = data.nodes.map(node => ({
      ...node,
      value: Math.random() * 20, // 随机初始值
      isActive: false,
    }));
    resetData.edges = data.edges.map(edge => ({
      ...edge,
      isFlowing: false,
    }));
    onDataUpdate(resetData);
  };

  const handleNodeValueChange = (nodeId: string, newValue: number) => {
    const newData = { ...data };
    newData.nodes = data.nodes.map(node =>
      node.id === nodeId
        ? { ...node, value: newValue, isActive: newValue >= (node.threshold[0] || 0) }
        : node
    );
    onDataUpdate(newData);
  };

  return (
    <Paper
      elevation={2}
      sx={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 1000,
        p: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        maxHeight: '40vh',
        overflow: 'auto',
      }}
    >
      <Typography variant='h6' gutterBottom>
        模拟控制台
      </Typography>

      {/* 控制按钮 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <Button
          variant={isRunning ? 'outlined' : 'contained'}
          startIcon={isRunning ? <Pause /> : <PlayArrow />}
          onClick={() => {
            setIsRunning(!isRunning);
          }}
          color={isRunning ? 'secondary' : 'primary'}
        >
          {isRunning ? '暂停' : '开始'}模拟
        </Button>

        <Button
          variant='outlined'
          startIcon={<Refresh />}
          onClick={handleReset}
        >
          重置
        </Button>

        <FormControlLabel
          control={
            <Switch
              checked={autoFlow}
              onChange={(e) => {
                setAutoFlow(e.target.checked);
              }}
            />
          }
          label='自动流动'
        />
      </Box>

      {/* 模拟速度控制 */}
      <FormControl sx={{ mb: 2, minWidth: 200 }}>
        <FormLabel>模拟速度: {simulationSpeed}x</FormLabel>
        <Slider
          value={simulationSpeed}
          onChange={(_, value) => {
            setSimulationSpeed(value);
          }}
          min={0.1}
          max={5}
          step={0.1}
          marks={[
            { value: 0.1, label: '0.1x' },
            { value: 1, label: '1x' },
            { value: 5, label: '5x' },
          ]}
        />
      </FormControl>

      {/* 节点数值调整 */}
      <Typography variant='subtitle2' gutterBottom>
        手动调整节点数值:
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 2,
          maxHeight: '200px',
          overflow: 'auto',
        }}
      >
        {data.nodes.map(node => (
          <Box key={node.id} sx={{ p: 1, border: '1px solid #ddd', borderRadius: 1 }}>
            <Typography variant='caption' display='block' gutterBottom>
              {node.label}
              {node.isActive && <span style={{ color: '#4CAF50', marginLeft: '4px' }}>●</span>}
            </Typography>
            <Slider
              value={node.value}
              onChange={(_, value) => {
                handleNodeValueChange(node.id, value);
              }}
              min={0}
              max={100}
              step={1}
              size='small'
              valueLabelDisplay='auto'
            />
            {node.threshold.length > 0 && (
              <Typography variant='caption' color='text.secondary'>
                阈值: {node.threshold.join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
};
