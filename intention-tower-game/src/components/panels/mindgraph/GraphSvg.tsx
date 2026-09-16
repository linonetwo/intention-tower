import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nodeTypeLabel, translateLabel } from '../../../i18n';
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
  highlightedEdgeIds: Set<string>;
  hiddenTypes?: Set<NodeType>;
  hiddenNodeIds?: Set<string>;
  focusNodeIds?: Set<string>;
  matchedNodeIds?: Set<string> | null;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onDeselect: () => void;
  onMoveNode?: (nodeId: string, x: number, y: number) => void;
  onResetLayout?: () => void;
  canResetLayout?: boolean;
};

type Viewport = { tx: number; ty: number; scale: number };
type Point = { x: number; y: number };

const EMPTY_SET = new Set<string>();

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  return hash;
}

function edgeMotionConfig(edge: GraphEdge) {
  const isIncrease = edge.polarity === 'Excitatory';
  const strength = Math.max(0.05, Math.min(1, Math.abs(edge.weight)));
  return {
    color: isIncrease ? '#64d8a2' : '#ff6577',
    dash: `${8 + (1 - strength) * 4} ${5 + (1 - strength) * 3}`,
    duration: `${(2.8 - strength * 2.1).toFixed(2)}s`,
    reverse: !isIncrease,
    width: 1.15 + strength * 2.5,
    opacity: 0.30 + strength * 0.58,
  };
}

function nodeGlyph(nodeType: NodeType) {
  switch (nodeType) {
    case 'Observation': return '◎';
    case 'PriorInstinct': return '◈';
    case 'Motivation': return '▲';
    case 'Action': return '▶';
    case 'Meme': return 'μ';
  }
}

function curveForEdge(source: GraphNode, target: GraphNode, edgeId: string) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const start = { x: source.x + ux * (source.r + 2), y: source.y + uy * (source.r + 2) };
  const end = { x: target.x - ux * (target.r + 8), y: target.y - uy * (target.r + 8) };
  const bendBand = (hashString(edgeId) % 7) - 3;
  const bend = bendBand === 0 ? 10 : bendBand * 8;
  const control = {
    x: (start.x + end.x) / 2 - uy * bend,
    y: (start.y + end.y) / 2 + ux * bend,
  };
  const label = {
    x: (start.x + 2 * control.x + end.x) / 4,
    y: (start.y + 2 * control.y + end.y) / 4,
  };
  return { path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`, label };
}

function renderedGeometry(svg: SVGSVGElement, width: number, height: number) {
  const rect = svg.getBoundingClientRect();
  const renderedScale = Math.min(rect.width / width, rect.height / height);
  return {
    rect,
    renderedScale,
    offsetX: (rect.width - width * renderedScale) / 2,
    offsetY: (rect.height - height * renderedScale) / 2,
  };
}

export function GraphSvg({
  nodes,
  edges,
  width,
  height,
  selectedNodeId,
  selectedEdgeId,
  highlightedEdgeIds,
  hiddenTypes,
  hiddenNodeIds = EMPTY_SET,
  focusNodeIds = EMPTY_SET,
  matchedNodeIds = null,
  onSelectNode,
  onSelectEdge,
  onDeselect,
  onMoveNode,
  onResetLayout,
  canResetLayout = false,
}: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const prefix = useId().replace(/:/g, '');
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  const panRef = useRef<{ startClientX: number; startClientY: number; startTx: number; startTy: number } | null>(null);
  const touchPanRef = useRef<{ startClientX: number; startClientY: number; startTx: number; startTy: number } | null>(null);
  const nodeDragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    last: Point;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, Point>>({});

  useEffect(() => {
    setLivePositions((previous) => {
      let changed = false;
      const next = { ...previous };
      nodes.forEach((node) => {
        const live = next[node.instance_id];
        if (live && Math.hypot(live.x - node.x, live.y - node.y) < 0.75) {
          delete next[node.instance_id];
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [nodes]);

  const renderedNodes = useMemo(
    () => nodes.map((node) => ({ ...node, ...(livePositions[node.instance_id] ?? {}) })),
    [nodes, livePositions],
  );
  const visibleNodes = useMemo(
    () => renderedNodes.filter((node) => !hiddenNodeIds.has(node.instance_id) && !hiddenTypes?.has(node.node_type)),
    [renderedNodes, hiddenNodeIds, hiddenTypes],
  );
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.instance_id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleNodeIds.has(edge.source_instance_id) && visibleNodeIds.has(edge.target_instance_id)),
    [edges, visibleNodeIds],
  );
  const nodeMap = useMemo(() => new Map(visibleNodes.map((node) => [node.instance_id, node])), [visibleNodes]);

  const clusterVisuals = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    visibleNodes.forEach((node) => {
      const group = groups.get(node.cluster_id) ?? [];
      group.push(node);
      groups.set(node.cluster_id, group);
    });
    return [...groups.entries()].map(([id, members]) => {
      const x = members.reduce((sum, node) => sum + node.x, 0) / members.length;
      const y = members.reduce((sum, node) => sum + node.y, 0) / members.length;
      const radius = Math.max(42, ...members.map((node) => Math.hypot(node.x - x, node.y - y) + node.r + 26));
      const type = id.startsWith('type:') ? id.slice(5) as NodeType : null;
      const layer = id.startsWith('layer:') ? Number(id.slice(6)) : null;
      const color = type ? NODE_TYPE_COLORS[type] : ['#42a5f5', '#ab47bc', '#ffa726'][layer ?? 1];
      const label = type
        ? nodeTypeLabel(type)
        : t(['graph.cluster.physical', 'graph.cluster.social', 'graph.cluster.cultural'][layer ?? 1]);
      return { id, x, y, radius, color, label, count: members.length };
    });
  }, [visibleNodes, t]);

  const fitView = useMemo<Viewport>(() => {
    if (visibleNodes.length === 0) return { tx: 0, ty: 0, scale: 1 };
    const minX = Math.min(...visibleNodes.map((node) => node.x - node.r - 45));
    const maxX = Math.max(...visibleNodes.map((node) => node.x + node.r + 45));
    const minY = Math.min(...visibleNodes.map((node) => node.y - node.r - 45));
    const maxY = Math.max(...visibleNodes.map((node) => node.y + node.r + 45));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const scale = Math.max(0.28, Math.min(2.4, Math.min(width / contentWidth, height / contentHeight)));
    return {
      scale,
      tx: width / 2 - ((minX + maxX) / 2) * scale,
      ty: height / 2 - ((minY + maxY) / 2) * scale,
    };
  }, [visibleNodes, width, height]);
  const [viewport, setViewport] = useState<Viewport>(fitView);
  const topologyKey = useMemo(
    () => visibleNodes.map((node) => node.instance_id).sort().join('|'),
    [visibleNodes],
  );
  const previousTopologyKey = useRef('');
  useEffect(() => {
    if (previousTopologyKey.current !== topologyKey) {
      previousTopologyKey.current = topologyKey;
      setViewport(fitView);
    }
  }, [topologyKey, fitView]);

  const clampScale = (scale: number) => Math.max(0.18, Math.min(4.5, scale));
  const graphPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: width / 2, y: height / 2 };
    const geometry = renderedGeometry(svg, width, height);
    const canvasX = (clientX - geometry.rect.left - geometry.offsetX) / geometry.renderedScale;
    const canvasY = (clientY - geometry.rect.top - geometry.offsetY) / geometry.renderedScale;
    return {
      x: Math.max(18, Math.min(width - 18, (canvasX - viewport.tx) / viewport.scale)),
      y: Math.max(18, Math.min(height - 18, (canvasY - viewport.ty) / viewport.scale)),
    };
  }, [height, viewport, width]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const geometry = renderedGeometry(svg, width, height);
    const cursorX = (event.clientX - geometry.rect.left - geometry.offsetX) / geometry.renderedScale;
    const cursorY = (event.clientY - geometry.rect.top - geometry.offsetY) / geometry.renderedScale;
    const factor = event.deltaY > 0 ? 0.9 : 1.11;
    setViewport((current) => {
      const scale = clampScale(current.scale * factor);
      const ratio = scale / current.scale;
      return {
        scale,
        tx: cursorX - (cursorX - current.tx) * ratio,
        ty: cursorY - (cursorY - current.ty) * ratio,
      };
    });
  }, [height, width]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const updateDraggedNode = (clientX: number, clientY: number) => {
    const drag = nodeDragRef.current;
    if (!drag) return false;
    const next = graphPoint(clientX, clientY);
    drag.last = next;
    drag.moved ||= Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) > 3;
    setLivePositions((positions) => ({ ...positions, [drag.id]: next }));
    return true;
  };

  const finishNodeDrag = () => {
    const drag = nodeDragRef.current;
    if (!drag) return;
    if (drag.moved) {
      suppressClickRef.current = drag.id;
      onMoveNode?.(drag.id, drag.last.x, drag.last.y);
    }
    nodeDragRef.current = null;
  };

  const handleMouseMove: React.MouseEventHandler<SVGSVGElement> = (event) => {
    if (updateDraggedNode(event.clientX, event.clientY)) return;
    const pan = panRef.current;
    if (!pan || !svgRef.current) return;
    const { renderedScale } = renderedGeometry(svgRef.current, width, height);
    setViewport((current) => ({
      ...current,
      tx: pan.startTx + (event.clientX - pan.startClientX) / renderedScale,
      ty: pan.startTy + (event.clientY - pan.startClientY) / renderedScale,
    }));
  };

  const finishMouseInteraction = () => {
    finishNodeDrag();
    panRef.current = null;
  };

  const touchDistance = (touches: React.TouchList) => touches.length < 2
    ? 0
    : Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const handleTouchStart: React.TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length === 2) {
      pinchRef.current = { startDistance: touchDistance(event.touches), startScale: viewport.scale };
      touchPanRef.current = null;
    } else if (event.touches.length === 1 && !nodeDragRef.current) {
      const touch = event.touches[0];
      touchPanRef.current = {
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startTx: viewport.tx,
        startTy: viewport.ty,
      };
    }
  };

  const handleTouchMove: React.TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length === 1 && nodeDragRef.current) {
      event.preventDefault();
      updateDraggedNode(event.touches[0].clientX, event.touches[0].clientY);
      return;
    }
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      const ratio = touchDistance(event.touches) / Math.max(1, pinchRef.current.startDistance);
      setViewport((current) => ({ ...current, scale: clampScale(pinchRef.current!.startScale * ratio) }));
      return;
    }
    const pan = touchPanRef.current;
    if (event.touches.length === 1 && pan && svgRef.current) {
      event.preventDefault();
      const { renderedScale } = renderedGeometry(svgRef.current, width, height);
      setViewport((current) => ({
        ...current,
        tx: pan.startTx + (event.touches[0].clientX - pan.startClientX) / renderedScale,
        ty: pan.startTy + (event.touches[0].clientY - pan.startClientY) / renderedScale,
      }));
    }
  };

  const handleTouchEnd: React.TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length < 2) pinchRef.current = null;
    if (event.touches.length === 0) {
      finishNodeDrag();
      touchPanRef.current = null;
    }
  };

  const transform = `translate(${viewport.tx}, ${viewport.ty}) scale(${viewport.scale})`;
  const shouldAnimateEdges = visibleEdges.length <= 80;
  const hasFocus = focusNodeIds.size > 0;

  return (
    <Box sx={{ flex: 1, minWidth: 0, bgcolor: '#080b10', position: 'relative', overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        width='100%'
        height='100%'
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio='xMidYMid meet'
        onMouseDown={(event) => {
          if (event.button !== 0 || nodeDragRef.current) return;
          panRef.current = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            startTx: viewport.tx,
            startTy: viewport.ty,
          };
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={finishMouseInteraction}
        onMouseLeave={finishMouseInteraction}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onDeselect}
        style={{
          display: 'block',
          background: 'radial-gradient(circle at 48% 44%, #151d28 0%, #0b1018 54%, #06080d 100%)',
          cursor: panRef.current ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        aria-label={t('graph.canvas.aria')}
      >
        <style>{`
          .edge-flow { animation: graph-dash-flow linear infinite; }
          .edge-flow.reverse { animation-direction: reverse; }
          @keyframes graph-dash-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -120; } }
          .graph-node:focus-visible > .node-focus { stroke: white; stroke-width: 3.5px; }
          .graph-edge:focus-visible > .edge-visible { stroke-width: 5px; }
        `}</style>
        <defs>
          <filter id={`${prefix}-glow`} x='-60%' y='-60%' width='220%' height='220%'>
            <feGaussianBlur stdDeviation='3' result='blur' />
            <feMerge><feMergeNode in='blur' /><feMergeNode in='SourceGraphic' /></feMerge>
          </filter>
          <filter id={`${prefix}-node-shadow`} x='-80%' y='-80%' width='260%' height='260%'>
            <feDropShadow dx='0' dy='2' stdDeviation='3' floodColor='#000' floodOpacity='0.75' />
          </filter>
          <marker id={`${prefix}-arrow-excite`} viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto'>
            <path d='M 0 0 L 10 5 L 0 10 z' fill='#64d8a2' />
          </marker>
          <marker id={`${prefix}-arrow-inhibit`} viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto'>
            <path d='M 0 0 L 10 5 L 0 10 z' fill='#ff6577' />
          </marker>
        </defs>

        <g transform={transform}>
          {clusterVisuals.map((cluster) => (
            <g key={cluster.id} pointerEvents='none' opacity={0.62}>
              <circle
                cx={cluster.x}
                cy={cluster.y}
                r={cluster.radius}
                fill={cluster.color}
                fillOpacity={0.025}
                stroke={cluster.color}
                strokeOpacity={0.17}
                strokeWidth={1}
                strokeDasharray='5 8'
              />
              <text x={cluster.x} y={cluster.y - cluster.radius + 16} textAnchor='middle' fill={cluster.color} fontSize={10} letterSpacing={1.2}>
                {cluster.label.toUpperCase()} · {cluster.count}
              </text>
            </g>
          ))}

          {visibleEdges.map((edge) => {
            const source = nodeMap.get(edge.source_instance_id);
            const target = nodeMap.get(edge.target_instance_id);
            if (!source || !target) return null;
            const motion = edgeMotionConfig(edge);
            const geometry = curveForEdge(source, target, edge.edge_id);
            const selected = selectedEdgeId === edge.edge_id;
            const highlighted = highlightedEdgeIds.has(edge.edge_id);
            const focusDimmed = hasFocus && !(focusNodeIds.has(source.instance_id) && focusNodeIds.has(target.instance_id));
            const searchDimmed = matchedNodeIds !== null
              && !matchedNodeIds.has(source.instance_id)
              && !matchedNodeIds.has(target.instance_id);
            const dimmed = focusDimmed || searchDimmed;
            const showLabel = selected || highlighted || visibleEdges.length <= 14;
            const label = `${edge.polarity === 'Excitatory' ? '+' : '−'}${edge.weight.toFixed(2)} · ${edge.learn_type}`;
            return (
              <g
                key={edge.edge_id}
                className='graph-edge'
                role='button'
                tabIndex={0}
                aria-label={t('graph.edge.aria', { source: translateLabel(source.label), target: translateLabel(target.label), weight: edge.weight.toFixed(2) })}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); onSelectEdge(edge.edge_id); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectEdge(edge.edge_id);
                  }
                }}
                style={{ cursor: 'pointer', outline: 'none' }}
                opacity={dimmed ? 0.14 : 1}
              >
                <path d={geometry.path} fill='none' stroke='transparent' strokeWidth={14} />
                <path
                  className={`edge-visible ${shouldAnimateEdges && !dimmed ? `edge-flow ${motion.reverse ? 'reverse' : ''}` : ''}`}
                  d={geometry.path}
                  fill='none'
                  stroke={motion.color}
                  strokeOpacity={selected || highlighted ? 1 : motion.opacity}
                  strokeWidth={selected ? motion.width + 1.4 : highlighted ? motion.width + 1.8 : motion.width}
                  strokeDasharray={shouldAnimateEdges ? motion.dash : undefined}
                  markerEnd={`url(#${prefix}-${edge.polarity === 'Excitatory' ? 'arrow-excite' : 'arrow-inhibit'})`}
                  style={shouldAnimateEdges ? { animationDuration: motion.duration } : undefined}
                  filter={highlighted ? `url(#${prefix}-glow)` : undefined}
                >
                  <title>{`${edge.edge_id}\n${edge.polarity} · ${edge.learn_type}\nweight ${edge.weight.toFixed(3)} · ${edge.learnable ? 'learnable' : 'fixed'}`}</title>
                </path>
                {showLabel && !dimmed && (
                  <g pointerEvents='none'>
                    <rect
                      x={geometry.label.x - 39}
                      y={geometry.label.y - 10}
                      width={78}
                      height={17}
                      rx={8.5}
                      fill='rgba(5,9,15,0.9)'
                      stroke={motion.color}
                      strokeOpacity={0.5}
                    />
                    <text x={geometry.label.x} y={geometry.label.y + 2} textAnchor='middle' fontSize={8.5} fill='#d8e2ea'>
                      {label.slice(0, 25)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {visibleNodes.map((node) => {
            const selected = selectedNodeId === node.instance_id;
            const color = NODE_TYPE_COLORS[node.node_type];
            const unknown = !!node.isUnknown;
            const focusDimmed = hasFocus && !focusNodeIds.has(node.instance_id);
            const searchDimmed = matchedNodeIds !== null && !matchedNodeIds.has(node.instance_id);
            const dimmed = focusDimmed || searchDimmed;
            const label = unknown ? t('graph.unknown') : translateLabel(node.label).slice(0, 18);
            const labelWidth = Math.max(26, Math.min(126, label.length * 6.2 + 14));
            const circumference = 2 * Math.PI * (node.r + 4);
            return (
              <g
                key={node.instance_id}
                className='graph-node'
                transform={`translate(${node.x}, ${node.y})`}
                role='button'
                tabIndex={0}
                aria-label={unknown
                  ? t('graph.node.unknownAria')
                  : t('graph.node.aria', { label: translateLabel(node.label), type: nodeTypeLabel(node.node_type), value: node.value.toFixed(2) })}
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  nodeDragRef.current = {
                    id: node.instance_id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    last: { x: node.x, y: node.y },
                    moved: false,
                  };
                }}
                onTouchStart={(event) => {
                  if (event.touches.length !== 1) return;
                  event.stopPropagation();
                  const touch = event.touches[0];
                  nodeDragRef.current = {
                    id: node.instance_id,
                    startClientX: touch.clientX,
                    startClientY: touch.clientY,
                    last: { x: node.x, y: node.y },
                    moved: false,
                  };
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (suppressClickRef.current === node.instance_id) {
                    suppressClickRef.current = null;
                    return;
                  }
                  onSelectNode(node.instance_id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectNode(node.instance_id);
                  }
                }}
                style={{ cursor: onMoveNode ? 'grab' : 'pointer', outline: 'none' }}
                opacity={dimmed ? 0.2 : 1}
              >
                <circle className='node-focus' r={node.r + (selected ? 7 : 5)} fill='rgba(0,0,0,0.7)' stroke={selected ? '#fff' : color} strokeOpacity={selected ? 1 : 0.5} strokeWidth={selected ? 2.4 : 1.2} filter={`url(#${prefix}-node-shadow)`} />
                <circle
                  r={node.r + 4}
                  fill='none'
                  stroke={unknown ? '#78909c' : color}
                  strokeWidth={2.2}
                  strokeOpacity={node.active ? 0.9 : 0.3}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - Math.max(0.03, Math.min(1, node.value)))}
                  transform='rotate(-90)'
                />
                <circle
                  r={node.r}
                  fill={unknown ? '#263642' : color}
                  fillOpacity={unknown ? 0.8 : node.active ? (node.attended ? 0.9 : 0.55) : 0.24}
                  stroke={node.suppression > 0 ? '#ffb74d' : 'rgba(255,255,255,0.22)'}
                  strokeWidth={node.suppression > 0 ? 2.2 : 0.8}
                />
                <text x={0} y={4} textAnchor='middle' fill='#fff' fontSize={unknown ? 15 : 11} fontWeight={700} pointerEvents='none'>
                  {unknown ? '?' : nodeGlyph(node.node_type)}
                </text>
                <g transform={`translate(0, ${node.r + 16})`} pointerEvents='none'>
                  <rect x={-labelWidth / 2} y={-9} width={labelWidth} height={18} rx={9} fill='rgba(4,8,13,0.9)' stroke={selected ? '#fff' : color} strokeOpacity={selected ? 0.9 : 0.42} />
                  <text x={0} y={3.5} textAnchor='middle' fill='#e2e8f0' fontSize={9.5}>{label}</text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <Box sx={{
        position: 'absolute', right: 10, bottom: 10,
        display: 'flex', alignItems: 'center', gap: 0.25,
        p: 0.35, borderRadius: 1.5,
        bgcolor: 'rgba(5,8,13,0.84)', border: '1px solid rgba(130,160,190,0.2)',
        backdropFilter: 'blur(8px)', userSelect: 'none',
      }}>
        <Tooltip title={t('graph.zoomIn')}><IconButton size='small' aria-label={t('graph.zoomIn')} onClick={() => setViewport((current) => ({ ...current, scale: clampScale(current.scale * 1.2) }))}><ZoomInIcon fontSize='small' /></IconButton></Tooltip>
        <Box sx={{ fontSize: 10, color: '#aebbc7', minWidth: 34, textAlign: 'center' }}>{Math.round(viewport.scale * 100)}%</Box>
        <Tooltip title={t('graph.zoomOut')}><IconButton size='small' aria-label={t('graph.zoomOut')} onClick={() => setViewport((current) => ({ ...current, scale: clampScale(current.scale * 0.83) }))}><ZoomOutIcon fontSize='small' /></IconButton></Tooltip>
        <Tooltip title={t('graph.fit')}><IconButton size='small' aria-label={t('graph.fit')} onClick={() => setViewport(fitView)}><CenterFocusStrongIcon fontSize='small' /></IconButton></Tooltip>
        {onResetLayout && (
          <Tooltip title={t('graph.layout.reset')}><span><IconButton size='small' aria-label={t('graph.layout.reset')} disabled={!canResetLayout} onClick={onResetLayout}><RestartAltIcon fontSize='small' /></IconButton></span></Tooltip>
        )}
      </Box>
      <Box sx={{ position: 'absolute', left: 9, bottom: 10, fontSize: 10, color: 'rgba(210,225,238,0.42)', pointerEvents: 'none' }}>
        {t('graph.pan.hint')}
      </Box>
    </Box>
  );
}
