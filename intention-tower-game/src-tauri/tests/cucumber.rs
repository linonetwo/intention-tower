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
                .expect(&format!("执行命令 {} 失败", cmd));
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
        .expect(&format!("节点 {} 无 value: {:?}", schema, node));
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
        .expect(&format!("节点 {} 无 value: {:?}", schema, node));
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
    let edge = edges.iter().find(|e| {
        e["source_instance_id"]
            .as_str()
            .is_some_and(|s| s.contains(&source))
            && e["target_instance_id"]
                .as_str()
                .is_some_and(|t| t.contains(&target))
    });
    assert!(
        edge.is_some(),
        "{} 中未找到从 {} 到 {} 的边",
        character,
        source,
        target
    );
    let weight = edge.unwrap()["weight"].as_f64().unwrap_or(0.0);
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
    let edge = edges.iter().find(|e| {
        e["source_instance_id"]
            .as_str()
            .is_some_and(|s| s.contains(&source))
            && e["target_instance_id"]
                .as_str()
                .is_some_and(|t| t.contains(&target))
    });
    // 如果边不存在，权重视为 0
    let weight = edge
        .map(|e| e["weight"].as_f64().unwrap_or(0.0))
        .unwrap_or(0.0);
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
            .expect(&format!("阈值 '{}' 不是数字", row[2]));
        let node = world
            .get_node(&character, schema)
            .await
            .expect(&format!("查询节点 {} 失败", schema));
        let value = node["value"]
            .as_f64()
            .expect(&format!("{} 的 {} 无 value: {:?}", character, schema, node));
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
