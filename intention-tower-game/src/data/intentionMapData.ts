import { NodeType, CategoryType, NodeData, EdgeData, FlowEffect, CategoryInfo, IntentionMapData } from '../types/IntentionMap';

// 分类信息配置
export const categoryConfig: CategoryInfo[] = [
  // 顶层文化模因
  { type: CategoryType.TOP_CULTURE, name: '顶层文化模因', description: '社会文化层面的意义构建', color: '#9C27B0', position: { row: 0, col: 0 } },
  { type: CategoryType.KNOWLEDGE_EXPLORATION, name: '知识与探索', description: '学习和发现的驱动力', color: '#3F51B5', position: { row: 0, col: 1 } },
  { type: CategoryType.BELIEF_IDEOLOGY, name: '信仰与意识形态', description: '价值观和信念系统', color: '#2196F3', position: { row: 0, col: 2 } },
  
  // 中层社会习得
  { type: CategoryType.AESTHETIC_VALUE, name: '美学与价值', description: '美感和价值判断', color: '#009688', position: { row: 1, col: 0 } },
  { type: CategoryType.SOCIAL_BELONGING, name: '社交与归属', description: '社会关系和归属感', color: '#4CAF50', position: { row: 1, col: 1 } },
  { type: CategoryType.STATUS_DOMINANCE, name: '地位与支配', description: '社会地位和权力', color: '#8BC34A', position: { row: 1, col: 2 } },
  
  // 底层生理驱动
  { type: CategoryType.CURIOSITY_CREATION, name: '好奇与创造', description: '探索欲和创造力', color: '#CDDC39', position: { row: 2, col: 0 } },
  { type: CategoryType.FORAGING_SURVIVAL, name: '觅食与生存', description: '基本生存需求', color: '#FF9800', position: { row: 2, col: 1 } },
  { type: CategoryType.SAFETY_AVOIDANCE, name: '安全与逃避', description: '安全感和威胁规避', color: '#FF5722', position: { row: 2, col: 2 } },
  { type: CategoryType.REPRODUCTION_INSTINCT, name: '繁衍与本能', description: '繁殖和本能驱动', color: '#F44336', position: { row: 2, col: 3 } }
];

// 示例节点数据
export const sampleNodes: NodeData[] = [
  // 觅食与生存 - 底层
  {
    id: 'hunger_stimulus',
    label: '饥饿感',
    description: '身体缺乏营养时产生的生理信号',
    type: NodeType.UNCONDITIONED_STIMULUS,
    category: CategoryType.FORAGING_SURVIVAL,
    value: 45,
    threshold: [50, 80],
    isActive: false,
    position: { x: 100, y: 500 }
  },
  {
    id: 'food_motivation',
    label: '进食动机',
    description: '想要寻找和摄取食物的冲动',
    type: NodeType.MOTIVATION,
    category: CategoryType.FORAGING_SURVIVAL,
    value: 35,
    threshold: [30, 60],
    isActive: true,
    position: { x: 300, y: 500 }
  },
  {
    id: 'cooking_action',
    label: '烹饪行为',
    description: '制作食物的具体行动',
    type: NodeType.ACTION,
    category: CategoryType.FORAGING_SURVIVAL,
    value: 25,
    threshold: [40],
    isActive: false,
    position: { x: 500, y: 500 }
  },

  // 安全与逃避 - 底层
  {
    id: 'fear_stimulus',
    label: '恐惧感',
    description: '面对威胁时的本能反应',
    type: NodeType.UNCONDITIONED_STIMULUS,
    category: CategoryType.SAFETY_AVOIDANCE,
    value: 20,
    threshold: [40, 70],
    isActive: false,
    position: { x: 100, y: 600 }
  },
  {
    id: 'safety_motivation',
    label: '安全动机',
    description: '寻求安全环境的驱动力',
    type: NodeType.MOTIVATION,
    category: CategoryType.SAFETY_AVOIDANCE,
    value: 15,
    threshold: [25, 50],
    isActive: false,
    position: { x: 300, y: 600 }
  },

  // 社交与归属 - 中层
  {
    id: 'loneliness_stimulus',
    label: '孤独感',
    description: '缺乏社交联系时的负面情绪',
    type: NodeType.UNCONDITIONED_STIMULUS,
    category: CategoryType.SOCIAL_BELONGING,
    value: 30,
    threshold: [40, 70],
    isActive: false,
    position: { x: 100, y: 300 }
  },
  {
    id: 'social_motivation',
    label: '社交动机',
    description: '与他人建立联系的欲望',
    type: NodeType.MOTIVATION,
    category: CategoryType.SOCIAL_BELONGING,
    value: 40,
    threshold: [25, 50],
    isActive: true,
    position: { x: 300, y: 300 }
  },
  {
    id: 'community_meme',
    label: '社区归属模因',
    description: '关于群体身份认同的文化观念',
    type: NodeType.MEME,
    category: CategoryType.SOCIAL_BELONGING,
    value: 30,
    threshold: [20],
    isActive: true,
    position: { x: 500, y: 300 }
  },
  {
    id: 'social_action',
    label: '社交行为',
    description: '主动与他人交流互动',
    type: NodeType.ACTION,
    category: CategoryType.SOCIAL_BELONGING,
    value: 20,
    threshold: [35],
    isActive: false,
    position: { x: 700, y: 300 }
  },

  // 知识与探索 - 顶层
  {
    id: 'curiosity_stimulus',
    label: '好奇心',
    description: '对未知事物的天然兴趣',
    type: NodeType.UNCONDITIONED_STIMULUS,
    category: CategoryType.KNOWLEDGE_EXPLORATION,
    value: 55,
    threshold: [30, 60],
    isActive: true,
    position: { x: 100, y: 100 }
  },
  {
    id: 'learning_motivation',
    label: '学习动机',
    description: '获取新知识和技能的驱动力',
    type: NodeType.MOTIVATION,
    category: CategoryType.KNOWLEDGE_EXPLORATION,
    value: 60,
    threshold: [20, 40],
    isActive: true,
    position: { x: 300, y: 100 }
  },
  {
    id: 'research_action',
    label: '研究行为',
    description: '主动探索和学习的行为',
    type: NodeType.ACTION,
    category: CategoryType.KNOWLEDGE_EXPLORATION,
    value: 45,
    threshold: [35],
    isActive: true,
    position: { x: 500, y: 100 }
  },

  // 美学与价值 - 顶层  
  {
    id: 'beauty_observation',
    label: '美感观察',
    description: '对美好事物的感知和欣赏',
    type: NodeType.OBSERVATION,
    category: CategoryType.AESTHETIC_VALUE,
    value: 25,
    threshold: [20, 40],
    isActive: false,
    position: { x: 100, y: 200 }
  },
  {
    id: 'aesthetic_motivation',
    label: '审美动机',
    description: '追求美和艺术的内在驱动',
    type: NodeType.MOTIVATION,
    category: CategoryType.AESTHETIC_VALUE,
    value: 35,
    threshold: [30, 50],
    isActive: true,
    position: { x: 300, y: 200 }
  },
  {
    id: 'creativity_action',
    label: '创作行为',
    description: '艺术创造和表达的行为',
    type: NodeType.ACTION,
    category: CategoryType.AESTHETIC_VALUE,
    value: 20,
    threshold: [25],
    isActive: false,
    position: { x: 500, y: 200 }
  },

  // 地位与支配 - 中层
  {
    id: 'achievement_motivation',
    label: '成就动机',
    description: '追求成功和认可的驱动力',
    type: NodeType.MOTIVATION,
    category: CategoryType.STATUS_DOMINANCE,
    value: 50,
    threshold: [40, 70],
    isActive: true,
    position: { x: 300, y: 400 }
  },
  {
    id: 'competition_action',
    label: '竞争行为',
    description: '与他人竞争以获得优势',
    type: NodeType.ACTION,
    category: CategoryType.STATUS_DOMINANCE,
    value: 30,
    threshold: [35],
    isActive: false,
    position: { x: 500, y: 400 }
  }
];

// 示例连接数据
export const sampleEdges: EdgeData[] = [
  // 基本生存链路
  {
    id: 'hunger_to_food_motivation',
    from: 'hunger_stimulus',
    to: 'food_motivation',
    weight: 0.8,
    flowSpeed: 1.0,
    isFlowing: true
  },
  {
    id: 'food_motivation_to_cooking',
    from: 'food_motivation',
    to: 'cooking_action',
    weight: 0.6,
    flowSpeed: 0.8,
    isFlowing: true
  },

  // 安全链路
  {
    id: 'fear_to_safety',
    from: 'fear_stimulus',
    to: 'safety_motivation',
    weight: 0.9,
    flowSpeed: 1.2,
    isFlowing: false
  },

  // 社交链路
  {
    id: 'loneliness_to_social',
    from: 'loneliness_stimulus',
    to: 'social_motivation',
    weight: 0.7,
    flowSpeed: 0.9,
    isFlowing: false
  },
  {
    id: 'social_to_community',
    from: 'social_motivation',
    to: 'community_meme',
    weight: 0.5,
    flowSpeed: 0.6,
    isFlowing: true
  },
  {
    id: 'community_to_social_action',
    from: 'community_meme',
    to: 'social_action',
    weight: 0.6,
    flowSpeed: 0.7,
    isFlowing: true
  },

  // 学习探索链路
  {
    id: 'curiosity_to_learning',
    from: 'curiosity_stimulus',
    to: 'learning_motivation',
    weight: 0.9,
    flowSpeed: 1.2,
    isFlowing: true
  },
  {
    id: 'learning_to_research',
    from: 'learning_motivation',
    to: 'research_action',
    weight: 0.7,
    flowSpeed: 1.0,
    isFlowing: true
  },

  // 美学链路
  {
    id: 'beauty_to_aesthetic',
    from: 'beauty_observation',
    to: 'aesthetic_motivation',
    weight: 0.6,
    flowSpeed: 0.8,
    isFlowing: false
  },
  {
    id: 'aesthetic_to_creativity',
    from: 'aesthetic_motivation',
    to: 'creativity_action',
    weight: 0.5,
    flowSpeed: 0.6,
    isFlowing: true
  },

  // 成就链路
  {
    id: 'achievement_to_competition',
    from: 'achievement_motivation',
    to: 'competition_action',
    weight: 0.6,
    flowSpeed: 0.9,
    isFlowing: true
  },

  // 跨层级连接：社交影响学习
  {
    id: 'social_to_learning',
    from: 'social_motivation',
    to: 'learning_motivation',
    weight: 0.3,
    flowSpeed: 0.5,
    isFlowing: false
  },

  // 负面连接：恐惧抑制探索
  {
    id: 'fear_inhibits_curiosity',
    from: 'fear_stimulus',
    to: 'curiosity_stimulus',
    weight: -0.4,
    flowSpeed: 0.7,
    isFlowing: false
  }
];

// 示例流动效果
export const sampleFlows: FlowEffect[] = [
  {
    id: 'flow_1',
    edgeId: 'hunger_to_food_motivation',
    progress: 0,
    isPositive: true
  }
];

// 完整的示例数据
export const sampleMapData: IntentionMapData = {
  nodes: sampleNodes,
  edges: sampleEdges,
  flows: sampleFlows
};

// 获取节点类型对应的颜色
export function getNodeColor(type: NodeType): string {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return '#E3F2FD'; // 浅蓝色
    case NodeType.MOTIVATION:
      return '#FFF3E0'; // 浅橙色
    case NodeType.OBSERVATION:
      return '#F3E5F5'; // 浅紫色
    case NodeType.MEME:
      return '#E8F5E8'; // 浅绿色
    case NodeType.ACTION:
      return '#FFEBEE'; // 浅红色
    default:
      return '#F5F5F5'; // 默认灰色
  }
}

// 获取节点类型对应的边框颜色
export function getNodeBorderColor(type: NodeType): string {
  switch (type) {
    case NodeType.UNCONDITIONED_STIMULUS:
      return '#2196F3'; // 蓝色
    case NodeType.MOTIVATION:
      return '#FF9800'; // 橙色
    case NodeType.OBSERVATION:
      return '#9C27B0'; // 紫色
    case NodeType.MEME:
      return '#4CAF50'; // 绿色
    case NodeType.ACTION:
      return '#F44336'; // 红色
    default:
      return '#9E9E9E'; // 默认灰色
  }
}
