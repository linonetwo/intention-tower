import { Box } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as translateLabel } from '../../../i18n';
import type { NodeType } from '../../../types/backend';
import { NODE_TYPE_COLORS } from './constants';
import type { GraphEdge, GraphNode } from './types';

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  hiddenTypes: Set<NodeType>;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
};

function edgeMotionConfig(edge: GraphEdge) {
  const isIncrease = edge.polarity === 'Excitatory';
  const strength = Math.max(0.05, Math.min(1, Math.abs(edge.weight)));
  return {
    color: isIncrease ? '#6fcf97' : '#ff6b6b',
    dash: `${8 + (1 - strength) * 4} ${5 + (1 - strength) * 3}`,
    duration: `${(2.8 - strength * 2.1).toFixed(2)}s`,
    reverse: !isIncrease,
    width: 1.2 + strength * 2.6,
    opacity: 0.35 + strength * 0.55,
  };
}

export function GraphSvg({
  nodes,
  edges,
  width,
  height,
  selectedNodeId,
  selectedEdgeId,
  hiddenTypes,
  onSelectNode,
  onSelectEdge,
}: Props) {
  const { t } = useTranslation();
  const svgReference = useRef<SVGSVGElement | null>(null);
  const pinchStateReference = useRef<{ startDistance: number; startScale: number } | null>(null);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.instance_id, n])), [nodes]);
  const [zoomScale, setZoomScale] = useState(1);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hiddenTypes.has(n.node_type)),
    [nodes, hiddenTypes],
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.instance_id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleNodeIds.has(edge.source_instance_id) && visibleNodeIds.has(edge.target_instance_id)),
    [edges, visibleNodeIds],
  );

  const fitView = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { scale: 1, tx: 0, ty: 0 };
    }

    const xs = visibleNodes.map((node) => node.x);
    const ys = visibleNodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 40;
    const contentWidth = Math.max(1, maxX - minX + padding * 2);
    const contentHeight = Math.max(1, maxY - minY + padding * 2);
    const scale = Math.max(0.55, Math.min(2.4, Math.min(width / contentWidth, height / contentHeight)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      scale,
      tx: width / 2 - centerX * scale,
      ty: height / 2 - centerY * scale,
    };
  }, [visibleNodes, width, height]);

  useEffect(() => {
    setZoomScale(fitView.scale);
  }, [fitView.scale]);

  const transform = useMemo(() => {
    const centerX = width / 2;
    const centerY = height / 2;
    const ratio = zoomScale / fitView.scale;
    const tx = centerX - (centerX - fitView.tx) * ratio;
    const ty = centerY - (centerY - fitView.ty) * ratio;
    return `translate(${tx}, ${ty}) scale(${zoomScale})`;
  }, [fitView.scale, fitView.tx, fitView.ty, width, height, zoomScale]);

  const shouldAnimateEdges = visibleEdges.length <= 80;
  const showEdgeLabels = visibleEdges.length <= 45;

  const clampScale = (nextScale: number) => Math.max(0.5, Math.min(2.8, nextScale));

  const handleWheel: React.WheelEventHandler<SVGSVGElement> = (event) => {
    event.preventDefault();
    setZoomScale((previous) => clampScale(previous * (event.deltaY > 0 ? 0.92 : 1.08)));
  };

  const touchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart: React.TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length === 2) {
      pinchStateReference.current = {
        startDistance: touchDistance(event.touches),
        startScale: zoomScale,
      };
    }
  };

  const handleTouchMove: React.TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length !== 2 || !pinchStateReference.current) return;
    event.preventDefault();
    const currentDistance = touchDistance(event.touches);
    const ratio = currentDistance / Math.max(1, pinchStateReference.current.startDistance);
    setZoomScale(clampScale(pinchStateReference.current.startScale * ratio));
  };

  const handleTouchEnd: React.TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length < 2) {
      pinchStateReference.current = null;
    }
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, bgcolor: '#111418', position: 'relative' }}>
      <svg
        ref={svgReference}
        width='100%'
        height='100%'
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio='xMidYMid meet'
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ display: 'block', background: 'radial-gradient(circle at center, #1a1f26 0%, #0f1217 80%)' }}
      >
        <style>
          {`
            .edge-flow { animation-name: dash-flow; animation-timing-function: linear; animation-iteration-count: infinite; }
            .edge-flow.reverse { animation-direction: reverse; }
            @keyframes dash-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -120; } }
          `}
        </style>

        <defs>
          <marker id='arrow-excite' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
            <path d='M 0 0 L 10 5 L 0 10 z' fill='#6fcf97' />
          </marker>
          <marker id='arrow-inhibit' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
            <path d='M 0 0 L 10 5 L 0 10 z' fill='#ff6b6b' />
          </marker>
        </defs>

        <g transform={transform}>
          {visibleEdges.map((edge) => {
            const source = nodeMap.get(edge.source_instance_id);
            const target = nodeMap.get(edge.target_instance_id);
            if (!source || !target) return null;

            const motion = edgeMotionConfig(edge);
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const selected = selectedEdgeId === edge.edge_id;
            const label = `${edge.polarity === 'Excitatory' ? '+' : '-'}${edge.weight.toFixed(2)} | ${edge.learn_type}${edge.learnable ? ` | ${t('graph.edge.learnable')}` : ''}`;

            return (
              <g
                key={edge.edge_id}
                onClick={() => {
                  onSelectEdge(edge.edge_id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <line
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={motion.color}
                  strokeOpacity={selected ? 1 : motion.opacity}
                  strokeWidth={selected ? motion.width + 1.2 : motion.width}
                  strokeDasharray={shouldAnimateEdges ? motion.dash : undefined}
                  markerEnd={`url(#${edge.polarity === 'Excitatory' ? 'arrow-excite' : 'arrow-inhibit'})`}
                  className={shouldAnimateEdges ? `edge-flow ${motion.reverse ? 'reverse' : ''}` : undefined}
                  style={shouldAnimateEdges ? { animationDuration: motion.duration } : undefined}
                >
                  <title>{`edge: ${edge.edge_id}\nweight: ${edge.weight.toFixed(3)}\npolarity: ${edge.polarity}\nlearn: ${edge.learn_type}\nlearnable: ${edge.learnable}`}</title>
                </line>

                {showEdgeLabels && (
                  <>
                    <rect
                      x={midX - 34}
                      y={midY - 10}
                      width={68}
                      height={16}
                      rx={8}
                      ry={8}
                      fill='rgba(5,10,16,0.75)'
                      stroke={motion.color}
                      strokeOpacity={0.45}
                      strokeWidth={0.6}
                    />
                    <text
                      x={midX}
                      y={midY + 2}
                      textAnchor='middle'
                      fontSize={8.5}
                      fill='#d9e4ec'
                      style={{ pointerEvents: 'none' }}
                    >
                      {label.slice(0, 28)}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {visibleNodes.map((node) => {
            const selected = selectedNodeId === node.instance_id;
            const color = NODE_TYPE_COLORS[node.node_type];
            return (
              <g
                key={node.instance_id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => {
                  onSelectNode(node.instance_id);
                }}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={node.r + (selected ? 5 : 0)}
                  fill={selected ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.26)'}
                  stroke={selected ? '#ffffff' : color}
                  strokeWidth={selected ? 2.4 : 1.6}
                />
                <circle
                  r={Math.max(7, node.r - 3)}
                  fill={color}
                  fillOpacity={node.active ? 0.95 : 0.35}
                />
                <text
                  x={0}
                  y={node.r + 14}
                  fill='#cfd8dc'
                  fontSize={10}
                  textAnchor='middle'
                  style={{ pointerEvents: 'none' }}
                >
                  {translateLabel(node.label).slice(0, 8)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <Box
        sx={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 0.8,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          bgcolor: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        <Box sx={{ fontSize: 11, color: '#c7d2da' }}>{Math.round(zoomScale * 100)}%</Box>
        <Box
          onClick={() => {
            setZoomScale(fitView.scale);
          }}
          sx={{
            cursor: 'pointer',
            fontSize: 11,
            color: '#e2e8f0',
            px: 0.7,
            py: 0.2,
            borderRadius: 0.8,
            bgcolor: 'rgba(255,255,255,0.08)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' },
          }}
        >
          {t('graph.fit')}
        </Box>
      </Box>
    </Box>
  );
}
