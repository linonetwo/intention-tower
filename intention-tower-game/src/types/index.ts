export interface MemeNode {
  id: string;
  title: string;
  description?: string;
  category: string; // 9大类别之一
  layer: 'topCultural' | 'middleSocial' | 'bottomPhysical'; // 三层结构
  nodeType: string; // 观察、行动、动机、心情、非条件刺激等
  tags: string[];
  icon?: string; // MUI icon name
  importance?: number; // 1-10 重要性等级
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface MemeLink {
  id: string;
  source: string;
  target: string;
  relationship: string; // 关系类型：驱动、影响、包含等
  strength: number; // 连接强度 0-1
}

export interface CategoryInfo {
  name: string;
  layer: 'topCultural' | 'middleSocial' | 'bottomPhysical';
  color: string;
  description: string;
}

export const CATEGORIES: CategoryInfo[] = [
  // 顶层文化模因
  { name: '知识与探索', layer: 'topCultural', color: '#1976d2', description: '求知欲、学习、研究、发现' },
  { name: '信仰与意识形态', layer: 'topCultural', color: '#1565c0', description: '宗教、哲学、政治信念' },
  { name: '美学与价值', layer: 'topCultural', color: '#0d47a1', description: '艺术、美感、价值观' },
  
  // 中层社会习得
  { name: '社交与归属', layer: 'middleSocial', color: '#7b1fa2', description: '人际关系、群体认同' },
  { name: '地位与支配', layer: 'middleSocial', color: '#6a1b9a', description: '权力、地位、竞争' },
  { name: '好奇与创造', layer: 'middleSocial', color: '#4a148c', description: '创新、探索、表达' },
  
  // 底层生理驱动
  { name: '觅食与生存', layer: 'bottomPhysical', color: '#2e7d32', description: '食物、水、基本生存需求' },
  { name: '安全与逃避', layer: 'bottomPhysical', color: '#388e3c', description: '安全感、避险、防御' },
  { name: '繁衍与本能', layer: 'bottomPhysical', color: '#43a047', description: '繁殖、性、养育' },
];

export const NODE_TYPES = [
  '观察', '行动', '动机', '心情', '非条件刺激'
];
