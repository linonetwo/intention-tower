/**
 * 关卡数据：雏鹅的印刻行为
 */
import type { Level } from '../../types/game';

export const goslingImprintingLevel: Level = {
  id: 'gosling-imprinting',
  name: '雏鹅的印刻行为',
  description: '体验关键期印刻现象，了解多巴胺系统的作用',
  initialMode: 'observe',
  
  characters: [
    {
      id: 'farm-girl',
      name: '农家少女',
      type: 'human',
      position: { x: 300, y: 300 },
      fallbackChar: '@',
      hp: 100,
      maxHp: 100,
    },
    {
      id: 'gosling',
      name: '小鹅',
      type: 'goose',
      position: { x: 450, y: 300 },
      fallbackChar: 'g',
      hp: 50,
      maxHp: 50,
      workingMemory: [],
    },
  ],
  
  items: [
    {
      id: 'egg',
      name: '鹅蛋',
      type: 'egg',
      fallbackChar: 'o',
      position: { x: 400, y: 300 },
      description: '即将孵化的鹅蛋',
    },
  ],
  
  graph: {
    nodes: [
      // 感官层
      {
        id: 'stimulus-visual-girl',
        label: '视觉：看到少女',
        type: 'stimulus',
        layer: 'sensory',
        position: { x: 100, y: 200 },
      },
      {
        id: 'stimulus-touch-warmth',
        label: '触觉：温暖的抚摸',
        type: 'stimulus',
        layer: 'sensory',
        position: { x: 100, y: 350 },
      },
      
      // 认知层
      {
        id: 'imprint-target',
        label: '印刻对象',
        type: 'custom',
        layer: 'cognitive',
        position: { x: 400, y: 275 },
      },
      
      // 生物层
      {
        id: 'gene-follow',
        label: '基因：跟随',
        type: 'gene',
        layer: 'biological',
        position: { x: 700, y: 275 },
      },
      {
        id: 'gene-dopamine',
        label: '多巴胺奖励',
        type: 'gene',
        layer: 'biological',
        position: { x: 400, y: 450 },
      },
    ],
    
    edges: [
      // 印刻对象触发跟随
      {
        id: 'edge-imprint-follow',
        source: 'imprint-target',
        target: 'gene-follow',
        type: 'excitatory',
        strength: 0.1,
        visualType: 'dashed',
      },
      
      // 视觉刺激建立印刻（需要多巴胺强化）
      {
        id: 'edge-visual-imprint',
        source: 'stimulus-visual-girl',
        target: 'imprint-target',
        type: 'excitatory',
        strength: 0.1,
        visualType: 'dashed',
      },
      
      // 触觉刺激释放多巴胺
      {
        id: 'edge-touch-dopamine',
        source: 'stimulus-touch-warmth',
        target: 'gene-dopamine',
        type: 'excitatory',
        strength: 1,
        visualType: 'solid',
      },
    ],
  },
  
  tutorial: [
    {
      id: 'tut-1',
      text: '本关卡不限定主角，左键点击谁，就以谁为主语使用动作。',
      step: 1,
    },
    {
      id: 'tut-2',
      text: '提示左键点击农家少女，然后右键点击鹅蛋使用"抚摸"',
      step: 2,
    },
    {
      id: 'tut-3',
      text: '再次右键使用"观察"，等待小鹅孵化',
      step: 3,
    },
    {
      id: 'tut-4',
      text: '提示双击农家少女查看详情，动作队列里有抚摸和观察',
      step: 4,
    },
    {
      id: 'tut-5',
      text: '通过对话，农家少女表示了对鹅蛋的喜爱，等小鹅出生后想和它成为好朋友',
      step: 5,
    },
    {
      id: 'tut-6',
      text: '切换到微操模式（按M），控制小鹅移动，观察它总是跟随少女',
      step: 6,
    },
  ],
  
  objectives: [
    '帮助鹅蛋孵化',
    '建立小鹅对少女的印刻',
    '观察跟随行为',
  ],
};
