# language: zh-CN
功能: 巴甫洛夫的狗 — 经典条件反射

  Wiki 描述: 教学关卡，核心机制是有时序的奖励预测误差学习。
  经常共现 → 虚线变实线（建立关联）；
  经常不共现 → 实线变虚线→消失（关联衰减）。
  目标: 摇铃+喂食训练 → 观察边强度变化 → 验证仅摇铃也能触发流口水。

  场景: 加载关卡并验证世界构成
    假如 已加载关卡 "pavlov"
    那么 世界中应存在以下角色和物品
      | 类型 | ID              |
      | 角色 | pavlov          |
      | 角色 | dog             |
      | 物品 | fast-metronome  |
      | 物品 | slow-metronome  |
      | 物品 | meat            |
    而且 执行者 "pavlov" 对目标 "dog" 的可用命令应包含 "ring-bell"
    而且 执行者 "pavlov" 对目标 "dog" 的可用命令应包含 "feed"

  场景: 饥饿本能随时间增长触发进食动机
    假如 已加载关卡 "pavlov"
    # 初始饥饿感较低 (value=0.4)
    那么 "dog" 的 "it:concept/hunger" 节点值应小于 0.5
    # 随时间推移饥饿上升（velocity=0.02，推50 tick → +1.0）
    当 推进 50 个 tick
    那么 "dog" 的 "it:concept/hunger" 节点值应大于 0.6
    # 饥饿达到阈值(0.6)后应触发进食欲望
    而且 "dog" 的 "it:concept/want-to-eat" 节点应存在

  场景: 经典条件反射训练 — 摇铃+喂食建立关联
    假如 已加载关卡 "pavlov"
    # 先让狗饿到阈值以上 (hunger > 0.6)，触发 want-to-eat 动机节点
    当 推进 20 个 tick
    那么 "dog" 的 "it:concept/want-to-eat" 节点应存在
    # 饥饿/动机本身不是奖励；必须在铃声后的资格窗口内呈现食物。
    当 执行命令 "ring-bell" 执行者 "pavlov" 目标 "dog"
    当 推进 2 个 tick
    当 执行命令 "feed" 执行者 "pavlov" 目标 "dog"
    # 等狗再次饿到阈值（feed 减了 0.4，velocity 0.02，约 20 tick 回到 0.6）
    当 推进 25 个 tick
    当 执行命令 "ring-bell" 执行者 "pavlov" 目标 "dog"
    当 推进 2 个 tick
    当 执行命令 "feed" 执行者 "pavlov" 目标 "dog"
    当 推进 25 个 tick
    当 执行命令 "ring-bell" 执行者 "pavlov" 目标 "dog"
    当 推进 2 个 tick
    # 经典条件反射系统应产生可学习边
    那么 "dog" 应至少有 1 条可学习边
    而且 "dog" 应有 "Classical" 类型的学习边
    而且 "dog" 中从 "hear-metronome" 到 "salivate" 的边权重应大于 0.3
    而且 "dog" 应有阶段为 "created" 的真实奖励预测误差学习事件
    而且 "dog" 应有阶段为 "reinforced" 的真实奖励预测误差学习事件

  场景: 仅摇铃验证条件反射 + 听觉节点生成
    假如 已加载关卡 "pavlov"
    # 先训练 10 轮
    当 对目标 "dog" 重复以下训练 10 轮
      | 命令      | 执行者 | tick间隔 |
      | ring-bell | pavlov | 1        |
      | feed      | pavlov | 30       |
    # 食物已失活，必须检查真实流口水，不只是有听觉节点
    当 执行命令 "ring-bell" 执行者 "pavlov" 目标 "dog"
    当 推进 5 个 tick
    那么 "dog" 的 "it:concept/hear-metronome" 节点应存在
    而且 "dog" 的 "it:concept/see-food" 节点应未激活
    而且 "dog" 的 "it:concept/salivate" 节点应激活

  场景: 消退 — 长期只摇铃不喂食导致关联衰减
    假如 已加载关卡 "pavlov"
    # 先建立关联
    当 对目标 "dog" 重复以下训练 8 轮
      | 命令      | 执行者 | tick间隔 |
      | ring-bell | pavlov | 1        |
      | feed      | pavlov | 30       |
    那么 "dog" 中从 "hear-metronome" 到 "salivate" 的边权重应大于 0.6
    # 每轮等待完整无奖励窗口，检查真实边权重而不是饥饿上升
    当 重复 20 次: 执行 "ring-bell" 由 "pavlov" 对 "dog" 然后推进 12 tick
    那么 "dog" 中从 "hear-metronome" 到 "salivate" 的边权重应小于 0.1
    而且 "dog" 应有阶段为 "extinguished" 的真实奖励预测误差学习事件
    当 执行命令 "ring-bell" 执行者 "pavlov" 目标 "dog"
    当 推进 3 个 tick
    那么 "dog" 的 "it:concept/salivate" 节点应未激活

  场景: 未训练仅铃声不能从饥饿中假学会流口水
    假如 已加载关卡 "pavlov"
    当 推进 100 个 tick
    当 重复 5 次: 执行 "ring-bell" 由 "pavlov" 对 "dog" 然后推进 12 tick
    那么 "dog" 中从 "hear-metronome" 到 "salivate" 的边权重应小于 0.01
    当 执行命令 "ring-bell" 执行者 "pavlov" 目标 "dog"
    当 推进 3 个 tick
    那么 "dog" 的 "it:concept/salivate" 节点应未激活

  场景: 反向配对和单独食物不能训练铃声
    假如 已加载关卡 "pavlov"
    当 对目标 "dog" 重复以下训练 5 轮
      | 命令      | 执行者 | tick间隔 |
      | feed      | pavlov | 1        |
      | ring-bell | pavlov | 12       |
    那么 "dog" 中从 "hear-metronome" 到 "salivate" 的边权重应小于 0.01

  场景: 喂食降低饥饿感
    假如 已加载关卡 "pavlov"
    # 先让狗饿起来
    当 推进 30 个 tick
    那么 "dog" 的 "it:concept/hunger" 节点值应大于 0.5
    # 喂食应降低饥饿 (delta -0.4，从 ~1.0 降到 ~0.6)
    当 执行命令 "feed" 执行者 "pavlov" 目标 "dog"
    那么 "dog" 的 "it:concept/hunger" 节点值应小于 0.8
