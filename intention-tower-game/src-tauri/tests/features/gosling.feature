# language: zh-CN
功能: 雏鹅的印刻行为 — 关键期学习

  Wiki 描述: 微操模式教学关卡。
  关键期内接触对象 → 多巴胺强化 → 建立"跟随"行为。
  印刻行为一旦建立即持久保持。
  目标: 在关键期内完成印刻 → 观察跟随行为 → 测试印刻持久性。

  场景: 加载关卡并验证世界构成
    假如 已加载关卡 "gosling"
    那么 世界中应存在以下角色和物品
      | 类型 | ID                 |
      | 角色 | lorenz             |
      | 角色 | gosling            |
      | 物品 | nest               |
      | 物品 | mother-goose-decoy |
    而且 执行者 "lorenz" 对目标 "gosling" 的可用命令应包含 "approach-gosling"
    而且 执行者 "lorenz" 对目标 "gosling" 的可用命令应包含 "make-sound"

  场景: 关键期内接近雏鹅建立印刻
    假如 已加载关卡 "gosling"
    # 在关键期内反复接近+发声（都传递 target = gosling）
    当 对目标 "gosling" 重复以下训练 10 轮
      | 命令             | 执行者 | tick间隔 |
      | approach-gosling | lorenz | 2        |
      | make-sound       | lorenz | 2        |
    # 印刻系统应创建 Imprinting 类型的学习边（observation → motivation）
    那么 "gosling" 应有 "Imprinting" 类型的学习边
    # 印刻目标 motivation 节点应存在
    而且 "gosling" 的 "it:concept/imprint-target" 节点应存在

  场景: 远离雏鹅产生分离焦虑
    假如 已加载关卡 "gosling"
    # 先建立印刻
    当 重复 5 次: 执行 "approach-gosling" 由 "lorenz" 对 "gosling" 然后推进 3 tick
    # 然后远离（move-away 虽是 NoTarget，但效果需要 __target 来确定作用对象）
    当 执行命令 "move-away" 执行者 "lorenz" 目标 "gosling"
    当 推进 5 个 tick
    # 分离焦虑应增加
    那么 "gosling" 的 "it:concept/separation-distress" 节点值应大于 0.0
