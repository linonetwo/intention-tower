#!/usr/bin/env bash
set -euo pipefail

# Tauri CLI 2.5 validates --bundles against the host, so select NSIS in config.
cd "$(dirname "$0")/.."
pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc \
  --config '{"bundle":{"targets":["nsis"]}}'
