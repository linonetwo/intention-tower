// A browser MCP adapter, not a mock: gameplay forwards to the Rust core;
// UI tools operate the real Chromium page and screenshots capture its compositor.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { servePlaytest } from './serve-playtest.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
async function launchBrowser() {
  const configured = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (configured) {
    console.error(`[browser] Explicit executable: ${configured}`);
    return { browser: await chromium.launch({ headless: true, timeout: 20000, ...(configured === 'playwright-bundled' ? {} : { executablePath: configured }) }), executable: configured };
  }
  const candidates = [...new Set([
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    ...(process.env.PATH ?? '').split(delimiter).flatMap(directory => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].map(name => resolve(directory, name))),
  ])];
  for (const executable of candidates) {
    try { await access(executable, constants.X_OK); } catch { continue; }
    try {
      const browser = await chromium.launch({ executablePath: executable, headless: true, timeout: 15000 });
      console.error(`[browser] Verified system browser: ${executable}`);
      return { browser, executable };
    } catch (error) { console.error(`[browser] Cannot launch ${executable}: ${String(error)}`); }
  }
  // The official Playwright browser is a real-browser fallback, never a mock.
  console.error('[browser] No usable system Chrome; probing Playwright bundled Chromium');
  return { browser: await chromium.launch({ headless: true, timeout: 20000 }), executable: 'playwright-bundled' };
}
if (process.argv.includes('--probe-browser')) {
  try { const result = await launchBrowser(); await result.browser.close(); console.log(result.executable); }
  catch (error) { console.error(`[browser] Browser unavailable: ${String(error)}`); process.exitCode = 1; }
} else {
const core = process.env.MCP_URL ?? 'http://127.0.0.1:9222/mcp';
const { browser, executable } = await launchBrowser();
console.log(`[browser] Screenshot renderer: ${executable}`);
const web = servePlaytest();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto('http://127.0.0.1:4173/?mcp-test=1');
const uiTools = [
  ['take_screenshot', 'Real Chromium screenshot (base64 PNG)', { full_page: { type: 'boolean' } }],
  ['click', 'Click a real DOM element at an optional element-relative position', { selector: { type: 'string' }, position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } }],
  ['evaluate_script', 'Evaluate JavaScript in the live browser page', { script: { type: 'string' } }],
  ['set_viewport', 'Resize real browser viewport', { width: { type: 'integer' }, height: { type: 'integer' } }],
  ['browser_errors', 'Get uncaught browser errors', {}],
];
async function coreRpc(request) {
  const response = await fetch(core, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  if (!response.ok) throw new Error(`Rust MCP HTTP ${response.status}`);
  return response.json();
}
async function dispatch(request) {
  if (request.method === 'tools/list') {
    const result = await coreRpc(request);
    result.result.tools.push(...uiTools.map(([name, description, properties]) => ({ name, description, inputSchema: { type: 'object', properties } })));
    return result;
  }
  if (request.method !== 'tools/call') return coreRpc(request);
  const { name, arguments: args = {} } = request.params;
  let data;
  if (name === 'take_screenshot') data = { screenshot: `data:image/png;base64,${(await page.screenshot({ fullPage: args.full_page ?? false })).toString('base64')}`, source: 'chromium-compositor', url: page.url() };
  else if (name === 'click') { await page.locator(args.selector).click(args.position ? { position: args.position } : {}); data = { success: true }; }
  else if (name === 'evaluate_script') data = await page.evaluate(script => (0, eval)(script), args.script);
  else if (name === 'set_viewport') { await page.setViewportSize({ width: args.width, height: args.height }); data = { success: true }; }
  else if (name === 'browser_errors') data = errors;
  else {
    const result = await coreRpc(request);
    if (!result.error && ['tick', 'step_tick', 'execute_command', 'move_character', 'set_time_speed', 'set_paused'].includes(name)) {
      const payload = JSON.parse(result.result.content.find(item => item.type === 'text').text);
      await page.evaluate(events => window.__INTENTION_TEST__?.refresh(events), payload.events ?? []);
    }
    return result;
  }
  return { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(data ?? null) }] } };
}
const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/health') return response.end(JSON.stringify({ status: 'OK', backend: 'authoritative-rust', browser: 'chromium' }));
  if (request.url !== '/mcp' || request.method !== 'POST') { response.statusCode = 404; return response.end('{}'); }
  let rpc;
  try { let body = ''; for await (const chunk of request) body += chunk; rpc = JSON.parse(body); response.end(JSON.stringify(await dispatch(rpc))); }
  catch (error) { response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc?.id, error: { code: -32000, message: String(error) } })); }
}).listen(9233, '127.0.0.1');
console.log('Browser MCP: http://127.0.0.1:9233/mcp');
async function close() { server.close(); web.close(); await browser.close(); process.exit(0); }
process.on('SIGTERM', close);
process.on('SIGINT', close);
}
