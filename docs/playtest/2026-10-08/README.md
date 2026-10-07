# 正式素材试玩验收

## 最新增量：真实雏鹅印刻与跟随

验收提交：`fd2890c`。[最新 CI 全部通过](https://github.com/linonetwo/intention-tower/actions/runs/37696258785)。

- [下载最新 Linux 核心＋网页试玩包](https://github.com/linonetwo/intention-tower/actions/runs/37696258785/artifacts/11515029310)：Linux、Node 22，解压后按包内 README 启动，无需编译或安装依赖。
- [下载最新浏览器截图与权威报告](https://github.com/linonetwo/intention-tower/actions/runs/37696258785/artifacts/11515547350)。

雏鹅：选择洛伦兹和雏鹅，关闭自动步进；“靠近雏鹅”后步进 1 次，
图谱出现固定印刻对象，消耗 0.2 多巴胺。“远离”后步进 1 次，再步进 12 次，
可看到真实位置追随并通关。Q 切换微操观察；先展示诱饵会固定错误对象，需要重开。
实测洛伦兹从 x=200 移至 160，雏鹅从 x=400 追至 240，累计追近 160、
8 次真实移动，最后距离 80。关键期外、资源不足、无关刺激和假命令计数不能代替印刻。

34 个前端测试、58 个 Rust 测试、21 个 BDD 场景／125 个步骤通过。
21 关现有 MCP 路线及桌面／手机视口通过；新增雏鹅学习阶段后共 104 张实际截图。
这些证据不意味着全部关卡的 Wiki 设计已经实现，尚缺的行为机制列于 todo。

以下两张截图取自首次验收 CI `37694606693`；该轮浏览器验收通过，
随后只修复了 BDD 查询完整印刻证据的方法，游戏实现未改变。

![真实印刻后的图谱与多巴胺](gosling-imprint.png)

![手机雏鹅场景](mobile-gosling.png)

## 三平台安装包：上一批试玩版本

游戏版本：0.9.0。验收提交：`75bd230`。

以下安装包不包含本次雏鹅增量；为节省 CI，本批未重复打包。

- [完整 CI 与浏览器证据](https://github.com/linonetwo/intention-tower/actions/runs/37685731500)
- [桌面安装包构建](https://github.com/linonetwo/intention-tower/actions/runs/37686641530)
- [代码审阅 PR](https://github.com/linonetwo/intention-tower/pull/2)

三平台安装包均已成功上传。在构建页面的 Artifacts 区下载对应平台：
`intention-tower-windows`、`intention-tower-macos`、`intention-tower-linux`。
macOS 包为 Apple Silicon（aarch64），Linux 包为 amd64。
这些是试玩产物，不代表已完成商店签名或公证。Artifacts 保留至 2026-10-21。

验收页面同时提供 `standalone-mcp-web-linux`：包含已编译 Linux 核心与网页，
按包内 README 启动，无需本地编译。`real-browser-mcp-evidence` 包含全部实际截图及 JSON 报告。

## 建议试玩路线

巴甫洛夫：暂停时间，选择巴甫洛夫和实验犬。每轮摇铃并步进一次，再喂食；
使用默认自动步进时，按钮已经包含一次步进，不必重复。观察心智图谱的学习记录，
等待本轮刺激结束，再重复配对。训练后单独摇铃，观察条件反应与通关。
CI 使用关闭自动步进的精确路线：摇铃后 1 步，喂食后 11 步，重复 5 轮，
最后仅摇铃后 11 步。学习联结为 0.67232；独立反应后为 0.537856。

聪明猫：展示按钮，再交替示范与真实喂食，不能只重复无奖励示范。
猫真实选择按键动作后，“按键后喂食”才可用。CI 完成 3 轮奖励训练和 3 次
动作后的奖励，在第 49 步通关；无奖励及反向配对均有负例。

## 验收结果

- 29 个前端测试、50 个 Rust 测试、16 个 Cucumber 场景／99 个步骤通过。
- 21 关通过真实 Rust MCP 路线通关。
- 21 关 × 桌面／手机共 42 组视口，另含学习阶段截图，总计 94 张实际浏览器截图。
- 浏览器无未捕获错误；94 次内置中文字库检查通过。
- 21 张背景、55 张肖像、13 份透明全身素材映射至 55 个角色。
  全身素材按角色原型复用，不是 55 套独立动画。
- React 持有 SVG 图谱与场景；`d3-force` 仅用于布局算法，不使用 D3 操作 DOM。

## 实际运行截图

![巴甫洛夫的学习图谱](pavlov-learning.png)

![手机聪明猫场景](mobile-smart-cat.png)

![手机多人场景](mobile-the-wave.png)

后续工作仅列在 `docs/todo.md`；已完成结果记录在日期工作日志。
