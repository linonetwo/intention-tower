use serde_json::{json, Value};

use crate::models::commands::CommandDTO;

use super::channel::TestMessage;
use super::state::TestServerState;

pub async fn call_tool(state: &TestServerState, name: &str, args: &Value) -> Result<Value, String> {
    macro_rules! str_arg {
        ($k:literal) => {
            args[$k]
                .as_str()
                .ok_or(concat!("缺少参数: ", $k))?
                .to_string()
        };
    }

    match name {
        "health" => Ok(json!({ "status": "OK" })),

        "snapshot" => {
            let world = state.world.lock().map_err(|e| e.to_string())?;
            serde_json::to_value(&*world).map_err(|e| e.to_string())
        }

        "tick" => {
            let count = args["count"].as_u64().unwrap_or(1) as usize;
            let dt = args["dt"].as_f64().unwrap_or(1.0);
            let mut world = state.world.lock().map_err(|e| e.to_string())?;
            let mut all_events = Vec::new();
            for _ in 0..count {
                let events = state.runner.tick(&mut world, dt);
                all_events.extend(events);
            }
            Ok(json!({ "tick": world.tick, "events_count": all_events.len() }))
        }

        "load_level" => {
            let level_id = str_arg!("level_id");
            let level_dir = find_level_dir(&level_id)?;
            let world_data = crate::level_loader::load_level_from_path(&level_dir)
                .map_err(|e| format!("加载关卡 '{}' 失败: {}", level_id, e))?;
            let mut world = state.world.lock().map_err(|e| e.to_string())?;
            *world = world_data;
            world.level_id = level_id.clone();
            Ok(json!({
                "success": true,
                "level_id": level_id,
                "characters": world.characters.keys().collect::<Vec<_>>(),
                "items": world.items.keys().collect::<Vec<_>>(),
                "command_count": world.command_defs.len()
            }))
        }

        "execute_command" => {
            let command_id = str_arg!("command_id");
            let actor_id = str_arg!("actor_id");
            let target_id = args["target_id"].as_str().map(String::from);
            let mut world = state.world.lock().map_err(|e| e.to_string())?;
            let cmd_def = world
                .command_defs
                .iter()
                .find(|c| c.command_id == command_id)
                .cloned()
                .ok_or_else(|| format!("命令 '{}' 未找到", command_id))?;
            world.pending_commands.push(CommandDTO {
                command_id: command_id.clone(),
                actor_id: actor_id.clone(),
                target_id: target_id.clone(),
                effects: cmd_def.effect_templates.clone(),
            });
            let events = state.runner.tick(&mut world, 0.0);
            Ok(json!({ "success": true, "events_count": events.len() }))
        }

        "list_commands" => {
            let actor_id = str_arg!("actor_id");
            let target_id = args["target_id"].as_str().map(String::from);
            let world = state.world.lock().map_err(|e| e.to_string())?;
            let available: Vec<Value> = world
                .command_defs
                .iter()
                .filter(|cmd| {
                    cmd.preconditions.iter().all(|pre| {
                        crate::api::check_precondition_pub(pre, &actor_id, target_id.as_deref(), &world)
                    })
                })
                .map(|c| json!({ "command_id": c.command_id, "label": c.label, "hotkey": c.hotkey }))
                .collect();
            Ok(json!(available))
        }

        "cancel_pending_command" => {
            let command_id = str_arg!("command_id");
            let mut world = state.world.lock().map_err(|e| e.to_string())?;
            if let Some(pos) = world.pending_commands.iter().position(|c| c.command_id == command_id) {
                world.pending_commands.remove(pos);
                Ok(json!({ "success": true, "removed": command_id }))
            } else {
                Ok(json!({ "success": false, "reason": "not_found" }))
            }
        }

        "get_node_value" => {
            let character_id = str_arg!("character_id");
            let schema_id = str_arg!("schema_id");
            let world = state.world.lock().map_err(|e| e.to_string())?;
            let character = world
                .characters
                .get(&character_id)
                .ok_or_else(|| format!("角色 '{}' 未找到", character_id))?;
            match character.mind_graph.find_by_schema(&schema_id) {
                Some(node) => Ok(json!({
                    "instance_id": node.instance_id,
                    "schema_id": node.schema_id,
                    "value": node.value,
                    "active": node.active,
                    "strength": node.strength,
                    "node_type": format!("{:?}", node.node_type),
                    "value_velocity": node.value_velocity,
                })),
                None => Ok(json!({ "found": false, "schema_id": schema_id })),
            }
        }

        "get_edges" => {
            let character_id = str_arg!("character_id");
            let world = state.world.lock().map_err(|e| e.to_string())?;
            let character = world
                .characters
                .get(&character_id)
                .ok_or_else(|| format!("角色 '{}' 未找到", character_id))?;
            let edges: Vec<Value> = character
                .mind_graph
                .edges
                .values()
                .map(|e| {
                    json!({
                        "edge_id": e.edge_id,
                        "source_instance_id": e.source_instance_id,
                        "target_instance_id": e.target_instance_id,
                        "polarity": format!("{:?}", e.polarity),
                        "weight": e.weight,
                        "learn_type": format!("{:?}", e.learn_type),
                        "learnable": e.learnable,
                    })
                })
                .collect();
            Ok(json!(edges))
        }

        "get_characters" => {
            let world = state.world.lock().map_err(|e| e.to_string())?;
            let chars: Vec<Value> = world
                .characters
                .values()
                .map(|c| {
                    json!({
                        "id": c.id,
                        "label": c.label,
                        "node_count": c.mind_graph.nodes.len(),
                        "edge_count": c.mind_graph.edges.len(),
                    })
                })
                .collect();
            Ok(json!(chars))
        }

        "get_items" => {
            let world = state.world.lock().map_err(|e| e.to_string())?;
            let items: Vec<Value> = world
                .items
                .values()
                .map(|i| json!({ "id": i.id, "schema_type": i.schema_type, "label": i.label }))
                .collect();
            Ok(json!(items))
        }

        "get_event_log" => {
            let last_n = args["last_n"].as_u64().unwrap_or(50) as usize;
            let world = state.world.lock().map_err(|e| e.to_string())?;
            let events: Vec<&crate::models::events::WorldEvent> =
                world.event_log.iter().rev().take(last_n).collect();
            serde_json::to_value(&events).map_err(|e| e.to_string())
        }

        // ---- UI tools ----
                "take_snapshot" => {
                        let limit = args["limit"].as_u64().unwrap_or(200).min(800);
                        run_webview_script(state, format!(r#"
                                (() => {{
                                    const out = [];
                                    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
                                    let n = walker.currentNode;
                                    let idx = 0;
                                    while (n && out.length < {limit}) {{
                                        const el = n;
                                        const rects = el.getClientRects();
                                        const visible = !!(rects && rects.length);
                                        if (visible || el.getAttribute('data-testid') || el.getAttribute('aria-label')) {{
                                            out.push({{
                                                uid: el.getAttribute('data-testid') || el.getAttribute('aria-label') || `${{el.tagName.toLowerCase()}}-${{idx}}`,
                                                tag: el.tagName.toLowerCase(),
                                                text: (el.textContent || '').trim().slice(0, 90),
                                                role: el.getAttribute('role'),
                                                testId: el.getAttribute('data-testid'),
                                                ariaLabel: el.getAttribute('aria-label'),
                                                visible,
                                            }});
                                        }}
                                        idx += 1;
                                        n = walker.nextNode();
                                    }}
                                    return out;
                                }})()
                        "#)).await
                }

                "take_screenshot" => {
                        let full_page = args["full_page"].as_bool().unwrap_or(false);
                        let max_width = args["max_width"].as_u64().unwrap_or(1280).clamp(320, 4096);
                        let quality = args["quality"].as_f64().unwrap_or(0.9).clamp(0.4, 1.0);
                        run_webview_script(state, format!(r#"
                                (async () => {{
                                    const ensureHtml2Canvas = async () => {{
                                        if (typeof window.html2canvas === 'function') return window.html2canvas;
                                        await new Promise((resolve, reject) => {{
                                            const script = document.createElement('script');
                                            script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                                            script.onload = () => resolve();
                                            script.onerror = () => reject(new Error('load_html2canvas_failed'));
                                            document.head.appendChild(script);
                                        }});
                                        if (typeof window.html2canvas !== 'function') throw new Error('html2canvas_not_available');
                                        return window.html2canvas;
                                    }};

                                    const h2c = await ensureHtml2Canvas();
                                    const target = {full_page} ? document.documentElement : document.body;
                                    const viewportW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
                                    const viewportH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
                                    const contentW = Math.max(viewportW, document.documentElement.scrollWidth || 0, document.body?.scrollWidth || 0);
                                    const contentH = Math.max(viewportH, document.documentElement.scrollHeight || 0, document.body?.scrollHeight || 0);

                                    const sourceW = {full_page} ? contentW : viewportW;
                                    const sourceH = {full_page} ? contentH : viewportH;
                                    const scale = Math.min(2, Math.max(0.2, {max_width} / sourceW));

                                    const canvas = await h2c(target, {{
                                        useCORS: true,
                                        backgroundColor: null,
                                        logging: false,
                                        scale,
                                        width: sourceW,
                                        height: sourceH,
                                        windowWidth: sourceW,
                                        windowHeight: sourceH,
                                    }});

                                    const mime = 'image/jpeg';
                                    const dataUrl = canvas.toDataURL(mime, {quality});
                                    return {{
                                        mime,
                                        full_page: {full_page},
                                        width: canvas.width,
                                        height: canvas.height,
                                        screenshot: dataUrl,
                                    }};
                                }})()
                        "#)).await
                }

        "evaluate_script" => run_webview_script(state, str_arg!("script")).await,

        "click_by_id" => {
            let id = str_arg!("id");
            run_webview_script(state, format!(r#"
                (() => {{
                  const q = [
                    document.querySelector(`[data-testid="{id}"]`),
                    document.querySelector(`[aria-label="{id}"]`),
                    ...Array.from(document.querySelectorAll('button,[role="button"]')).filter(e => (e.textContent||'').trim().includes('{id}'))
                  ].find(Boolean);
                  if (!q) throw new Error('元素未找到: {id}');
                  q.click();
                  return {{ success: true }};
                }})()
            "#)).await
        }

        "click" => {
            let id = args["uid"].as_str().ok_or("缺少参数: uid")?.to_string();
            run_webview_script(state, format!(r#"
                (() => {{
                  const q = [
                    document.querySelector(`[data-testid="{id}"]`),
                    document.querySelector(`[aria-label="{id}"]`),
                    ...Array.from(document.querySelectorAll('button,[role="button"]')).filter(e => (e.textContent||'').trim().includes('{id}'))
                  ].find(Boolean);
                  if (!q) throw new Error('元素未找到: {id}');
                  q.click();
                  return {{ success: true }};
                }})()
            "#)).await
        }

        "press_key" => {
            let key = str_arg!("key");
            run_webview_script(state, format!(r#"
                (() => {{
                  document.dispatchEvent(new KeyboardEvent('keydown', {{ key: '{key}', code: '{key}', bubbles: true }}));
                  return {{ success: true }};
                }})()
            "#)).await
        }

        "navigate" => {
            let url = str_arg!("url");
            run_webview_script(state, format!(r#"
                (() => {{ location.href = {url:?}; return {{ success: true, url: location.href }}; }})()
            "#)).await
        }

        "get_location" => run_webview_script(state, "location.href".to_string()).await,

        "get_title" => run_webview_script(state, "document.title".to_string()).await,

        "reload" => run_webview_script(state, "location.reload(); ({ success: true })".to_string()).await,

        "wait_for_text" => {
            let text = str_arg!("text");
            let timeout_ms = args["timeout_ms"].as_u64().unwrap_or(5000);
            run_webview_script(state, format!(r#"
                (() => {{
                  const found = (document.body?.innerText || '').includes({text:?});
                  return {{ found, text: {text:?}, timeout_ms: {timeout_ms} }};
                }})()
            "#)).await
        }

        "list_console_messages" => {
            let limit = args["limit"].as_u64().unwrap_or(50);
            run_webview_script(state, format!(r#"
                (() => (window.__MCP_CONSOLE__ || []).slice(-{limit}))()
            "#)).await
        }

        "list_network_requests" => {
            let limit = args["limit"].as_u64().unwrap_or(50);
            run_webview_script(state, format!(r#"
                (() => (window.__MCP_NETWORK__ || []).slice(-{limit}))()
            "#)).await
        }

        _ => Err(format!("未知工具: {}", name)),
    }
}

async fn run_webview_script(state: &TestServerState, script: String) -> Result<Value, String> {
    let tx = state
        .webview_tx
        .as_ref()
        .ok_or("UI 工具仅在嵌入模式可用")?;

    let callback_port = state.callback_port();
    if callback_port == 0 {
        return Err("MCP callback port 未初始化".to_string());
    }

    let eval_id = state.next_eval_id();
    let wrapped_script = wrap_script_for_callback(script, &eval_id, callback_port)?;

    let (resp_tx, resp_rx) = crossbeam_channel::bounded(1);
    tx.send(TestMessage::EvaluateScript {
        script: wrapped_script,
        response: resp_tx,
    })
    .map_err(|e| format!("发送失败: {}", e))?;

    let ack = resp_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "注入脚本超时".to_string())?;
    if ack.contains("\"error\"") {
        return Err(format!("webview eval 注入失败: {}", ack));
    }

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
    loop {
        if let Some(value) = state.take_eval_result(&eval_id) {
            if let Some(error) = value.get("error").and_then(|v| v.as_str()) {
                return Err(error.to_string());
            }
            return Ok(value.get("result").cloned().unwrap_or(Value::Null));
        }

        if std::time::Instant::now() >= deadline {
            return Err("等待 JS 执行结果超时".to_string());
        }

        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
}

fn wrap_script_for_callback(user_script: String, eval_id: &str, callback_port: u16) -> Result<String, String> {
    let user_script_json = serde_json::to_string(&user_script).map_err(|e| e.to_string())?;
    let eval_id_json = serde_json::to_string(eval_id).map_err(|e| e.to_string())?;
    Ok(format!(
        r#"
(() => {{
  if (!window.__MCP_HOOKED__) {{
    window.__MCP_HOOKED__ = true;
    window.__MCP_CONSOLE__ = [];
    window.__MCP_NETWORK__ = [];

    ['log','info','warn','error','debug'].forEach((level) => {{
      const orig = console[level].bind(console);
      console[level] = (...args) => {{
        try {{ window.__MCP_CONSOLE__.push({{ level, args: args.map(a => String(a)), ts: Date.now() }}); }} catch {{}}
        return orig(...args);
      }};
    }});

    const origFetch = window.fetch?.bind(window);
    if (origFetch) {{
      window.fetch = async (...args) => {{
        const started = Date.now();
        const url = String(args[0]);
        try {{
          const resp = await origFetch(...args);
          window.__MCP_NETWORK__.push({{ type:'fetch', url, status: resp.status, ok: resp.ok, ts: started }});
          return resp;
        }} catch (e) {{
          window.__MCP_NETWORK__.push({{ type:'fetch', url, error: String(e), ts: started }});
          throw e;
        }}
      }};
    }}

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {{ this.__mcpReq = {{ method, url, ts: Date.now() }}; return origOpen.call(this, method, url, ...rest); }};
    XMLHttpRequest.prototype.send = function(...rest) {{
      this.addEventListener('loadend', () => {{
        try {{
          const r = this.__mcpReq || {{}};
          window.__MCP_NETWORK__.push({{ type:'xhr', method: r.method, url: r.url, status: this.status, ts: r.ts || Date.now() }});
        }} catch {{}}
      }});
      return origSend.apply(this, rest);
    }};
  }}

  const __script = {user_script_json};
  const __id = {eval_id_json};
    const __callbackUrl = 'http://127.0.0.1:{callback_port}/__mcp_eval_result';
    const __sendByImg = (obj) => {{
        const raw = JSON.stringify(obj);
        const payload = encodeURIComponent(raw);
        const maxLen = 3000;
        if (payload.length <= maxLen) {{
            const img = new Image();
            img.src = `${{__callbackUrl}}?payload=${{payload}}&_=${{Date.now()}}`;
            return;
        }}
        const rawChunkSize = 900;
        const total = Math.ceil(raw.length / rawChunkSize);
        for (let part = 0; part < total; part += 1) {{
            const rawChunk = raw.slice(part * rawChunkSize, (part + 1) * rawChunkSize);
            const chunk = encodeURIComponent(rawChunk);
            const img = new Image();
            img.src = `${{__callbackUrl}}?id=${{encodeURIComponent(__id)}}&part=${{part}}&total=${{total}}&chunk=${{chunk}}&_=${{Date.now()}}-${{part}}`;
        }}
    }};

    const __send = async (obj) => {{
        const payload = JSON.stringify(obj);
        try {{
            await fetch(__callbackUrl, {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: payload,
            }});
        }} catch (_e) {{
            __sendByImg(obj);
        }}
    }};

  Promise.resolve()
    .then(() => (0, eval)(__script))
        .then((result) => __send({{ id: __id, result }}))
        .catch((error) => __send({{ id: __id, error: String(error?.message || error) }}));
}})();
"#
    ))
}

fn find_level_dir(level_id: &str) -> Result<std::path::PathBuf, String> {
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let path = std::path::PathBuf::from(&manifest_dir)
            .join("..")
            .join("assets")
            .join("levels")
            .join(level_id);
        if path.exists() {
            return Ok(path);
        }
    }
    for base in &["assets/levels", "../assets/levels"] {
        let path = std::path::PathBuf::from(base).join(level_id);
        if path.exists() {
            return Ok(path);
        }
    }
    Err(format!("关卡目录未找到: '{}'", level_id))
}
