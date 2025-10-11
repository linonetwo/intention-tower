/**
 * 游戏核心类型定义
 */

// 游戏模式
export type GameMode = 'observe' | 'micro' | 'graph' | 'menu';

// 时间流速
export type TimeSpeed = 0 | 1 | 2 | 3 | 4;

// 位置
export interface Position {
  x: number;
  y: number;
}

// 角色状态
export interface Character {
  id: string;
  name: string;
  type: string; // 'dog', 'human', 'goose', etc
  position: Position;
  sprite?: string; // 贴图路径
  fallbackChar?: string; // roguelike字符回退，如 '@', 'd', etc
  hp?: number;
  maxHp?: number;
  attributes?: Record<string, unknown>;
  inventory?: Item[];
  workingMemory?: string[]; // 工作记忆中的节点ID
}

// 物品
export interface Item {
  id: string;
  name: string;
  type: string;
  icon?: string;
  sprite?: string;
  fallbackChar?: string;
  position?: Position;
  description?: string;
}

// 命令/动作
export interface Command {
  id: string;
  label: string;
  icon?: string;
  hotkey?: string;
  available: boolean;
  action: () => void;
}

// 对话选项
export interface DialogueOption {
  id: string;
  text: string;
  action: () => void;
}

// 教学引导
export interface Tutorial {
  id: string;
  text: string;
  highlight?: string; // 需要高亮的UI元素
  step: number;
}

// 技能/快捷栏项目
export interface Ability {
  id: string;
  name: string;
  icon?: string;
  hotkey: string; // 'space', '1', '2', '3', '4', 'q', 'w', 'e', 'r'
  cooldown?: number;
  currentCooldown?: number;
  description?: string;
}

// 记忆节点（用于间隔重复）
export interface MemoryNode {
  id: string;
  content: string;
  hotkey?: string;
  lastReview: number; // timestamp
  nextReview: number; // timestamp
  reviewCount: number;
  interval: number; // 间隔天数
}

// 图谱节点
export interface GraphNode {
  id: string;
  label: string;
  type: 'stimulus' | 'response' | 'gene' | 'desire' | 'custom';
  layer: 'sensory' | 'cognitive' | 'biological';
  position?: Position;
  activated?: boolean; // 当前是否被激活
}

// 图谱连接
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'excitatory' | 'inhibitory'; // 兴奋性/抑制性
  strength: number; // 0-1，实线强度或虚线到实线的进度
  visualType: 'dashed' | 'solid'; // 虚线或实线
  color?: string; // 红色表示抑制
}

// 动作队列项
export interface ActionQueueItem {
  id: string;
  characterId: string;
  action: string;
  target?: string;
  progress: number; // 0-1
}

// 关卡数据
export interface Level {
  id: string;
  name: string;
  description: string;
  initialMode: GameMode;
  characters: Character[];
  items: Item[];
  graph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  tutorial?: Tutorial[];
  objectives?: string[];
}
