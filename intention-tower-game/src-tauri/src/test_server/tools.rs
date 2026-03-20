use serde_json::{json, Value};

pub fn tool_list(has_webview: bool) -> Value {
    let mut tools = vec![
        json!({ "name": "health", "description": "检查服务器状态", "inputSchema": { "type": "object" } }),
        json!({ "name": "snapshot", "description": "获取完整 WorldState", "inputSchema": { "type": "object" } }),
        json!({ "name": "tick", "description": "推进仿真", "inputSchema": {
            "type": "object", "properties": { "count": { "type": "integer" }, "dt": { "type": "number" } }
        }}),
        json!({ "name": "load_level", "description": "加载关卡", "inputSchema": {
            "type": "object", "properties": { "level_id": { "type": "string" } }, "required": ["level_id"]
        }}),
        json!({ "name": "execute_command", "description": "执行命令", "inputSchema": {
            "type": "object", "properties": {
                "command_id": { "type": "string" }, "actor_id": { "type": "string" }, "target_id": { "type": "string" }
            }, "required": ["command_id", "actor_id"]
        }}),
        json!({ "name": "list_commands", "description": "列出可用命令", "inputSchema": {
            "type": "object", "properties": { "actor_id": { "type": "string" }, "target_id": { "type": "string" } }, "required": ["actor_id"]
        }}),
        json!({ "name": "cancel_pending_command", "description": "取消排队中的命令", "inputSchema": {
            "type": "object", "properties": { "command_id": { "type": "string" } }, "required": ["command_id"]
        }}),
        json!({ "name": "get_node_value", "description": "查询节点", "inputSchema": {
            "type": "object", "properties": { "character_id": { "type": "string" }, "schema_id": { "type": "string" } },
            "required": ["character_id", "schema_id"]
        }}),
        json!({ "name": "get_edges", "description": "查询边", "inputSchema": {
            "type": "object", "properties": { "character_id": { "type": "string" } }, "required": ["character_id"]
        }}),
        json!({ "name": "get_characters", "description": "列出角色", "inputSchema": { "type": "object" } }),
        json!({ "name": "get_items", "description": "列出物品", "inputSchema": { "type": "object" } }),
        json!({ "name": "get_event_log", "description": "获取事件日志", "inputSchema": {
            "type": "object", "properties": { "last_n": { "type": "integer" } }
        }}),
    ];

    if has_webview {
        tools.extend([
            json!({ "name": "take_snapshot", "description": "获取 DOM 快照（类 CDP）", "inputSchema": {
                "type": "object", "properties": { "limit": { "type": "integer", "default": 200 } }
            } }),
            json!({ "name": "take_screenshot", "description": "获取页面截图（base64 data URL）", "inputSchema": {
                "type": "object", "properties": {
                    "full_page": { "type": "boolean", "default": false },
                    "max_width": { "type": "integer", "default": 1280 },
                    "quality": { "type": "number", "default": 0.9 }
                }
            }}),
            json!({ "name": "evaluate_script", "description": "在 webview 执行 JS，并返回真实结果", "inputSchema": {
                "type": "object", "properties": { "script": { "type": "string" } }, "required": ["script"]
            }}),
            json!({ "name": "click_by_id", "description": "按 testid/aria/text 点击元素", "inputSchema": {
                "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"]
            }}),
            json!({ "name": "press_key", "description": "模拟键盘按键", "inputSchema": {
                "type": "object", "properties": { "key": { "type": "string" } }, "required": ["key"]
            }}),
            json!({ "name": "navigate", "description": "导航到指定 URL", "inputSchema": {
                "type": "object", "properties": { "url": { "type": "string" } }, "required": ["url"]
            }}),
            json!({ "name": "get_location", "description": "获取当前页面 URL", "inputSchema": { "type": "object" } }),
            json!({ "name": "wait_for_text", "description": "等待页面出现指定文本", "inputSchema": {
                "type": "object", "properties": {
                    "text": { "type": "string" },
                    "timeout_ms": { "type": "integer", "default": 5000 }
                }, "required": ["text"]
            }}),
            json!({ "name": "list_console_messages", "description": "读取页面 console 缓冲日志", "inputSchema": {
                "type": "object", "properties": { "limit": { "type": "integer", "default": 50 } }
            }}),
            json!({ "name": "list_network_requests", "description": "读取 fetch/xhr 请求日志", "inputSchema": {
                "type": "object", "properties": { "limit": { "type": "integer", "default": 50 } }
            }}),
            json!({ "name": "reload", "description": "刷新页面", "inputSchema": { "type": "object" } }),
            json!({ "name": "get_title", "description": "获取页面标题", "inputSchema": { "type": "object" } }),
            json!({ "name": "click", "description": "Chrome 风格别名（uid -> click_by_id）", "inputSchema": {
                "type": "object", "properties": { "uid": { "type": "string" } }, "required": ["uid"]
            }}),
        ]);
    }

    json!({ "tools": tools })
}
