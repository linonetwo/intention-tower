/**
 * 图谱模式状态管理
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GraphEdge, GraphNode } from '../types/game';

interface GraphState {
  // 图谱节点
  nodes: Record<string, GraphNode>;

  // 图谱连接
  edges: Record<string, GraphEdge>;

  // 当前激活的节点
  activeNodeIds: Set<string>;

  // 信号传播动画状态
  signalAnimations: Array<{
    id: string;
    edgeId: string;
    progress: number; // 0-1
  }>;
}

interface GraphActions {
  // 节点管理
  addNode: (node: GraphNode) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, updates: Partial<GraphNode>) => void;
  activateNode: (id: string) => void;
  deactivateNode: (id: string) => void;
  clearActiveNodes: () => void;

  // 边管理
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  updateEdge: (id: string, updates: Partial<GraphEdge>) => void;

  // 强化/削弱连接
  strengthenEdge: (id: string, amount: number) => void;
  weakenEdge: (id: string, amount: number) => void;

  // 信号传播
  propagateSignal: (nodeId: string) => void;
  updateSignalAnimations: (delta: number) => void;

  // 批量操作
  setGraph: (nodes: GraphNode[], edges: GraphEdge[]) => void;

  // 重置
  reset: () => void;
}

const initialState: GraphState = {
  nodes: {},
  edges: {},
  activeNodeIds: new Set(),
  signalAnimations: [],
};

export const useGraphStore = create<GraphState & GraphActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      addNode: (node) => {
        set((state) => ({
          nodes: { ...state.nodes, [node.id]: node },
        }));
      },

      removeNode: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.nodes;
          const activeNodeIds = new Set(state.activeNodeIds);
          activeNodeIds.delete(id);
          return { nodes: rest, activeNodeIds };
        });
      },

      updateNode: (id, updates) => {
        set((state) => {
          const node = state.nodes[id];
          if (!node) return state;
          return {
            nodes: {
              ...state.nodes,
              [id]: { ...node, ...updates },
            },
          };
        });
      },

      activateNode: (id) => {
        set((state) => {
          const activeNodeIds = new Set(state.activeNodeIds);
          activeNodeIds.add(id);
          return { activeNodeIds };
        });
      },

      deactivateNode: (id) => {
        set((state) => {
          const activeNodeIds = new Set(state.activeNodeIds);
          activeNodeIds.delete(id);
          return { activeNodeIds };
        });
      },

      clearActiveNodes: () => {
        set({ activeNodeIds: new Set() });
      },

      addEdge: (edge) => {
        set((state) => ({
          edges: { ...state.edges, [edge.id]: edge },
        }));
      },

      removeEdge: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.edges;
          return { edges: rest };
        });
      },

      updateEdge: (id, updates) => {
        set((state) => {
          const edge = state.edges[id];
          if (!edge) return state;
          return {
            edges: {
              ...state.edges,
              [id]: { ...edge, ...updates },
            },
          };
        });
      },

      strengthenEdge: (id, amount) => {
        set((state) => {
          const edge = state.edges[id];
          if (!edge) return state;

          const newStrength = Math.min(1, edge.strength + amount);
          const visualType = newStrength >= 0.5 ? 'solid' : 'dashed';

          return {
            edges: {
              ...state.edges,
              [id]: { ...edge, strength: newStrength, visualType },
            },
          };
        });
      },

      weakenEdge: (id, amount) => {
        set((state) => {
          const edge = state.edges[id];
          if (!edge) return state;

          const newStrength = Math.max(0, edge.strength - amount);
          const visualType = newStrength >= 0.5 ? 'solid' : 'dashed';

          return {
            edges: {
              ...state.edges,
              [id]: { ...edge, strength: newStrength, visualType },
            },
          };
        });
      },

      propagateSignal: (nodeId) => {
        const { nodes, edges } = get();
        const node = nodes[nodeId];
        if (!node) return;

        // 找到所有从该节点出发的边
        const outgoingEdges = Object.values(edges).filter((edge) => edge.source === nodeId && edge.strength >= 0.5);

        // 为每条边创建信号动画
        const newAnimations = outgoingEdges.map((edge) => ({
          id: `${edge.id}-${Date.now()}`,
          edgeId: edge.id,
          progress: 0,
        }));

        set((state) => ({
          signalAnimations: [...state.signalAnimations, ...newAnimations],
        }));

        // 激活目标节点
        setTimeout(() => {
          outgoingEdges.forEach((edge) => {
            get().activateNode(edge.target);
          });
        }, 500);
      },

      updateSignalAnimations: (delta) => {
        set((state) => {
          const updated = state.signalAnimations
            .map((anim) => ({
              ...anim,
              progress: anim.progress + delta,
            }))
            .filter((anim) => anim.progress < 1);

          return { signalAnimations: updated };
        });
      },

      setGraph: (nodes, edges) => {
        set({
          nodes: nodes.reduce<Record<string, GraphNode>>((accumulator, node) => {
            accumulator[node.id] = node;
            return accumulator;
          }, {}),
          edges: edges.reduce<Record<string, GraphEdge>>((accumulator, edge) => {
            accumulator[edge.id] = edge;
            return accumulator;
          }, {}),
        });
      },

      reset: () => {
        set(initialState);
      },
    }),
    { name: 'graph-store' },
  ),
);
