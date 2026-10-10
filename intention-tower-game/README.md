# Intention Tower Game

应用实现说明、运行命令与测试流程见仓库根目录的 [`README.md`](../README.md)。

本目录的关键边界：

- `src-tauri/src/`：权威 Rust 仿真、关卡规则、存档、Tauri API 与独立 MCP 服务。
- `assets/levels/`：21 个 JSON-LD 关卡及命令定义。
- `src/`：React/PixiJS 响应式视图层。
- `scripts/verify-all-levels-mcp.mjs`：外部协议级全关卡游玩验证。
- `public/mods/gpt-image-2-pack/`：正式 GPT Image 2 背景、头像与可审计资源清单。
- `scripts/verify-production-assets.mjs`：正式素材数量、尺寸、映射与唯一性门禁。
