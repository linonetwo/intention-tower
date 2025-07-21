import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, Typography } from '@mui/material';
import React from 'react';
import { NodeData, NodeType } from '../types/IntentionMap';

interface NodeDetailDialogProps {
  open: boolean;
  onClose: () => void;
  node: NodeData | null;
}

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

const getNodeTypeColor = (type: NodeType): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return 'primary';
    case NodeType.MOTIVATION:
      return 'warning';
    case NodeType.OBSERVATION:
      return 'secondary';
    case NodeType.MEME:
      return 'success';
    case NodeType.ACTION:
      return 'error';
    default:
      return 'default';
  }
};

export const NodeDetailDialog: React.FC<NodeDetailDialogProps> = ({ open, onClose, node }) => {
  if (!node) return null;

  const progressValue = node.threshold.length > 0 ? (node.value / Math.max(...node.threshold)) * 100 : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Box display='flex' alignItems='center' gap={1}>
          <Typography variant='h6' component='span'>
            {node.label}
          </Typography>
          <Chip
            label={getNodeTypeLabel(node.type)}
            color={getNodeTypeColor(node.type)}
            size='small'
          />
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box display='flex' flexDirection='column' gap={2}>
          {/* 描述 */}
          <Box>
            <Typography variant='subtitle2' color='text.secondary' gutterBottom>
              描述
            </Typography>
            <Typography variant='body2'>
              {node.description}
            </Typography>
          </Box>

          <Divider />

          {/* 数值状态 */}
          <Box>
            <Typography variant='subtitle2' color='text.secondary' gutterBottom>
              当前数值
            </Typography>
            <Box display='flex' alignItems='center' gap={1} mb={1}>
              <Typography variant='body2' sx={{ minWidth: '40px' }}>
                {node.value.toFixed(1)}
              </Typography>
              <LinearProgress
                variant='determinate'
                value={Math.min(progressValue, 100)}
                sx={{ flexGrow: 1 }}
                color={node.isActive ? 'success' : 'primary'}
              />
              <Typography variant='body2' color='text.secondary'>
                {progressValue.toFixed(1)}%
              </Typography>
            </Box>
            <Typography variant='caption' color='text.secondary'>
              状态: {node.isActive ? '激活' : '未激活'}
            </Typography>
          </Box>

          {/* 触发阈值 */}
          {node.threshold.length > 0 && (
            <Box>
              <Typography variant='subtitle2' color='text.secondary' gutterBottom>
                触发阈值
              </Typography>
              <Box display='flex' gap={1} flexWrap='wrap'>
                {node.threshold.map((threshold, index) => (
                  <Chip
                    key={index}
                    label={`阈值 ${index + 1}: ${threshold}`}
                    size='small'
                    variant={node.value >= threshold ? 'filled' : 'outlined'}
                    color={node.value >= threshold ? 'success' : 'default'}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* 类型说明 */}
          <Box>
            <Typography variant='subtitle2' color='text.secondary' gutterBottom>
              节点类型说明
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {getNodeTypeDescription(node.type)}
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

function getNodeTypeDescription(type: NodeType): string {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return '如食物、性和药物的愉悦感，包括基因塑造的来自脑干和下丘脑的刺激。';
    case NodeType.MOTIVATION:
      return '想要的东西或想做的事情，通过多巴胺的激励显著性机制驱动行为。';
    case NodeType.OBSERVATION:
      return '短期记忆中的来自五感的内容，来自脏器的伤痛等感知信息。';
    case NodeType.MEME:
      return '学会的东西，通过强化学习获得的能带来奖励的知识和行为模式。';
    case NodeType.ACTION:
      return '在游戏里预置的可做的事情，例如发布任务或执行具体行为。';
    default:
      return '未定义的节点类型。';
  }
}
