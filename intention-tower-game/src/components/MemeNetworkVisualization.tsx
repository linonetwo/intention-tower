import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { styled } from '@mui/material/styles';
import { Box, Card, CardContent, Typography, Chip } from '@mui/material';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import * as Icons from '@mui/icons-material';
import { SAMPLE_NODES, SAMPLE_LINKS } from '../data/sampleData';
import { MemeNode, MemeLink, CATEGORIES } from '../types';

interface MemeNetworkVisualizationProps {
  selectedCategory: string;
  selectedQuadrant: string;
}

interface NodePosition extends MemeNode {
  x: number;
  y: number;
}

interface LinkPosition {
  id: string;
  source: NodePosition;
  target: NodePosition;
  relationship: string;
  strength: number;
}

const NetworkContainer = styled(Box)(() => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
}));

const NetworkSvg = styled('svg')({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
});

const NodeContainer = styled(Box)<{ 
  x: number; 
  y: number; 
  importance: number;
  selected: boolean;
}>(({ x, y, importance, selected, theme }) => ({
  position: 'absolute',
  left: x - 15 - importance * 2,
  top: y - 15 - importance * 2,
  width: 30 + importance * 4,
  height: 30 + importance * 4,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  transform: selected ? 'scale(1.3)' : 'scale(1)',
  zIndex: selected ? 1000 : 100,
  boxShadow: selected ? theme.shadows[8] : theme.shadows[2],
  '&:hover': {
    transform: 'scale(1.2)',
    zIndex: 999,
  },
}));

const NodeLabel = styled(Typography)<{ x: number; y: number }>(({ x, y }) => ({
  position: 'absolute',
  left: x - 40,
  top: y + 35,
  width: 80,
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 'bold',
  color: '#333',
  pointerEvents: 'none',
  textShadow: '1px 1px 2px rgba(255,255,255,0.8)',
  lineHeight: 1.2,
}));

const LayerBackground = styled(Box)<{ 
  layer: 'topCultural' | 'middleSocial' | 'bottomPhysical';
  width: number;
  height: number;
}>(({ layer, height }) => {
  const getLayerColor = () => {
    switch (layer) {
      case 'topCultural': return 'rgba(25, 118, 210, 0.05)';
      case 'middleSocial': return 'rgba(123, 31, 162, 0.05)';
      case 'bottomPhysical': return 'rgba(46, 125, 50, 0.05)';
    }
  };

  const getLayerY = () => {
    switch (layer) {
      case 'topCultural': return 0;
      case 'middleSocial': return height * 0.33;
      case 'bottomPhysical': return height * 0.66;
    }
  };

  return {
    position: 'absolute',
    left: 0,
    top: getLayerY(),
    width: '100%',
    height: height * 0.33,
    backgroundColor: getLayerColor(),
    borderBottom: '1px dashed rgba(0,0,0,0.1)',
    pointerEvents: 'none',
  };
});

const MemeNetworkVisualization: React.FC<MemeNetworkVisualizationProps> = ({
  selectedCategory,
  selectedQuadrant,
}) => {
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<MemeNode | null>(null);
  const [nodes, setNodes] = useState<NodePosition[]>([]);
  const [links, setLinks] = useState<LinkPosition[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  // 过滤数据
  const filteredNodes = useMemo(() => {
    return SAMPLE_NODES.filter((node: MemeNode) => {
      const categoryMatch = selectedCategory === 'all' || node.category === selectedCategory;
      const quadrantMatch = selectedQuadrant === 'all' || node.nodeType === selectedQuadrant;
      return categoryMatch && quadrantMatch;
    });
  }, [selectedCategory, selectedQuadrant]);

  const filteredLinks = useMemo(() => {
    const filteredNodeIds = new Set(filteredNodes.map((n: MemeNode) => n.id));
    const links = SAMPLE_LINKS.filter((link: MemeLink) => 
      filteredNodeIds.has(link.source as string) && filteredNodeIds.has(link.target as string)
    );
    
    return links;
  }, [filteredNodes, selectedCategory, selectedQuadrant]);

  // 获取类别颜色
  const getCategoryColor = useCallback((category: string) => {
    const categoryInfo = CATEGORIES.find(c => c.name === category);
    return categoryInfo?.color || '#666';
  }, []);

  // 获取图标组件
  const getIconComponent = useCallback((iconName?: string) => {
    if (!iconName) return Icons.Circle;
    // @ts-ignore
    return Icons[iconName] || Icons.Circle;
  }, []);

  // 获取层级Y偏移
  const getLayerOffset = useCallback((layer: string) => {
    const { height } = dimensions;
    switch (layer) {
      case 'topCultural': return height * 0.16;
      case 'middleSocial': return height * 0.5;
      case 'bottomPhysical': return height * 0.84;
      default: return height * 0.5;
    }
  }, [dimensions]);

  // 计算节点边缘的连接点
  const getNodeEdgePoint = useCallback((fromNode: NodePosition, toNode: NodePosition) => {
    const radius = 15 + (fromNode.importance || 5) * 2; // 节点半径
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return { x: fromNode.x, y: fromNode.y };
    
    const ratio = radius / distance;
    return {
      x: fromNode.x + dx * ratio,
      y: fromNode.y + dy * ratio
    };
  }, []);

  // 初始化力导向布局
  useEffect(() => {
    if (filteredNodes.length === 0) {
      setNodes([]);
      setLinks([]);
      return;
    }

    const { width, height } = dimensions;
    
    // 初始化节点位置
    const initialNodes: NodePosition[] = filteredNodes.map((node: MemeNode) => ({
      ...node,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: getLayerOffset(node.layer) + (Math.random() - 0.5) * 100,
    }));

    // 设置初始节点
    setNodes(initialNodes);

    // 创建初始连接线 - 使用原始数据
    const initialLinks: LinkPosition[] = filteredLinks.map((link: MemeLink) => {
      const sourceNode = initialNodes.find(n => n.id === link.source);
      const targetNode = initialNodes.find(n => n.id === link.target);
      
      if (!sourceNode || !targetNode) {
        return null;
      }
      
      return {
        id: link.id,
        source: { ...sourceNode },
        target: { ...targetNode },
        relationship: link.relationship,
        strength: link.strength,
      };
    }).filter(Boolean) as LinkPosition[];
    
    setLinks(initialLinks);

    // 创建 d3-force 使用的独立数据副本
    const d3Links = filteredLinks.map(link => ({
      ...link,
      source: link.source,
      target: link.target
    }));

    // 创建力导向模拟
    const simulation = forceSimulation(initialNodes)
      .force('link', forceLink<NodePosition, any>()
        .id(d => d.id)
        .links(d3Links)
        .distance(100)
        .strength(0.3)
      )
      .force('charge', forceManyBody().strength(-400))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collision', forceCollide().radius((d: any) => 20 + ((d as NodePosition).importance || 5) * 2))
      .force('x', forceX().x(width / 2).strength(0.05))
      .force('y', forceY().y((d: any) => {
        // 根据层级设置y位置
        return getLayerOffset((d as NodePosition).layer);
      }).strength(0.3));

    // 更新节点位置
    simulation.on('tick', () => {
      // d3-force 会直接修改 initialNodes 中节点的 x, y 属性
      // 我们需要创建一个新的数组来触发 React 重新渲染
      const updatedNodes = initialNodes.map(node => ({ ...node }));
      setNodes(updatedNodes);
      
      // 更新连接线位置 - 基于原始链接数据和更新后的节点位置
      const updatedLinks: LinkPosition[] = filteredLinks.map((link: MemeLink) => {
        const sourceNode = updatedNodes.find(n => n.id === link.source);
        const targetNode = updatedNodes.find(n => n.id === link.target);
        
        if (!sourceNode || !targetNode) {
          return null;
        }
        
        return {
          id: link.id,
          source: sourceNode,
          target: targetNode,
          relationship: link.relationship,
          strength: link.strength,
        };
      }).filter(Boolean) as LinkPosition[];
      setLinks(updatedLinks);
    });

    // 停止模拟
    setTimeout(() => {
      simulation.stop();
    }, 5000);

    return () => {
      simulation.stop();
    };
  }, [filteredNodes, filteredLinks, dimensions, getLayerOffset]);

  // 监听容器大小变化
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('network-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // 节点点击处理
  const handleNodeClick = useCallback((node: NodePosition) => {
    setSelectedNode(node);
  }, []);

  // 节点拖拽处理
  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    setIsDragging(true);
    setDraggedNode(nodeId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !draggedNode) return;
    
    const container = document.getElementById('network-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setNodes(prevNodes => 
      prevNodes.map(node => 
        node.id === draggedNode ? { ...node, x, y } : node
      )
    );

    // 同时更新连接线位置
    setLinks(prevLinks => 
      prevLinks.map(link => ({
        ...link,
        source: link.source.id === draggedNode ? { ...link.source, x, y } : link.source,
        target: link.target.id === draggedNode ? { ...link.target, x, y } : link.target,
      }))
    );
  }, [isDragging, draggedNode]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggedNode(null);
  }, []);

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* 主可视化区域 */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <NetworkContainer
          id="network-container"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 层级背景 */}
          <LayerBackground layer="topCultural" width={dimensions.width} height={dimensions.height} />
          <LayerBackground layer="middleSocial" width={dimensions.width} height={dimensions.height} />
          <LayerBackground layer="bottomPhysical" width={dimensions.width} height={dimensions.height} />

          {/* 连接线 */}
          <NetworkSvg>
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="#999"
                />
              </marker>
            </defs>
            {links.map(link => {
              // 安全检查
              if (!link.source || !link.target || 
                  typeof link.source.x !== 'number' || typeof link.source.y !== 'number' ||
                  typeof link.target.x !== 'number' || typeof link.target.y !== 'number') {
                return null;
              }
              
              // 计算节点边缘的连接点
              const sourceEdge = getNodeEdgePoint(link.source, link.target);
              const targetEdge = getNodeEdgePoint(link.target, link.source);
              
              return (
                <line
                  key={link.id}
                  x1={sourceEdge.x}
                  y1={sourceEdge.y}
                  x2={targetEdge.x}
                  y2={targetEdge.y}
                  stroke="#999"
                  strokeWidth={link.strength * 3}
                  strokeOpacity={0.6}
                  markerEnd="url(#arrowhead)"
                />
              );
            })}
          </NetworkSvg>

          {/* 节点 */}
          {nodes.map(node => {
            const IconComponent = getIconComponent(node.icon);
            return (
              <React.Fragment key={node.id}>
                <NodeContainer
                  x={node.x}
                  y={node.y}
                  importance={node.importance || 5}
                  selected={selectedNode?.id === node.id}
                  sx={{
                    backgroundColor: getCategoryColor(node.category),
                    color: 'white',
                  }}
                  onClick={() => handleNodeClick(node)}
                  onMouseDown={(e) => handleMouseDown(e, node.id)}
                >
                  <IconComponent sx={{ fontSize: 18 }} />
                </NodeContainer>
                <NodeLabel x={node.x} y={node.y}>
                  {node.title}
                </NodeLabel>
              </React.Fragment>
            );
          })}

          {/* 图例 */}
          <Box sx={{ 
            position: 'absolute', 
            top: 10, 
            left: 10, 
            bgcolor: 'rgba(255,255,255,0.95)', 
            p: 2, 
            borderRadius: 2,
            maxWidth: 300,
            boxShadow: 2
          }}>
            <Typography variant="subtitle2" gutterBottom>层级结构</Typography>
            <Box sx={{ mb: 2 }}>
              <Chip label="顶层文化模因" size="small" sx={{ bgcolor: 'rgba(25, 118, 210, 0.2)', mr: 0.5, mb: 0.5 }} />
              <Chip label="中层社会习得" size="small" sx={{ bgcolor: 'rgba(123, 31, 162, 0.2)', mr: 0.5, mb: 0.5 }} />
              <Chip label="底层生理驱动" size="small" sx={{ bgcolor: 'rgba(46, 125, 50, 0.2)', mr: 0.5, mb: 0.5 }} />
            </Box>
            
            <Typography variant="subtitle2" gutterBottom>类别图例</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
              {CATEGORIES.map(category => (
                <Chip 
                  key={category.name}
                  label={category.name}
                  size="small"
                  sx={{ 
                    bgcolor: category.color, 
                    color: 'white',
                    fontSize: '0.65rem'
                  }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              • 节点大小表示重要性<br/>
              • 连接粗细表示关系强度<br/>
              • 拖拽节点可调整位置<br/>
              • 点击查看详情
            </Typography>
          </Box>

          {/* 统计信息 */}
          <Box sx={{ 
            position: 'absolute', 
            bottom: 10, 
            left: 10, 
            bgcolor: 'rgba(255,255,255,0.95)', 
            p: 1, 
            borderRadius: 1,
            boxShadow: 1
          }}>
            <Typography variant="caption">
              节点: {nodes.length} | 连接: {links.length}
            </Typography>
          </Box>

          {/* 层级标签 */}
          <Box sx={{ position: 'absolute', right: 10, top: 10 }}>
            <Typography variant="caption" sx={{ 
              display: 'block', 
              bgcolor: 'rgba(25, 118, 210, 0.1)', 
              p: 0.5, 
              borderRadius: 0.5, 
              mb: 0.5 
            }}>
              顶层文化模因
            </Typography>
            <Typography variant="caption" sx={{ 
              display: 'block', 
              bgcolor: 'rgba(123, 31, 162, 0.1)', 
              p: 0.5, 
              borderRadius: 0.5, 
              mb: 0.5 
            }}>
              中层社会习得
            </Typography>
            <Typography variant="caption" sx={{ 
              display: 'block', 
              bgcolor: 'rgba(46, 125, 50, 0.1)', 
              p: 0.5, 
              borderRadius: 0.5 
            }}>
              底层生理驱动
            </Typography>
          </Box>
        </NetworkContainer>
      </Box>

      {/* 侧边栏详情 */}
      {selectedNode && (
        <Box sx={{ width: 320, p: 2, bgcolor: '#f5f5f5', overflow: 'auto', borderLeft: '1px solid #ddd' }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: getCategoryColor(selectedNode.category),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 2
                }}>
                  {React.createElement(getIconComponent(selectedNode.icon), { 
                    sx: { color: 'white', fontSize: 20 } 
                  })}
                </Box>
                <Typography variant="h6">
                  {selectedNode.title}
                </Typography>
              </Box>
              
              <Box sx={{ mb: 2 }}>
                <Chip 
                  label={selectedNode.category}
                  size="small"
                  sx={{ 
                    bgcolor: getCategoryColor(selectedNode.category), 
                    color: 'white',
                    mb: 1,
                    mr: 1
                  }}
                />
                <Chip 
                  label={selectedNode.nodeType}
                  size="small"
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
              </Box>
              
              {selectedNode.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {selectedNode.description}
                </Typography>
              )}
              
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  <strong>层级:</strong> {
                    selectedNode.layer === 'topCultural' ? '顶层文化模因' : 
                    selectedNode.layer === 'middleSocial' ? '中层社会习得' : '底层生理驱动'
                  }
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  <strong>重要性:</strong> {selectedNode.importance}/10
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  <strong>标签:</strong> {selectedNode.tags.join(', ')}
                </Typography>
              </Box>

              {/* 关联节点 */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>相关连接</Typography>
                {links
                  .filter(link => link.source.id === selectedNode.id || link.target.id === selectedNode.id)
                  .map(link => (
                    <Typography key={link.id} variant="caption" display="block" sx={{ mb: 0.5 }}>
                      {link.source.id === selectedNode.id ? (
                        <>→ {link.target.title} ({link.relationship})</>
                      ) : (
                        <>← {link.source.title} ({link.relationship})</>
                      )}
                    </Typography>
                  ))
                }
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default MemeNetworkVisualization;
