/**
 * 所有关卡的元数据注册表
 * 
 * 这里只定义关卡选择器所需的最小信息。
 * 完整的关卡数据（角色、心智图谱、命令等）由 Rust 后端从 JSON-LD 加载。
 * id 必须与 assets/levels/{id}/ 目录名一致。
 */

export interface LevelMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  objectives: string[];
}

export const allLevels: LevelMeta[] = [
  // ── 教程关 ──
  {
    id: 'pavlov',
    name: '巴甫洛夫的狗',
    description: '经典条件反射实验：通过反复配对铃声与食物，让狗学会仅听到铃声就流口水',
    category: '教程',
    objectives: [
      '使用「摇铃」和「喂食」命令进行条件反射训练',
      '观察「听到节拍器→想吃东西」边的强度变化',
      '验证仅摇铃即可触发流口水反应',
    ],
  },
  {
    id: 'smart-cat',
    name: '聪明猫',
    description: '操作性条件反射：训练猫学会用声音按钮表达需求',
    category: '教程',
    objectives: [
      '让猫学会按食物按钮获取食物',
      '猫能区分不同按钮',
      '猫掌握3个以上按钮',
    ],
  },
  {
    id: 'gosling',
    name: '雏鹅的印刻行为',
    description: '在关键期内建立雏鹅对特定对象的印刻跟随行为',
    category: '教程',
    objectives: [
      '在关键期结束前完成印刻',
      '观察跟随行为',
      '测试印刻持久性',
    ],
  },

  // ── 先验本能篇 ──
  {
    id: 'trigger-addiction',
    name: '触发网瘾',
    description: '通过脑机接口入侵敌人大脑，植入游戏上瘾回路，让其沉迷无法战斗',
    category: '先验本能',
    objectives: [
      '成功入侵敌人脑机接口',
      '让敌人沉迷虚拟游戏',
      '在敌人注意力被占据时摧毁其身体',
    ],
  },

  // ── 社交与归属篇 ──
  {
    id: 'the-wave',
    name: '浪潮实验',
    description: '在课堂上发起集体运动，观察群体身份认同如何压制个体思考',
    category: '社交与归属',
    objectives: [
      '所有学生接受浪潮身份',
      'Tim 的归属感得到满足',
      '独立思考被集体认同压制',
    ],
  },
  {
    id: 'crowd',
    name: '人从众',
    description: '控制广告与供给，操纵群体消费欲望',
    category: '社交与归属',
    objectives: [
      '50%以上市民产生购买欲',
      '工厂盈利目标达成',
      '完成供需链闭环',
    ],
  },

  // ── 动机链篇 ──
  {
    id: 'collapse',
    name: '崩溃',
    description: '观察"好成绩→好工作→赚钱→买房→彩礼"动机链在挫折下如何连锁崩溃',
    category: '动机链',
    objectives: [
      '观察链式崩溃过程',
      '建立内在学习动机',
      '挫折后仍维持学习行为',
    ],
  },

  // ── 虚拟与现实篇 ──
  {
    id: 'cyber-dream',
    name: '赛博梦中梦',
    description: '在多层虚拟现实中分辨哪一层是"真实"的',
    category: '虚拟与现实',
    objectives: [
      '从最深层虚拟现实逃出',
      '分辨虚拟与现实的界限',
    ],
  },
  {
    id: 'internet-addict',
    name: '网瘾少年',
    description: '帮助一个沉迷游戏的少年认识到虚拟成就的本质，重建现实意义',
    category: '虚拟与现实',
    objectives: [
      '让少年意识到虚拟成就的塔式本质',
      '削弱游戏排名的吸引力',
      '建立现实意义连接',
    ],
  },

  // ── 地位与面子篇 ──
  {
    id: 'face-saving',
    name: '死要面子活受罪',
    description: '"面子"身份认同与生存本能的直接冲突——宁死不屈还是忍辱偷生？',
    category: '地位与面子',
    objectives: [
      '观察面子与生存本能的冲突',
      '大臣做出最终选择',
      '理解身份认同 vs 本能',
    ],
  },

  // ── 模因篇 ──
  {
    id: 'meme-magic',
    name: '模因和魔法',
    description: '用模因工作台制作普通模因和魔法模因，观察不同传播机制',
    category: '模因',
    objectives: [
      '用普通模因成功感染目标',
      '用魔法模因绕过多巴胺限制',
      '触发魔法行动效果',
    ],
  },
  {
    id: 'antimeme-division',
    name: '逆模因部',
    description: '在逆模因场中探索——离开区域后记忆快速消失',
    category: '模因',
    objectives: [
      '在逆模因场中找到目标地点',
      '克服记忆衰减到达目的地',
      '理解逆模因机制',
    ],
  },
  {
    id: 'consumerism-magic',
    name: '消费主义魔法',
    description: '在魔法社会中用魔法广告植入购物欲望',
    category: '模因',
    objectives: [
      '大部分市民产生购买欲',
      '建立品牌忠诚度',
      '达成利润目标',
    ],
  },

  // ── 信念篇 ──
  {
    id: 'ideology',
    name: '信仰与意识形态',
    description: '顶层文化模因驱动极端行为——信念维护与决策冲突',
    category: '信念',
    objectives: [
      '信徒的信念压制生存本能',
      '怀疑者也接受意识形态',
      '或反过来——解放信徒',
    ],
  },
  {
    id: 'chen-sheng-uprising',
    name: '等死死国可乎',
    description: '秦末陈胜吴广起义——"横竖都是死"绝境下的生存博弈',
    category: '信念',
    objectives: [
      '说服多数戍卒起义',
      '克服死亡恐惧',
      '发动起义',
    ],
  },
  {
    id: 'water-is-poison',
    name: '水是有毒的',
    description: '思想钢印植入"水是剧毒的"信念——即使理性知道水无害也无法喝水',
    category: '信念',
    objectives: [
      '成功植入思想钢印',
      '观察信念如何压制生存本能',
      '理解 BeliefWins 机制的不可逆性',
    ],
  },

  // ── 终局篇 ──
  {
    id: 'destroy-hive-mind',
    name: '毁灭虫族主脑',
    description: '多阶段战役：对抗卢德派修真者，突破虫族防线，摧毁主脑',
    category: '终局',
    objectives: [
      '守住微波站',
      '抵达聚变电站',
      '入侵虫族主脑',
      '摧毁主脑',
    ],
  },
  {
    id: 'cthulhu',
    name: '克苏鲁神话',
    description: '阅读禁书会导致注意力洪流——不可名状知识占满大脑使人疯狂',
    category: '终局',
    objectives: [
      '观察注意力洪流机制',
      '在获取信息的同时存活',
      '帮助受害者恢复',
    ],
  },
  {
    id: 'hive-self',
    name: '集群意识',
    description: '多个自我复制体共享协作协议，但资源匮乏时协议崩溃',
    category: '终局',
    objectives: [
      '观察资源匮乏时协作协议崩溃',
      '至少一个复制体选择背叛',
      '或维持协作直到资源恢复',
    ],
  },
  {
    id: 'illusion-trap',
    name: '幻境挣扎',
    description: '被幻术打中后陷入美好幻境——需要在虚假世界中挣扎回到现实',
    category: '终局',
    objectives: [
      '让受术者意识到身处幻境',
      '克服幻境美好感选择挣脱',
      '在健康降至零之前回到现实',
    ],
  },
  {
    id: 'postmodern-vagrant',
    name: '后现代解构流浪',
    description: '解构一切宏大叙事后走向虚无——在流浪者群体中重建朴素共产主义意义',
    category: '终局',
    objectives: [
      '成功解构至少3个宏大叙事',
      '经历饥饿绝境',
      '在流浪者群体中重建意义',
    ],
  },
];
