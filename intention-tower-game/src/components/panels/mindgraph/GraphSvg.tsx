import { Box } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  highlightedEdgeIds: Set<string>;
  hiddenTypes: Set<NodeType>;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onDeselect: () => void;
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

type Viewport = { tx: number; ty: number; scale: number };

export function GraphSvg({
  nodes,
  edges,
  width,
  height,
  selectedNodeId,
  selectedEdgeId,
  highlightedEdgeIds,
  hiddenTypes,
  onSelectNode,
  onSelectEdge,
  onDeselect,
}: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startTx: number; startTy: number } | null>(null);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.instance_id, n])), [nodes]);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hiddenTypes.has(n.node_type)),
    [nodes, hiddenTypes],
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.instance_id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleNodeIds.has(e.source_instance_id) && visibleNodeIds.has(e.target_instance_id)),
    [edges, visibleNodeIds],
  );

  // Compute a "fit" transform so all nodes are visible
  const fitView = useMemo<Viewport>(() => {
    if (visibleNodes.length === 0) return { tx: 0, ty: 0, scale: 1 };
    const xs = visibleNodes.map((n) => n.x);
    const ys = visibleNodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 50;
    const cw = Math.max(1, maxX - minX + pad * 2);
    const ch = Math.max(1, maxY - minY + pad * 2);
    const scale = Math.max(0.35, Math.min(2.4, Math.min(width / cw, height / ch)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return { scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale };
  }, [visibleNodes, width, height]);

  const [vp, setVp] = useState<Viewport>(fitView);

  // Reset to fitView whenever the graph topology changes (nodes added/removed)
  const nodeIdKey = useMemo(() => visibleNodes.map((n) => n.instance_id).sort().join('|'), [visibleNodes]);
  const prevNodeIdKey = useRef('');
  useEffect(() => {
    if (prevNodeIdKey.current !== nodeIdKey) {
      prevNodeIdKey.current = nodeIdKey;
      setVp(fitView);
    }
  }, [nodeIdKey, fitView]);

  const clampScale = (s: number) => Math.max(0.2, Math.min(4, s));

  // ── Wheel: zoom toward cursor (non-passive to allow preventDefault) ────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const renderedScale = Math.min(rect.width / width, rect.height / height);
    const offsetX = (rect.width - width * renderedScale) / 2;
    const offsetY = (rect.height - height * renderedScale) / 2;
    const cx = (e.clientX - rect.left - offsetX) / renderedScale;
    const cy = (e.clientY - rect.top - offsetY) / renderedScale;

    const factor = e.deltaY > 0 ? 0.9 : 1.11;
    setVp((v) => {
      const nextScale = clampScale(v.scale * factor);
      const ratio = nextScale / v.scale;
      return {
        scale: nextScale,
        tx: cx - (cx - v.tx) * ratio,
        ty: cy - (cy - v.ty) * ratio,
      };
    });
  }, [width, height]);

  // Attach wheel as non-passive so preventDefault works
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Mouse drag: pan ────────────────────────────────────────────────────────
  const handleMouseDown: React.MouseEventHandler<SVGSVGElement> = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startTx: vp.tx, startTy: vp.ty };
  };

  const handleMouseMove: React.MouseEventHandler<SVGSVGElement> = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const renderedScale = Math.min(rect.width / width, rect.height / height);
    const dx = (e.clientX - drag.startClientX) / renderedScale;
    const dy = (e.clientY - drag.startClientY) / renderedScale;
    setVp(() => ({ tx: drag.startTx + dx, ty: drag.startTy + dy, scale: vp.scale }));
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };
  const handleMouseLeave = () => { dragRef.current = null; };

  // ── Touch pinch: zoom ──────────────────────────────────────────────────────
  const touchDist = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  };

  const handleTouchStart: React.TouchEventHandler<SVGSVGElement> = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDistance: touchDist(e.touches), startScale: vp.scale };
    }
  };

  const handleTouchMove: React.TouchEventHandler<SVGSVGElement> = (e) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const ratio = touchDist(e.touches) / Math.max(1, pinchRef.current.startDistance);
    const nextScale = clampScale(pinchRef.current.startScale * ratio);
    setVp((v) => ({ ...v, scale: nextScale }));
  };

  const handleTouchEnd: React.TouchEventHandler<SVGSVGElement> = (e) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  const transformStr = `translate(${vp.tx}, ${vp.ty}) scale(${vp.scale})`;
  const shouldAnimateEdges = visibleEdges.length <= 80;
  const showEdgeLabels = visibleEdges.length <= 45;

  return (
    <Box sx={{ flex: 1, minWidth: 0, bgcolor: '#111418', position: 'relative' }}>
      <svg
        ref={svgRef}
        width='100%'
        height='100%'
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio='xMidYMid meet'
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onDeselect}
        style={{ display: 'block', background: 'radial-gradient(circle at center, #1a1f26 0%, #0f1217 80%)', cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <style>
          {`
            .edge-flow { animation-name: dash-flow; animation-timing-function: linear; animation-iteration-count: infinite; }
            .edge-flow.reverse { animation-direction: reverse; }
            @keyframes dash-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -120; } }
          `}
        </style>
        <defs>
          <filter id='edge-glow' x='-50%' y='-50%' width='200%' height='200%'>
            <feGaussianBlur stdDeviation='2.4' result='blur' />
            <feMerge><feMergeNode in='blur' /><feMergeNode in='SourceGraphic' /></feMerge>
          </filter>
          <marker id='arrow-excite' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
            <path d='M 0 0 L 10 5 L 0 10 z' fill='#6fcf97' />
          </marker>
          <marker id='arrow-inhibit' viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
            <path d='M 0 0 L 10 5 L 0 10 z' fill='#ff6b6b' />
          </marker>
        </defs>

        <g transform={transformStr}>
          {visibleEdges.map((edge) => {
            const source = nodeMap.get(edge.source_instance_id);
            const target = nodeMap.get(edge.target_instance_id);
            if (!source || !target) return null;
            const motion = edgeMotionConfig(edge);
            const midX = (source.x + target.x) / 2;
            const midY = (source.y + target.y) / 2;
            const selected = selectedEdgeId === edge.edge_id;
            const highlighted = highlightedEdgeIds.has(edge.edge_id);
            const label = `${edge.polarity === 'Excitatory' ? '+' : '-'}${edge.weight.toFixed(2)} | ${edge.learn_type}${edge.learnable ? ` | ${t('graph.edge.learnable')}` : ''}`;
            return (
              <g
                key={edge.edge_id}
                onClick={(e) => { e.stopPropagation(); onSelectEdge(edge.edge_id); }}
                style={{ cursor: 'pointer' }}
              >
                <line
                  x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                  stroke={motion.color}
                  strokeOpacity={selected || highlighted ? 1 : motion.opacity}
                  strokeWidth={selected ? motion.width + 1.2 : highlighted ? motion.width + 1.8 : motion.width}
                  strokeDasharray={shouldAnimateEdges ? motion.dash : undefined}
                  markerEnd={`url(#${edge.polarity === 'Excitatory' ? 'arrow-excite' : 'arrow-inhibit'})`}
                  className={shouldAnimateEdges ? `edge-flow ${motion.reverse ? 'reverse' : ''}` : undefined}
                  style={shouldAnimateEdges ? { animationDuration: motion.duration } : undefined}
                  filter={highlighted ? 'url(#edge-glow)' : undefined}
                >
                  <title>{`edge: ${edge.edge_id}\nweight: ${edge.weight.toFixed(3)}\npolarity: ${edge.polarity}\nlearn: ${edge.learn_type}\nlearnable: ${edge.learnable}`}</title>
                </line>
                {showEdgeLabels && (
                  <>
                    <rect x={midX - 34} y={midY - 10} width={68} height={16} rx={8} ry={8}
                      fill='rgba(5,10,16,0.75)' stroke={motion.color} strokeOpacity={0.45} strokeWidth={0.6} />
                    <text x={midX} y={midY + 2} textAnchor='middle' fontSize={8.5} fill='#d9e4ec' style={{ pointerEvents: 'none' }}>
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
            const unknown = !!node.isUnknown;
            return (
              <g
                key={node.instance_id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={(e) => { e.stopPropagation(); onSelectNode(node.instance_id); }}
                style={{ cursor: 'pointer' }}
              >
                <circle r={node.r + (selected ? 5 : 0)}
                  fill={selected ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.26)'}
                  stroke={selected ? '#ffffff' : color}
                  strokeWidth={selected ? 2.4 : 1.6} />
                <circle r={Math.max(7, node.r - 3)}
                  fill={unknown ? '#607d8b' : color}
                  fillOpacity={unknown ? 0.55 : node.active ? 0.95 : 0.35} />
                <text x={0} y={node.r + 14} fill='#cfd8dc' fontSize={10} textAnchor='middle' style={{ pointerEvents: 'none' }}>
                  {unknown ? t('graph.unknown') : translateLabel(node.label).slice(0, 10)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom / pan controls overlay */}
      <Box sx={{
        position: 'absolute', right: 10, bottom: 10,
        display: 'flex', alignItems: 'center', gap: 0.6,
        px: 1, py: 0.5, borderRadius: 1,
        bgcolor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)',
        userSelect: 'none',
      }}>
        <Box
          onClick={() => setVp((v) => ({ ...v, scale: clampScale(v.scale * 1.2) }))}
          sx={{ cursor: 'pointer', fontSize: 14, color: '#e2e8f0', px: 0.6, py: 0.1, borderRadius: 0.8, bgcolor: 'rgba(255,255,255,0.07)', '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' } }}
        >+</Box>
        <Box sx={{ fontSize: 11, color: '#c7d2da', minWidth: 34, textAlign: 'center' }}>{Math.round(vp.scale * 100)}%</Box>
        <Box
          onClick={() => setVp((v) => ({ ...v, scale: clampScale(v.scale * 0.83) }))}
          sx={{ cursor: 'pointer', fontSize: 14, color: '#e2e8f0', px: 0.6, py: 0.1, borderRadius: 0.8, bgcolor: 'rgba(255,255,255,0.07)', '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' } }}
        >−</Box>
        <Box
          onClick={() => setVp(fitView)}
          sx={{ cursor: 'pointer', fontSize: 11, color: '#e2e8f0', px: 0.7, py: 0.2, borderRadius: 0.8, bgcolor: 'rgba(255,255,255,0.08)', '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' } }}
        >{t('graph.fit')}</Box>
      </Box>

      {/* Pan hint */}
      <Box sx={{ position: 'absolute', left: 8, bottom: 10, fontSize: 10, color: 'rgba(255,255,255,0.28)', pointerEvents: 'none' }}>
        {t('graph.pan.hint')}
      </Box>
    </Box>
  );
}