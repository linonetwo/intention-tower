# 意念之塔 / Intention Tower

一款以“意义之塔”心智图谱为核心的确定性模拟策略游戏。玩家通过环境刺激、条件反射、模因、群体动力和信息攻防改变角色的动机与行动，并在 21 个关卡中观察结果。

## 当前内容

- 21 个数据驱动关卡，均包含明确目标、胜负状态与可验证通关路线。
- Rust 是唯一权威世界状态；React/PixiJS 只负责输入和渲染。
- 桌面端使用 Tauri IPC，浏览器开发模式使用同一个 Rust 核心的 MCP/JSON-RPC 适配器。
- 可存档的虚拟情境栈、注意力分配、群体状态、经济账户/库存/交易、信念压制与模因涌现。
- 观察、微操、图谱三种模式；键鼠、触控、360×480 起的响应式布局。
- 图谱采用 Neo4j 风格关系网络与 Palantir 风格对象工作台；React/SVG 独占渲染和交互，仅以 `d3-force` 执行无 DOM 的布局计算。
- 中英文界面、关卡进度、暂停单步、1–4 倍速、胜负结算和浏览器/桌面存档。

设计文档位于 [`wiki/tiddlers`](wiki/tiddlers)，应用源码位于 [`intention-tower-game`](intention-tower-game)。

## 本地运行

需要 Node.js、pnpm、Rust，以及目标平台的 Tauri 系统依赖。

```bash
cd intention-tower-game
pnpm install

# 终端 1：权威 Rust 核心（浏览器开发传输）
pnpm start:mcp

# 终端 2：Web UI
pnpm dev
```

访问 `http://127.0.0.1:1420/`。桌面端使用 `pnpm tauri:dev`。

## 操作

- `F1` / `F2` / `F3`：观察 / 微操 / 图谱模式。
- 观察模式：点击角色查看，`Ctrl/Cmd + 点击` 设为操作者，`Shift + 点击` 设为目标，右键打开动态命令。
- 微操模式：`WASD` 或方向键移动；移动端显示触控方向键；`1–4` 使用前四项命令。
- `Space`：暂停/继续；非微操模式下 `0–4` 调整速度。
- `Ctrl/Cmd + S`：快速存档；双击场景恢复自适应镜头。

## 验证

仓库约定不在日常验证中执行完整打包构建；使用 `check` 与测试：

```bash
cd intention-tower-game
pnpm check
pnpm test:ui
pnpm test:assets
pnpm test:core

# 先运行 pnpm start:mcp，再由外部 MCP 客户端逐关游玩
pnpm test:mcp:levels
```

`test:mcp:levels` 会发现关卡、读取后端目标谓词、轮换合法角色目标并实际执行命令，要求全部 21 关返回 `Won`，而不是只校验 JSON 文件存在。

## 正式美术资源

运行时默认加载 `public/mods/gpt-image-2-pack/manifest.json`。该正式素材包通过已安装的 `proxy-imagegen` 技能和当前 Codex Responses 上游调用 GPT Image 2 生成，包含 21 张关卡背景与 55 张角色头像。清单记录模型、生成方式、提示词与角色/关卡映射；`pnpm test:assets` 会检查全部 76 个 PNG 的签名、尺寸、数量、映射、唯一性和文件完整性。

`public/mods/qwen-image-pack` 是早期开发素材，不参与运行时资源加载。

## 在线 CI 与试玩包

本地开发约定只运行 `check`、测试和开发服务器，不在开发机执行完整打包。GitHub Actions 的 `Verify game` 会在线执行前端检查、Rust 核心测试和 21 关 MCP 实际通关；`Build playtest artifacts` 会生成 Linux、Windows、macOS 三套 Tauri 试玩安装包，并在对应 Actions run 的 Artifacts 区保留 14 天。
