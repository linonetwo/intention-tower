# 意念之塔游戏 - 实现总结

## 项目概述

后端驱动的认知科学模拟游戏 Demo。Rust/Tauri 后端是世界状态唯一权威源，运行 23 个仿真系统；React 前端是纯展示 thin client，通过 Tauri IPC 调用后端。

### 技术栈

- **后端**：Rust + Tauri 2.5，serde 序列化，确定性 tick + seeded RNG
- **前端**：React 18 + TypeScript + MUI Material v7 + Zustand v5 + d3-force
- **数据**：JSON-LD 关卡资产（21 关卡、86 文件），i18next 中英双语（800+ 条翻译）
- **构建**：Vite 6 + pnpm workspace
- **测试**：Rust 单元/集成测试 + MCP 测试服务器（端口 9222）

## 当前架构

```
App.tsx (React Router)
├── /          → LevelSelectPage（关卡选择）
├── /settings  → SettingsPage（语言设置）
└── /game      → GamePage（三栏布局）
    ├── TimeControls     ← 顶栏：返回、关卡名、Tick 计数、速度 0-4×
    ├── WorldPanel       ← 左侧 240px：Actor/Target 选择器、角色列表、物品列表
    ├── MindGraphPanel   ← 中央 flex：SVG 心智图谱 + NodeInspector 检视器
    ├── CommandPanel     ← 右侧 220px：命令按钮列表
    └── EventLog         ← 底部 160px：事件日志流
```

```
src/
├── api/tauriApi.ts          # 8 个 Tauri IPC 命令封装
├── store/useGameState.ts    # 单一 Zustand store（后端状态镜像）
├── types/backend.ts         # 镜像 Rust serde 结构的 TS 类型
├── i18n/                    # i18next 配置 + zh-CN/en UI 翻译
├── data/levels/allLevels.ts # 22 个关卡元数据（仅选择器用）
└── components/
    ├── GamePage.tsx                   # 主游戏页面 + 键盘快捷键
    ├── pages/LevelSelectPage.tsx      # 关卡选择
    ├── pages/SettingsPage.tsx         # 设置
    └── panels/
        ├── TimeControls.tsx           # 时间控制栏
        ├── WorldPanel.tsx             # 世界面板
        ├── CommandPanel.tsx           # 命令面板
        ├── EventLog.tsx               # 事件日志
        ├── MindGraphPanel.tsx         # 心智图谱面板
        └── mindgraph/
            ├── GraphSvg.tsx           # SVG 渲染（节点/边/缩放）
            └── NodeInspector.tsx      # 节点/边属性检视器
```

## 已实现系统

### 后端（Rust/Tauri）

#### 8 个 Tauri Command API
| 命令 | 功能 |
|------|------|
| `load_level` | 从 JSON-LD 加载关卡 → WorldState |
| `snapshot` | 获取完整世界状态快照 |
| `tick` | 推进仿真，返回 WorldEvent[] |
| `set_time_speed` | 设置倍速 0-4 |
| `list_commands` | 列出可用命令（自动检查前置条件） |
| `execute_command` | 执行命令，返回事件 |
| `get_mind_graph` | 获取指定角色的心智图谱 |
| `set_paused` | 暂停/恢复仿真 |

#### 23 个仿真系统（每 tick 顺序执行）
1. TimeSystem → 2. ResourceRegenSystem → 3. BodyStateSystem → 4. CommandSystem → 5. EnvironmentEventSystem → 6. PerceptionSystem → 7. NoveltyHabituationSystem → 8. AttentionAllocationSystem → 9. InstinctUpdateSystem → 10. ThresholdSystem → 11. MultiLayerPropagationSystem → 12. ClassicalConditioningSystem → 13. OperantConditioningSystem → 14. ImprintingSystem → 15. MemeInfectionSystem → 16. SocialSignalSystem → 17. BeliefConflictSystem → 18. AttentionFloodSystem → 19. ActionSelectionSystem → 20. ActionExecutionSystem → 21. MoodCascadeSystem → 22. CleanupSystem → 23. EventEmissionSystem

#### 命令系统
- 6 种前置条件：EnvHasItem / TargetHasNode / TargetNodeActive / TargetNodeValue / ActorResource / IsVirtualContext
- 14 种效果类型：SpawnObservation / ModifyNodeValue / ConsumeResource / ReinforceEdge / WeakenEdge / InjectMeme / DeleteNode / ModifyResourceRegen 等

#### MCP 测试服务器（可选 feature）
- 端口 9222，23 个 MCP 工具，支持外部 AI 代理操控游戏
- 启动：`pnpm run start:mcp`

### 前端（React）

#### 关卡选择
- 22 个关卡按分类分组（教程/先验本能/社交/动机链/虚拟与现实/地位/模因/信念/终局）
- 卡片悬停动画、目标列表

#### 游戏界面
- 三栏固定布局 + 顶底工具栏
- Actor/Target 下拉选择器
- 命令按钮列表，显示 hotkey 标签和 RequiresTarget 禁用状态
- 500ms 间隔自动 tick 循环

#### 心智图谱可视化
- d3-force 布局引擎，九宫格象限定位（3 层 × 3 象限）
- SVG 渲染：5 种节点类型着色，兴奋性/抑制性边区分，动画虚线流动
- 滚轮/pinch 缩放、fit-view 按钮
- 节点/边检视器（value、velocity、strength、active、polarity、weight 等）
- 按 NodeType 过滤器

#### 事件日志
- 14 种事件类型格式化（emoji 图标 + 彩色文字）
- 最近 500 条事件

#### 键盘快捷键
- ESC 返回菜单、Space 暂停、0-4 速度切换、命令 hotkey 绑定

#### 国际化
- i18next 双语（zh-CN/en），支持语言切换持久化

### 数据层

#### 21 个关卡（assets/levels/）
教程 3 关（巴甫洛夫/聪明猫/雏鹅）+ 先验本能 1 关 + 社交 2 关 + 动机链 1 关 + 虚拟与现实 2 关 + 地位 1 关 + 模因 3 关 + 信念 3 关 + 终局 5 关

每关含：level.jsonld + N 个 *-mind.jsonld + commands.jsonld

#### Schema 定义（assets/schema/）
5 个 JSON-LD 文件：context、node-types、edge-types、command-types、threshold-types

#### 九宫格布局（assets/quadrants/）
default-layout.jsonld：9 象限 3 层映射配置

## 设计要点

1. **后端权威**：所有游戏状态存在 Rust 后端，前端是纯视图层
2. **细粒度订阅**：Zustand selector 模式，组件只订阅必要状态
3. **类型安全**：`types/backend.ts` 完整镜像 Rust serde 结构
4. **确定性仿真**：seeded RNG + 固定 tick 顺序 = 可复现回放
5. **声明式关卡**：JSON-LD 关卡数据，支持 i18n key 国际化

## 待实现功能

### P0 — 阶段三核心（前端接入完善）
- [ ] Tick 循环暂停修复：speed=0 时停止 tick，speed>1 时传入更大 dt
- [ ] 存档管理系统：保存/加载/自动存档（后端 Tauri Command + 前端 UI）
- [ ] 动态命令菜单：右键任意对象弹出上下文命令菜单，替代固定按钮面板
- [ ] 角色详情面板：左侧标签页（属性/图谱/资源）
- [ ] 教学引导 UI：教程关卡步骤指引 + 高亮提示

### P1 — 游戏体验
- [ ] 图谱垂直"塔"形布局：底层生理在下、顶层文化在上
- [ ] 图谱迷雾：未探索节点显示为 ?
- [ ] 条件反射建立视觉反馈：共现连线动画
- [ ] 对话系统（Galgame 风格叙事推进）
- [ ] 世界空间可视化：角色/物品按 position 渲染

### P2 — 后端系统扩展（6 大设计缺口）
- [ ] VirtualContext 系统（影响 4 关：触发网瘾/赛博梦中梦/网瘾少年/幻境挣扎）
- [ ] 群体动力学系统（影响 5 关：浪潮/人从众/等死死国可乎/集群意识/毁灭虫族）
- [ ] 经济/资产系统（影响 3 关）
- [ ] 信念不可逆性 & 分裂（影响 3 关）
- [ ] 模因涌现（影响 2 关）
- [ ] 空间/战术层（影响 2 关）

### P3 — 美术与体感
- [ ] 角色立绘（日漫风格）
- [ ] 音效和音乐
- [ ] 动画系统
- [ ] 成就系统

## 使用方法

### 开发模式
```bash
cd intention-tower-game
pnpm run tauri:dev
```

### MCP 测试模式（AI 代理操控）
```bash
pnpm run start:mcp
```

### 测试流程
1. 在关卡选择页面选择任意关卡
2. 在 WorldPanel 选择 Actor 和 Target
3. 在 CommandPanel 点击命令或按 hotkey 执行
4. 在 MindGraphPanel 查看心智图谱变化
5. 在 EventLog 观察仿真事件
6. 按 Space 暂停、0-4 切换速度、ESC 返回
