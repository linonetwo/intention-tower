// 节点类型
export enum NodeType {
  MOTIVATION = 'motivation',        // 动机
  UNCONDITIONED_STIMULUS = 'unconditioned_stimulus', // 非条件刺激
  OBSERVATION = 'observation',      // 观察
  MEME = 'meme',                   // 模因
  ACTION = 'action'                // 行动
}

// 9大分类
export enum CategoryType {
  TOP_CULTURE = 'top_culture',              // 顶层文化模因
  KNOWLEDGE_EXPLORATION = 'knowledge_exploration', // 知识与探索
  BELIEF_IDEOLOGY = 'belief_ideology',      // 信仰与意识形态
  AESTHETIC_VALUE = 'aesthetic_value',      // 美学与价值
  SOCIAL_BELONGING = 'social_belonging',    // 社交与归属
  STATUS_DOMINANCE = 'status_dominance',    // 地位与支配
  CURIOSITY_CREATION = 'curiosity_creation', // 好奇与创造
  FORAGING_SURVIVAL = 'foraging_survival',  // 觅食与生存
  SAFETY_AVOIDANCE = 'safety_avoidance',    // 安全与逃避
  REPRODUCTION_INSTINCT = 'reproduction_instinct' // 繁衍与本能
}

// 节点数据
export interface NodeData {
  id: string;
  label: string;
  description: string;
  type: NodeType;
  category: CategoryType;
  value: number;          // 内部数值
  threshold: number[];    // 触发阈值数组
  isActive: boolean;      // 是否激活
  position: { x: number; y: number };
}

// 连接数据
export interface EdgeData {
  id: string;
  from: string;
  to: string;
  weight: number;         // 连接权重，正值为促进，负值为抑制
  flowSpeed: number;      // 流动速度
  isFlowing: boolean;     // 是否正在流动
}

// 流动效果
export interface FlowEffect {
  id: string;
  edgeId: string;
  progress: number;       // 流动进度 0-1
  isPositive: boolean;    // 是否为正向流动
}

// 分类信息
export interface CategoryInfo {
  type: CategoryType;
  name: string;
  description: string;
  color: string;
  position: { row: number; col: number };
}

// 图谱数据
export interface IntentionMapData {
  nodes: NodeData[];
  edges: EdgeData[];
  flows: FlowEffect[];
}
