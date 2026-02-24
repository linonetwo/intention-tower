use std::sync::Arc;

use axum::{
    extract::Query,
    extract::State as AxumState,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use super::dispatch::call_tool;
use super::protocol::{RpcRequest, RpcResponse};
use super::state::TestServerState;
use super::tools::tool_list;

type SharedState = Arc<TestServerState>;

pub async fn run_test_server(state: SharedState, port: u16) {
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/mcp", post(mcp_handler))
        .route("/__mcp_eval_result", get(eval_result_query_handler).post(eval_result_handler))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    eprintln!("[test-server] MCP: http://{}/mcp", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind test server port");
    axum::serve(listener, app)
        .await
        .expect("Test server error");
}

async fn health_handler() -> impl IntoResponse {
    Json(json!({ "status": "OK" }))
}

async fn mcp_handler(
    AxumState(state): AxumState<SharedState>,
    Json(req): Json<RpcRequest>,
) -> impl IntoResponse {
    let id = req.id.clone();
    match req.method.as_str() {
        "initialize" => Json(RpcResponse::ok(
            id,
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "intention-tower-game", "version": "0.1.0" }
            }),
        )),
        "notifications/initialized" => Json(RpcResponse::ok(id, json!({}))),
        "tools/list" => Json(RpcResponse::ok(id, tool_list(state.webview_tx.is_some()))),
        "tools/call" => {
            let params = req.params.as_ref().and_then(|v| v.as_object());
            let name = params
                .and_then(|m| m.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let args = params
                .and_then(|m| m.get("arguments"))
                .cloned()
                .unwrap_or(json!({}));

            match call_tool(&state, name, &args).await {
                Ok(data) => Json(RpcResponse::ok(
                    id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": serde_json::to_string(&data).unwrap_or_default()
                        }]
                    }),
                )),
                Err(e) => Json(RpcResponse::err(id, -32000, e)),
            }
        }
        _ => Json(RpcResponse::err(
            id,
            -32601,
            format!("Unknown method: {}", req.method),
        )),
    }
}

#[derive(Deserialize)]
struct EvalCallback {
    id: String,
    #[serde(default)]
    result: Value,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Deserialize)]
struct EvalQuery {
    payload: String,
}

async fn eval_result_handler(
    AxumState(state): AxumState<SharedState>,
    Json(payload): Json<EvalCallback>,
) -> impl IntoResponse {
    let value = if let Some(error) = payload.error {
        json!({ "error": error })
    } else {
        json!({ "result": payload.result })
    };
    state.store_eval_result(payload.id, value);
    Json(json!({ "ok": true }))
}

async fn eval_result_query_handler(
    AxumState(state): AxumState<SharedState>,
    Query(query): Query<EvalQuery>,
) -> impl IntoResponse {
    if let Ok(payload) = serde_json::from_str::<EvalCallback>(&query.payload) {
        let value = if let Some(error) = payload.error {
            json!({ "error": error })
        } else {
            json!({ "result": payload.result })
        };
        state.store_eval_result(payload.id, value);
    }
    Json(json!({ "ok": true }))
}
