/**
 * 关卡数据：巴甫洛夫的狗
 */
import type { Level } from '../../types/game';

export const pavlovsDogLevel: Level = {
  id: 'pavlovs-dog',
  name: '巴甫洛夫的狗',
  description: '经典的条件反射实验，学习如何通过配对刺激建立联系',
  initialMode: 'observe',
  
  characters: [
    {
      id: 'pavlov',
      name: '巴甫洛夫',
      type: 'human',
      position: { x: 200, y: 300 },
      fallbackChar: '@',
      hp: 100,
      maxHp: 100,
    },
    {
      id: 'dog',
      name: '实验犬',
      type: 'dog',
      position: { x: 400, y: 300 },
      fallbackChar: 'd',
      hp: 100,
      maxHp: 100,
      workingMemory: [],
    },
  ],
  
  items: [
    {
      id: 'bell-fast',
      name: '快速节拍器',
      type: 'metronome',
      fallbackChar: 'b',
      position: { x: 150, y: 200 },
      description: '60次/分钟的节拍器',
    },
    {
      id: 'bell-slow',
      name: '慢速节拍器',
      type: 'metronome',
      fallbackChar: 'b',
      position: { x: 250, y: 200 },
      description: '40次/分钟的节拍器',
    },
    {
      id: 'meat',
      name: '肉',
      type: 'food',
      fallbackChar: '%',
      position: { x: 100, y: 250 },
      description: '美味的肉块',
    },
  ],
  
  graph: {
    nodes: [
      // 感官层
      {
        id: 'stimulus-bell-fast',
        label: '听觉：快速铃声',
        type: 'stimulus',
        layer: 'sensory',
        position: { x: 100, y: 100 },
      },
      {
        id: 'stimulus-bell-slow',
        label: '听觉：慢速铃声',
        type: 'stimulus',
        layer: 'sensory',
        position: { x: 100, y: 250 },
      },
      {
        id: 'stimulus-visual-pavlov',
        label: '视觉：看到巴甫洛夫',
        type: 'stimulus',
        layer: 'sensory',
        position: { x: 100, y: 400 },
      },
      
      // 认知层
      {
        id: 'desire-food',
        label: '食欲：吃到肉',
        type: 'desire',
        layer: 'cognitive',
        position: { x: 400, y: 200 },
      },
      
      // 生物层
      {
        id: 'response-salivate',
        label: '基因：流口水',
        type: 'gene',
        layer: 'biological',
        position: { x: 700, y: 200 },
      },
    ],
    
    edges: [
      // 初始状态：食欲直接触发流口水
      {
        id: 'edge-desire-response',
        source: 'desire-food',
        target: 'response-salivate',
        type: 'excitatory',
        strength: 1,
        visualType: 'solid',
      },
      
      // 训练中：铃声与食欲的虚线连接（会逐渐变实）
      {
        id: 'edge-bell-desire',
        source: 'stimulus-bell-fast',
        target: 'desire-food',
        type: 'excitatory',
        strength: 0.1,
        visualType: 'dashed',
      },
    ],
  },
  
  tutorial: [
    {
      id: 'tut-1',
      text: '目前默认主角是巴普洛夫，一切行动的主语都是他。右键点击狗可以开始训狗。',
      step: 1,
    },
    {
      id: 'tut-2',
      text: '在命令菜单里选择"摇铃"',
      highlight: 'command-menu',
      step: 2,
    },
    {
      id: 'tut-3',
      text: '在详情面板打开的情况下，打开命令菜单，选择"喂食"',
      highlight: 'detail-panel',
      step: 3,
    },
    {
      id: 'tut-4',
      text: '看到图谱里通过虚线把铃声和吃到东西联系起来了！展示对话...',
      step: 4,
    },
    {
      id: 'tut-5',
      text: '提示用户打开图谱模式（按G或点击模式切换按钮）',
      step: 5,
    },
    {
      id: 'tut-6',
      text: '看到虚线变成实线箭头！使用Q技能触发铃声，观察信号传播。',
      highlight: 'ability-q',
      step: 6,
    },
  ],
  
  objectives: [
    '建立快速铃声与食物的条件反射',
    '观察狗对不同速度铃声的反应',
    '理解消退现象',
  ],
};
