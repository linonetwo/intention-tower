# Built Rust-core browser playtest

This artifact contains an already compiled Linux Rust MCP core, built production
web UI and authored levels. It contains no node_modules or build cache.

From the extracted artifact directory, run (Node 22 and Linux required):

```sh
chmod +x intention-tower-mcp
./intention-tower-mcp
```

In another terminal in the same directory:

```sh
node scripts/serve-playtest.mjs
```

Open http://127.0.0.1:4173 in an existing browser. Select a level and play normally.
All frontend game actions call the authoritative Rust core at port 9222; no local
frontend or Rust compilation and no dependency installation is necessary.

For automated real-browser MCP screenshots, use an **already available** Playwright
installation and Chromium (the CI environment installs these only in CI):

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/browser-mcp.mjs
```

Do not start serve-playtest.mjs separately in this mode: the browser adapter serves
the same built UI itself. Browser tools and forwarded core tools share the endpoint
http://127.0.0.1:9233/mcp. `take_screenshot` returns a compositor PNG data URL;
`click`, `evaluate_script`, `set_viewport` operate the actual browser. Rust gameplay
tools are forwarded to 9222 and refresh the live React view using real snapshots.
The adapter is not a replacement simulation. Test-only UI hooks require
`?mcp-test=1` and expose normal player operations, not arbitrary world injection.

Run the same CI UI checks against this adapter:

```sh
node scripts/verify-browser-mcp.mjs
```

Evidence appears in verification-evidence/ (desktop/mobile PNGs, learning phase
screenshots and report.json). CI additionally uploads all-levels.json and core
logs. A failed UI run keeps a failure screenshot and diagnostic report; screenshots
are evidence for human aesthetic review, not a claim that aesthetics were measured.
