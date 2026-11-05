# Development verification

- Build and test locally by default. Trigger GitHub Actions only when the user explicitly requests publication/release; do not dispatch CI just to check routine changes.
- Commit and push meaningful checkpoints to the current development branch promptly, especially before environment handoffs. Label unfinished or unverified checkpoints explicitly; a backup push is not a release or a claim that tests passed. Verify the remote branch after pushing.
- Preserve the development machine's existing build-cache paths. Do not relocate compilation caches into the workspace.
- Prefer the existing SSD scratch temporary directory for task tools and intermediates; do not confuse `/tmp` (small tmpfs) with SSD storage. Clean task-owned temporary files after verification. Never clear shared caches or other projects.
- Keep `docs/todo.md` limited to pending tasks. Record completed results and verification evidence in dated `docs/worklog/` files.
- Keep game rules, creative direction, animation specifications, and design decisions in `docs/design/`; link to them from tasks instead of embedding design prose in the todo list.
- Deliver Windows x64 installers as the default player artifact. Linux developer bundles do not substitute for the requested Windows installer.
- Use explicit input contracts and direct implementations. Remove speculative fallback chains, silent success paths, redundant validation, and obsolete compatibility branches.
- Preserve unrelated edits. Use React-owned rendering for the graph; do not use D3 DOM/rendering (algorithm-only libraries such as `d3-force` are allowed).
- Design the simplest coherent implementation before delegating. Replace obsolete code rather than layering compatibility wrappers or speculative defensive branches on top of it.
- Keep one focused test owner for each behavior: core rules in Rust, presentation in UI tests, and a small number of real-browser integration journeys. Remove redundant suites and repeated scenario matrices; do not grow tests merely to grow coverage counts.
- Delegate visual implementation to the Kimi K3.1 Pro role. Use DeepSeek or GPT 6.1 Terra for simple bounded tasks; reserve other workers for work that requires them.
- Use at most two cross-agent review rounds per PR. Fix concrete issues, verify the result, then merge promptly when ready. Do not trigger CI without an explicit release request.
