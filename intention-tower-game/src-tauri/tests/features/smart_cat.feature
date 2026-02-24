# language: zh-CN
功能: 聪明猫 — 操作性条件反射

  Wiki 描述: 训练猫用按键"说话"。
  先将按键与食物奖励关联 → 猫学会按键获取食物 → 引导猫在饥饿时才按键。
  目标: 操作性条件反射→猫按按钮获取食物→按钮行动强度增长。

  场景: 加载关卡并验证角色和命令
    假如 已加载关卡 "smart-cat"
    那么 世界中应存在以下角色和物品
      | 类型 | ID          |
      | 角色 | trainer     |
      | 角色 | cat-billi   |
      | 物品 | button-food |
      | 物品 | cat-food    |
    而且 执行者 "trainer" 对目标 "cat-billi" 的可用命令应包含 "demonstrate-press"
    而且 执行者 "trainer" 对目标 "cat-billi" 的可用命令应包含 "feed"
    # feed-after-press 需要前置: 猫正在按按钮（TargetNodeActive），初始不满足
    而且 执行者 "trainer" 对目标 "cat-billi" 的可用命令不应包含 "feed-after-press"

  场景: 示范按键训练猫建立按键→食物关联
    假如 已加载关卡 "smart-cat"
    # 初始: 猫的 press-button 行动强度很低 (strength=0.1, value≈0)
    那么 "cat-billi" 的 "it:concept/press-button" 节点值应小于 0.5
    # 进行 10 轮"示范→喂食"训练
    当 对目标 "cat-billi" 重复以下训练 10 轮
      | 命令              | 执行者  | tick间隔 |
      | demonstrate-press | trainer | 1        |
      | feed              | trainer | 3        |
    # 训练后猫应建立可学习边
    那么 "cat-billi" 应至少有 1 条可学习边

  场景: 猫的饥饿驱动进食
    假如 已加载关卡 "smart-cat"
    那么 "cat-billi" 的 "it:concept/hunger" 节点应存在
    # 让猫饿起来
    当 推进 50 个 tick
    那么 "cat-billi" 的 "it:concept/hunger" 节点值应大于 0.5
    # 喂食降低饥饿 (delta -0.3，从 ~1.0 降到 ~0.7)
    当 执行命令 "feed" 执行者 "trainer" 目标 "cat-billi"
    那么 "cat-billi" 的 "it:concept/hunger" 节点值应小于 0.8
