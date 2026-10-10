# Development verification

- Build and test locally by default. Trigger GitHub Actions only when the user explicitly requests publication/release; do not dispatch CI just to check routine changes.
- Preserve the development machine's existing build-cache paths. Do not relocate compilation caches into the workspace.
- Create temporary task directories only under `/home/user/workspace`, and clean task-owned temporary files after verification. Never clear shared caches or other projects.
- Keep `docs/todo.md` limited to pending tasks. Record completed results and verification evidence in dated `docs/worklog/` files.
- Preserve unrelated edits. Use React-owned rendering for the graph; do not use D3 DOM/rendering (algorithm-only libraries such as `d3-force` are allowed).
