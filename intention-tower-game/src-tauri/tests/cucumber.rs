/// Cucumber E2E 测试主入口
///
/// 架构参考 https://github.com/linonetwo/bevy-visual-e2e-testing-ci-example
///
/// 测试通过内嵌 MCP 服务器（独立模式，无 webview）操作游戏仿真后端。
/// 每个 Scenario 启动独立的服务器实例，通过 JSON-RPC 调用后端工具。
///
/// 测试内容：实际游戏性验证（经典条件反射、操作性条件反射、印刻行为等），
/// 而非简单的关卡加载检查。
use backoff::ExponentialBackoffBuilder;
use cucumber::{gherkin::Step, given, then, when, StatsWriter, World};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

mod test_utilities;
use test_utilities::*;

async fn cat_ticks(world: &GameWorld, count: usize) {
    for _ in 0..count {
        world.mcp_call("step_tick", json!({})).await.unwrap();
    }
}
async fn cat_command(world: &GameWorld, command: &str) {
    world
        .mcp_call(
            "execute_command",
            json!({"command_id":command,"actor_id":"trainer","target_id":"cat-billi"}),
        )
        .await
        .unwrap();
}
#[when("用真实饥饿按键回合训练聪明猫并恢复完整存档")]
async fn train_real_cat_episodes(world: &mut GameWorld) {
    // Match the paused public route: commands queue, then each explicit step
    // executes one real 0.5-second tick. Unpaused commands also run a dt=0 tick,
    // which advances trial windows without advancing hunger or resource recovery.
    world
        .mcp_call("set_time_speed", json!({"speed":0}))
        .await
        .unwrap();
    for _ in 0..3 {
        cat_command(world, "demonstrate-press").await;
        cat_ticks(world, 1).await;
        cat_command(world, "feed").await;
        cat_ticks(world, 12).await;
    }
    for trial in 0..80 {
        for _ in 0..300 {
            let ready = world.mcp_call("snapshot", json!({})).await.unwrap();
            let graph = &ready["characters"]["cat-billi"]["mind_graph"];
            if graph["action_episodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|episode| episode["autonomous"] == true)
            {
                return;
            }
            if graph["nodes"]["cat-hunger"]["value"].as_f64().unwrap() >= 0.65
                && graph["nodes"]["cat-press-button"]["action"]["selected"] == false
            {
                break;
            }
            cat_ticks(world, 1).await;
        }
        let ready = world.mcp_call("snapshot", json!({})).await.unwrap();
        if ready["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|episode| episode["autonomous"] == true)
        {
            return;
        }
        let before = ready["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
            .as_array()
            .unwrap()
            .len();
        let nodes = &ready["characters"]["cat-billi"]["mind_graph"]["nodes"];
        assert!(
            nodes["cat-hunger"]["value"].as_f64().unwrap() >= 0.65
                && nodes["cat-press-button"]["action"]["selected"] == false,
            "trial {trial}: hungry response failed to reset within 300 ticks"
        );
        cat_command(world, "demonstrate-press").await;
        let mut response = Value::Null;
        for _ in 0..6 {
            cat_ticks(world, 1).await;
            response = world.mcp_call("snapshot", json!({})).await.unwrap();
            if response["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
                .as_array()
                .unwrap()
                .len()
                > before
            {
                break;
            }
        }
        assert!(
            response["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
                .as_array()
                .unwrap()
                .len()
                > before,
            "trial {trial}: no actual new motor response"
        );
        if response["progress"]["status"] == "Won" {
            return;
        }
        cat_command(world, "feed-after-press").await;
        cat_ticks(world, 1).await;
        let rewarded = world.mcp_call("snapshot", json!({})).await.unwrap();
        assert!(
            !rewarded["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
                .as_array()
                .unwrap()
                .last()
                .unwrap()["rewarded_at"]
                .is_null()
        );
        if trial == 0 {
            assert!(
                rewarded["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
                    .as_array()
                    .unwrap()
                    .last()
                    .unwrap()["reinforcement_dopamine_spent"]
                    .as_f64()
                    .unwrap()
                    > 0.0
            );
            world
                .mcp_call("restore_snapshot", json!({"world":rewarded.clone()}))
                .await
                .unwrap();
            assert_eq!(
                world.mcp_call("snapshot", json!({})).await.unwrap(),
                rewarded
            );
        }
        cat_ticks(world, 12).await;
    }
    cat_ticks(world, 300).await;
}

#[given("已加载聪明猫真实目标关卡")]
async fn load_cat_outcomes(world: &mut GameWorld) {
    world.ensure_server().await;
    world
        .mcp_call("load_level", json!({"level_id":"smart-cat"}))
        .await
        .unwrap();
    let state = world.mcp_call("snapshot", json!({})).await.unwrap();
    let objectives = state["progress"]["objectives"].as_array().unwrap();
    assert_eq!(
        objectives.len(),
        3,
        "real cat objectives must not be sandboxed away"
    );
    for id in [
        "demonstrate-button",
        "reinforce-correct-action",
        "verify-cat-action",
    ] {
        assert!(objectives
            .iter()
            .any(|objective| objective["objective_id"] == id));
    }
}

#[then("聪明猫应凭无提示自主按键回合完成关卡")]
async fn cat_autonomous_outcome(world: &mut GameWorld) {
    let state = world.mcp_call("snapshot", json!({})).await.unwrap();
    assert_eq!(
        state["progress"]["status"], "Won",
        "cat training must satisfy every objective: {}",
        state["progress"]
    );
    assert!(
        state["characters"]["cat-billi"]["mind_graph"]["action_episodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|episode| episode["autonomous"] == true
                && episode["contexts"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|context| context["schema_id"] == "it:concept/hunger"
                        && context["value"].as_f64().unwrap() >= 0.6))
    );
}

// ── Backoff 配置 ──

fn server_startup_backoff() -> backoff::ExponentialBackoff {
    ExponentialBackoffBuilder::new()
        .with_initial_interval(Duration::from_millis(100))
        .with_max_interval(Duration::from_secs(1))
        .with_max_elapsed_time(Some(Duration::from_secs(5)))
        .build()
}

// ── World ──

#[derive(Debug, World)]
#[world(init = Self::new)]
pub struct GameWorld {
    http_client: reqwest::Client,
    base_url: String,
    test_port: u16,
    server_started: bool,
    last_result: Option<Value>,
    /// 累积的事件日志（用于跨步骤检查）
    collected_events: Vec<Value>,
}

impl GameWorld {
    fn new() -> Self {
        Self {
            http_client: reqwest::Client::new(),
            base_url: String::new(),
            test_port: 0,
            server_started: false,
            last_result: None,
            collected_events: Vec::new(),
        }
    }

    /// 调用 MCP tools/call，返回解析后的工具结果 JSON
    async fn mcp_call(&self, tool: &str, args: Value) -> Result<Value, String> {
        let payload = json!({
            "jsonrpc": "2.0", "id": 1,
            "method": "tools/call",
            "params": { "name": tool, "arguments": args }
        });
        let resp: Value = self
            .http_client
            .post(format!("{}/mcp", self.base_url))
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("MCP 请求失败: {}", e))?
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;
        if let Some(err) = resp.get("error") {
            return Err(format!("MCP error: {}", err));
        }
        let text = resp["result"]["content"][0]["text"]
            .as_str()
            .unwrap_or("{}");
        serde_json::from_str(text).map_err(|e| format!("解析工具结果失败: {}", e))
    }

    /// 确保服务器已启动
    async fn ensure_server(&mut self) {
        if self.server_started {
            return;
        }
        let port = find_available_port();
        self.test_port = port;
        self.base_url = format!("http://127.0.0.1:{}", port);

        let state = Arc::new(intention_tower_game_lib::test_server::TestServerState::new());
        tokio::spawn(async move {
            intention_tower_game_lib::test_server::run_test_server(state, port).await;
        });

        let mut backoff = server_startup_backoff();
        let mut ok = false;
        while let Some(wait) = backoff::backoff::Backoff::next_backoff(&mut backoff) {
            if self
                .http_client
                .get(format!("{}/health", self.base_url))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                ok = true;
                break;
            }
            tokio::time::sleep(wait).await;
        }
        assert!(ok, "测试服务器启动超时");
        self.server_started = true;
    }

    /// 查询节点值
    async fn get_node(&self, character_id: &str, schema_id: &str) -> Result<Value, String> {
        self.mcp_call(
            "get_node_value",
            json!({
                "character_id": character_id, "schema_id": schema_id,
            }),
        )
        .await
    }

    /// 获取某角色所有边
    async fn get_edges(&self, character_id: &str) -> Result<Vec<Value>, String> {
        let result = self
            .mcp_call("get_edges", json!({ "character_id": character_id }))
            .await?;
        result
            .as_array()
            .cloned()
            .ok_or("边结果不是数组".to_string())
    }
}

// ── 步骤定义 ──

#[given(expr = "已加载关卡 {string}")]
async fn load_level(world: &mut GameWorld, level_id: String) {
    world.ensure_server().await;
    let result = world
        .mcp_call(
            "load_level",
            json!({
                "level_id": level_id,
                "sandbox": true,
            }),
        )
        .await
        .expect("加载关卡失败");
    assert_eq!(result["success"], true, "加载关卡失败: {:?}", result);
    world.last_result = Some(result);
    world.collected_events.clear();
}

#[when(expr = "推进 {int} 个 tick")]
async fn advance_ticks(world: &mut GameWorld, count: u64) {
    let result = world
        .mcp_call("tick", json!({ "count": count, "dt": 1.0 }))
        .await
        .expect("推进 tick 失败");
    world.last_result = Some(result);
}

#[when(expr = "执行命令 {string} 执行者 {string} 目标 {string}")]
async fn execute_command(world: &mut GameWorld, cmd: String, actor: String, target: String) {
    let result = world
        .mcp_call(
            "execute_command",
            json!({
                "command_id": cmd, "actor_id": actor, "target_id": target,
            }),
        )
        .await
        .expect("执行命令失败");
    assert_eq!(result["success"], true, "命令执行失败: {:?}", result);
    world.last_result = Some(result);
}

#[when(expr = "执行命令 {string} 执行者 {string}")]
async fn execute_command_no_target(world: &mut GameWorld, cmd: String, actor: String) {
    let result = world
        .mcp_call(
            "execute_command",
            json!({
                "command_id": cmd, "actor_id": actor,
            }),
        )
        .await
        .expect("执行命令失败");
    world.last_result = Some(result);
}

/// DataTable 版本：重复执行一组操作
/// 用法:
///   当 对目标 "<target>" 重复以下训练 <N> 轮:
///     | 命令      | 执行者   | tick间隔 |
///     | ring-bell | pavlov   | 3        |
///     | feed      | pavlov   | 2        |
#[when(expr = "对目标 {string} 重复以下训练 {int} 轮")]
async fn repeat_training_with_table(
    world: &mut GameWorld,
    step: &Step,
    target: String,
    rounds: u64,
) {
    let table = step.table.as_ref().expect("此步骤需要 DataTable");
    for _ in 0..rounds {
        for row in &table.rows[1..] {
            // skip header
            let cmd = &row[0];
            let actor = &row[1];
            let ticks: u64 = row[2].parse().unwrap_or(1);
            // 先执行命令
            world
                .mcp_call(
                    "execute_command",
                    json!({
                        "command_id": cmd, "actor_id": actor, "target_id": &target,
                    }),
                )
                .await
                .unwrap_or_else(|error| panic!("执行命令 {} 失败: {}", cmd, error));
            // 再推进 tick
            world
                .mcp_call("tick", json!({ "count": ticks, "dt": 1.0 }))
                .await
                .expect("推进 tick 失败");
        }
    }
}

/// 重复执行单个命令+tick
#[when(expr = "重复 {int} 次: 执行 {string} 由 {string} 对 {string} 然后推进 {int} tick")]
async fn repeat_single_command(
    world: &mut GameWorld,
    repeat: u64,
    cmd: String,
    actor: String,
    target: String,
    ticks: u64,
) {
    for _ in 0..repeat {
        world
            .mcp_call(
                "execute_command",
                json!({
                    "command_id": &cmd, "actor_id": &actor, "target_id": &target,
                }),
            )
            .await
            .expect("执行命令失败");
        world
            .mcp_call("tick", json!({ "count": ticks, "dt": 1.0 }))
            .await
            .expect("推进 tick 失败");
    }
}

/// 仅推进 tick（不执行命令），用于模拟不喂食的间隔期
#[when(expr = "不执行任何命令，仅推进 {int} 个 tick")]
async fn advance_ticks_no_action(world: &mut GameWorld, count: u64) {
    world
        .mcp_call("tick", json!({ "count": count, "dt": 1.0 }))
        .await
        .expect("推进 tick 失败");
}

// ── 断言步骤 ──

#[then(expr = "{string} 的 {string} 节点值应大于 {float}")]
async fn node_value_gt(world: &mut GameWorld, character: String, schema: String, threshold: f64) {
    let node = world
        .get_node(&character, &schema)
        .await
        .expect("查询节点失败");
    let value = node["value"]
        .as_f64()
        .unwrap_or_else(|| panic!("节点 {} 无 value: {:?}", schema, node));
    assert!(
        value > threshold,
        "{} 的 {} 值 {:.3} 应 > {}",
        character,
        schema,
        value,
        threshold
    );
}

#[then(expr = "{string} 的 {string} 节点值应小于 {float}")]
async fn node_value_lt(world: &mut GameWorld, character: String, schema: String, threshold: f64) {
    let node = world
        .get_node(&character, &schema)
        .await
        .expect("查询节点失败");
    let value = node["value"]
        .as_f64()
        .unwrap_or_else(|| panic!("节点 {} 无 value: {:?}", schema, node));
    assert!(
        value < threshold,
        "{} 的 {} 值 {:.3} 应 < {}",
        character,
        schema,
        value,
        threshold
    );
}

#[then(expr = "{string} 的 {string} 节点应存在")]
async fn node_exists(world: &mut GameWorld, character: String, schema: String) {
    let node = world
        .get_node(&character, &schema)
        .await
        .expect("查询节点失败");
    assert!(
        node.get("found") != Some(&json!(false)),
        "{} 的节点 {} 应该存在: {:?}",
        character,
        schema,
        node
    );
}

#[then(expr = "{string} 的 {string} 节点应激活")]
async fn node_active(world: &mut GameWorld, character: String, schema: String) {
    let node = world
        .get_node(&character, &schema)
        .await
        .expect("查询节点失败");
    assert_eq!(
        node["active"], true,
        "{} 的 {} 应激活: {:?}",
        character, schema, node
    );
}

#[then(expr = "{string} 的 {string} 节点应未激活")]
async fn node_inactive(world: &mut GameWorld, character: String, schema: String) {
    let node = world
        .get_node(&character, &schema)
        .await
        .expect("查询节点失败");
    assert_eq!(
        node["active"], false,
        "{} 的 {} 应未激活: {:?}",
        character, schema, node
    );
}

/// 检查两个节点之间是否存在边，且权重满足条件
#[then(expr = "{string} 中从 {string} 到 {string} 的边权重应大于 {float}")]
async fn edge_weight_gt(
    world: &mut GameWorld,
    character: String,
    source: String,
    target: String,
    threshold: f64,
) {
    let edges = world.get_edges(&character).await.expect("查询边失败");
    let matching: Vec<_> = edges
        .iter()
        .filter(|e| {
            e["source_instance_id"]
                .as_str()
                .is_some_and(|s| s.contains(&source))
                && e["target_instance_id"]
                    .as_str()
                    .is_some_and(|t| t.contains(&target))
        })
        .collect();
    assert!(
        !matching.is_empty(),
        "{} 中未找到从 {} 到 {} 的边",
        character,
        source,
        target
    );
    // Parallel learned/classical/operant links carry summed drive. Selecting
    // an arbitrary HashMap entry could hide learning behind a zero-weight
    // authored demonstration map, or hide a nonzero edge in a negative test.
    let weight: f64 = matching
        .iter()
        .map(|edge| edge["weight"].as_f64().unwrap_or(0.0))
        .sum();
    assert!(
        weight > threshold,
        "{} 中 {} → {} 边权重 {:.3} 应 > {}",
        character,
        source,
        target,
        weight,
        threshold
    );
}

#[then(expr = "{string} 中从 {string} 到 {string} 的边权重应小于 {float}")]
async fn edge_weight_lt(
    world: &mut GameWorld,
    character: String,
    source: String,
    target: String,
    threshold: f64,
) {
    let edges = world.get_edges(&character).await.expect("查询边失败");
    let matching = edges.iter().filter(|e| {
        e["source_instance_id"]
            .as_str()
            .is_some_and(|s| s.contains(&source))
            && e["target_instance_id"]
                .as_str()
                .is_some_and(|t| t.contains(&target))
    });
    // 如果边不存在，权重视为 0
    let weight: f64 = matching
        .map(|edge| edge["weight"].as_f64().unwrap_or(0.0))
        .sum();
    assert!(
        weight < threshold,
        "{} 中 {} → {} 边权重 {:.3} 应 < {}",
        character,
        source,
        target,
        weight,
        threshold
    );
}

/// 检查某角色是否至少有 N 条可学习的边
#[then(expr = "{string} 应有阶段为 {string} 的真实奖励预测误差学习事件")]
async fn learning_prediction_error_event(world: &mut GameWorld, character: String, phase: String) {
    let events = world
        .mcp_call("get_event_log", json!({ "last_n": 10000 }))
        .await
        .expect("查询学习事件失败");
    let updates: Vec<_> = events
        .as_array()
        .expect("事件结果不是数组")
        .iter()
        .filter_map(|event| event.get("LearningUpdated"))
        .filter(|event| event["character_id"] == character && event["phase"] == phase)
        .collect();
    assert!(
        !updates.is_empty(),
        "缺少 {} 的 {} RPE事件",
        character,
        phase
    );
    for event in updates {
        let reward = event["reward"].as_f64().unwrap();
        let prediction = event["prediction"].as_f64().unwrap();
        let error = event["prediction_error"].as_f64().unwrap();
        let old = event["old_weight"].as_f64().unwrap();
        let new = event["new_weight"].as_f64().unwrap();
        let cost = event["dopamine_spent"].as_f64().unwrap();
        assert!((error - (reward - prediction)).abs() < 1e-9);
        assert!(cost > 0.0 && (new - old).abs() > 0.0);
        if phase == "extinguished" {
            assert!(error < 0.0 && new < old);
        } else {
            assert!(error > 0.0 && new > old);
        }
    }
}

#[then(expr = "{string} 应至少有 {int} 条可学习边")]
async fn has_learnable_edges(world: &mut GameWorld, character: String, min_count: usize) {
    let edges = world.get_edges(&character).await.expect("查询边失败");
    let learned = edges.iter().filter(|e| e["learnable"] == true).count();
    assert!(
        learned >= min_count,
        "{} 应至少有 {} 条可学习边，实际 {}",
        character,
        min_count,
        learned
    );
}

/// 检查某角色是否有指定 learn_type 的边
#[then(expr = "{string} 应有 {string} 类型的学习边")]
async fn has_learn_type_edge(world: &mut GameWorld, character: String, learn_type: String) {
    let edges = world.get_edges(&character).await.expect("查询边失败");
    let found = edges
        .iter()
        .any(|e| e["learn_type"].as_str() == Some(learn_type.as_str()));
    assert!(found, "{} 应有 {} 类型的学习边", character, learn_type);
}

/// 检查可用命令是否包含指定命令
#[then(expr = "执行者 {string} 对目标 {string} 的可用命令应包含 {string}")]
async fn available_cmd_contains(
    world: &mut GameWorld,
    actor: String,
    target: String,
    cmd_id: String,
) {
    let cmds = world
        .mcp_call(
            "list_commands",
            json!({
                "actor_id": actor, "target_id": target,
            }),
        )
        .await
        .expect("查询命令失败");
    let cmds_array = cmds.as_array().expect("命令结果不是数组");
    let found = cmds_array.iter().any(|c| c["command_id"] == cmd_id);
    assert!(
        found,
        "可用命令应包含 {}，但只有: {:?}",
        cmd_id,
        cmds_array
            .iter()
            .map(|c| c["command_id"].as_str().unwrap_or("?"))
            .collect::<Vec<_>>()
    );
}

/// 检查可用命令中不应包含指定命令（前置条件未满足）
#[then(expr = "执行者 {string} 对目标 {string} 的可用命令不应包含 {string}")]
async fn available_cmd_not_contains(
    world: &mut GameWorld,
    actor: String,
    target: String,
    cmd_id: String,
) {
    let cmds = world
        .mcp_call(
            "list_commands",
            json!({
                "actor_id": actor, "target_id": target,
            }),
        )
        .await
        .expect("查询命令失败");
    let cmds_array = cmds.as_array().expect("命令结果不是数组");
    let found = cmds_array.iter().any(|c| c["command_id"] == cmd_id);
    assert!(!found, "可用命令不应包含 {}", cmd_id);
}

/// 检查角色和物品是否存在（DataTable 批量检查）
#[then(expr = "世界中应存在以下角色和物品")]
async fn world_has_entities(world: &mut GameWorld, step: &Step) {
    let table = step.table.as_ref().expect("此步骤需要 DataTable");
    let chars = world
        .mcp_call("get_characters", json!({}))
        .await
        .expect("查询角色失败");
    let items = world
        .mcp_call("get_items", json!({}))
        .await
        .expect("查询物品失败");
    let chars_arr = chars.as_array().unwrap();
    let items_arr = items.as_array().unwrap();

    for row in &table.rows[1..] {
        // skip header
        let entity_type = &row[0]; // "角色" 或 "物品"
        let entity_id = &row[1];
        match entity_type.as_str() {
            "角色" => {
                assert!(
                    chars_arr.iter().any(|c| c["id"] == *entity_id),
                    "角色 {} 应存在，但角色列表: {:?}",
                    entity_id,
                    chars_arr
                        .iter()
                        .map(|c| c["id"].as_str().unwrap_or("?"))
                        .collect::<Vec<_>>()
                );
            }
            "物品" => {
                assert!(
                    items_arr.iter().any(|i| i["id"] == *entity_id),
                    "物品 {} 应存在，但物品列表: {:?}",
                    entity_id,
                    items_arr
                        .iter()
                        .map(|i| i["id"].as_str().unwrap_or("?"))
                        .collect::<Vec<_>>()
                );
            }
            _ => panic!("未知实体类型: {}", entity_type),
        }
    }
}

/// 批量检查多个节点值（DataTable）
#[then(expr = "{string} 的以下节点值应满足")]
async fn check_nodes_table(world: &mut GameWorld, step: &Step, character: String) {
    let table = step.table.as_ref().expect("此步骤需要 DataTable");
    for row in &table.rows[1..] {
        // skip header: | schema_id | 条件 | 阈值 |
        let schema = &row[0];
        let condition = &row[1];
        let threshold: f64 = row[2]
            .parse()
            .unwrap_or_else(|_| panic!("阈值 '{}' 不是数字", row[2]));
        let node = world
            .get_node(&character, schema)
            .await
            .unwrap_or_else(|error| panic!("查询节点 {} 失败: {}", schema, error));
        let value = node["value"]
            .as_f64()
            .unwrap_or_else(|| panic!("{} 的 {} 无 value: {:?}", character, schema, node));
        match condition.as_str() {
            ">" => assert!(
                value > threshold,
                "{} 的 {} 值 {:.3} 应 > {}",
                character,
                schema,
                value,
                threshold
            ),
            "<" => assert!(
                value < threshold,
                "{} 的 {} 值 {:.3} 应 < {}",
                character,
                schema,
                value,
                threshold
            ),
            ">=" => assert!(
                value >= threshold,
                "{} 的 {} 值 {:.3} 应 >= {}",
                character,
                schema,
                value,
                threshold
            ),
            "<=" => assert!(
                value <= threshold,
                "{} 的 {} 值 {:.3} 应 <= {}",
                character,
                schema,
                value,
                threshold
            ),
            _ => panic!("未知条件: {}", condition),
        }
    }
}

// ── Gosling outcome contracts, through the authoritative MCP core ──

#[given(expr = "已加载雏鹅真实目标关卡")]
async fn load_gosling_outcomes(world: &mut GameWorld) {
    world.ensure_server().await;
    world
        .mcp_call("load_level", json!({"level_id":"gosling"}))
        .await
        .unwrap();
    world
        .mcp_call("set_time_speed", json!({"speed":0}))
        .await
        .unwrap();
}

#[given(expr = "雏鹅已过印刻关键期")]
async fn gosling_past_critical_period(world: &mut GameWorld) {
    let mut state = world.mcp_call("snapshot", json!({})).await.unwrap();
    state["tick"] = json!(4000);
    world
        .mcp_call("restore_snapshot", json!({"world":state}))
        .await
        .unwrap();
}

#[given(expr = "雏鹅的 {string} 资源为零且不再生")]
async fn gosling_block_resource(world: &mut GameWorld, schema: String) {
    let mut state = world.mcp_call("snapshot", json!({})).await.unwrap();
    let node = state["characters"]["gosling"]["mind_graph"]["nodes"]
        .as_object_mut()
        .unwrap()
        .values_mut()
        .find(|node| node["schema_id"] == schema)
        .unwrap();
    node["value"] = json!(0.0);
    node["value_velocity"] = json!(0.0);
    world
        .mcp_call("restore_snapshot", json!({"world":state}))
        .await
        .unwrap();
}

#[when(expr = "雏鹅仅推进 {int} 步")]
async fn gosling_steps(world: &mut GameWorld, count: usize) {
    for _ in 0..count {
        world.mcp_call("step_tick", json!({})).await.unwrap();
    }
}

#[when(expr = "雏鹅执行 {string} 后推进 {int} 步")]
async fn gosling_command_steps(world: &mut GameWorld, command: String, count: usize) {
    world
        .mcp_call(
            "execute_command",
            json!({"command_id":command,"actor_id":"lorenz","target_id":"gosling"}),
        )
        .await
        .unwrap();
    gosling_steps(world, count).await;
}

#[when(expr = "雏鹅收到与真实对象有关但不属于接触的视觉")]
async fn gosling_unrelated_visual(world: &mut GameWorld) {
    use intention_tower_game_lib::models::commands::{CommandDTO, CommandEffect};
    use intention_tower_game_lib::models::mind_node::Modality;
    let mut state = world.mcp_call("snapshot", json!({})).await.unwrap();
    state["pending_commands"] = json!([CommandDTO {
        command_id: "test-unrelated-visual".into(),
        actor_id: "lorenz".into(),
        target_id: Some("gosling".into()),
        effects: vec![CommandEffect::SpawnObservation {
            schema_id: "it:concept/see-unrelated-rock".into(),
            modality: Modality::Visual,
            about: "it:entity/lorenz".into(),
            ttl: 100,
            strength: 1.0,
            target_character_id: Some("gosling".into()),
        }],
    }]);
    world
        .mcp_call("restore_snapshot", json!({"world":state}))
        .await
        .unwrap();
    gosling_steps(world, 12).await;
}

#[when(expr = "雏鹅仅拥有旧通关命令计数")]
async fn gosling_counts_only(world: &mut GameWorld) {
    let mut state = world.mcp_call("snapshot", json!({})).await.unwrap();
    state["progress"]["command_counts"] =
        json!({"approach-gosling":3,"make-sound":2,"move-away":1});
    world
        .mcp_call("restore_snapshot", json!({"world":state}))
        .await
        .unwrap();
    gosling_steps(world, 1).await;
}

#[when(expr = "雏鹅保存恢复完整状态")]
async fn gosling_round_trip_save(world: &mut GameWorld) {
    let saved = world.mcp_call("snapshot", json!({})).await.unwrap();
    world
        .mcp_call("restore_snapshot", json!({"world":saved.clone()}))
        .await
        .unwrap();
    assert_eq!(world.mcp_call("snapshot", json!({})).await.unwrap(), saved);
}

#[then(expr = "雏鹅没有真实印刻且未通关")]
async fn gosling_no_imprint(world: &mut GameWorld) {
    let state = world.mcp_call("snapshot", json!({})).await.unwrap();
    let motivation = &state["characters"]["gosling"]["mind_graph"]["nodes"]
        ["gosling-imprint-target"]["motivation"];
    assert!(motivation["target_entity"].is_null() && motivation["imprinting_evidence"].is_null());
    assert_eq!(state["progress"]["status"], "InProgress");
}

#[then(expr = "雏鹅的固定印刻对象为 {string}")]
async fn gosling_fixed_target(world: &mut GameWorld, target: String) {
    // get_node_value is a scalar/status projection, not the full MindNode:
    // its response intentionally omits motivation and acquisition evidence.
    let state = world.mcp_call("snapshot", json!({})).await.unwrap();
    let node = &state["characters"]["gosling"]["mind_graph"]["nodes"]["gosling-imprint-target"];
    assert_eq!(node["schema_id"], "it:concept/imprint-target");
    let motivation = node
        .get("motivation")
        .filter(|motivation| motivation.is_object())
        .expect("authoritative snapshot must contain the complete imprint motivation");
    assert_eq!(motivation["target_entity"], target);
    assert_eq!(motivation["imprinting_evidence"]["target_entity"], target);
    assert!(
        (motivation["imprinting_evidence"]["dopamine_spent"]
            .as_f64()
            .unwrap()
            - 0.2)
            .abs()
            < 1e-12
    );
}

#[then(expr = "雏鹅真实移动追随洛伦兹并通关")]
async fn gosling_followed_real_target(world: &mut GameWorld) {
    let state = world.mcp_call("snapshot", json!({})).await.unwrap();
    let goose = &state["characters"]["gosling"]["position"];
    let target = &state["characters"]["lorenz"]["position"];
    let distance = ((goose["x"].as_f64().unwrap() - target["x"].as_f64().unwrap()).powi(2)
        + (goose["y"].as_f64().unwrap() - target["y"].as_f64().unwrap()).powi(2))
    .sqrt();
    assert!(
        goose["x"].as_f64().unwrap() < 400.0
            && target["x"].as_f64().unwrap() < 200.0
            && distance <= 80.0
    );
    let evidence = &state["characters"]["gosling"]["mind_graph"]["nodes"]["gosling-imprint-target"]
        ["motivation"]["imprinting_evidence"];
    assert_eq!(evidence["target_entity"], "it:entity/lorenz");
    assert!(
        evidence["followed_distance"].as_f64().unwrap() >= 80.0
            && evidence["follow_ticks"].as_u64().unwrap() >= 3
            && evidence["max_separation_distance"].as_f64().unwrap() >= 210.0
    );
    assert_eq!(state["progress"]["status"], "Won");
}

#[then(expr = "雏鹅仍未通关")]
async fn gosling_not_won(world: &mut GameWorld) {
    assert_eq!(
        world.mcp_call("snapshot", json!({})).await.unwrap()["progress"]["status"],
        "InProgress"
    );
}

// ── Main ──

#[tokio::main]
async fn main() {
    let result = GameWorld::cucumber()
        // Each scenario owns an in-process HTTP server. Serial execution keeps
        // port allocation deterministic on small CI runners.
        .max_concurrent_scenarios(1)
        .run("tests/features/")
        .await;

    if result.execution_has_failed() {
        eprintln!("\n❌ 测试失败！");
        std::process::exit(1);
    }
}
