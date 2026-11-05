import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { layeredRoute } from './layered-route.mjs';

const endpoint = process.env.BROWSER_MCP_URL ?? 'http://127.0.0.1:9233/mcp';
const output = resolve(process.env.EVIDENCE_DIR ?? 'verification-evidence/layered-world');
await mkdir(output, { recursive: true });
let sequence = 0;
const report = { backend: 'authoritative Rust MCP', screenshots: 'real Chromium compositor', routes: [], errors: [] };
async function call(name, args = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method: 'tools/call', params: { name, arguments: args } }) });
  assert.ok(response.ok, `${name}: HTTP ${response.status}`);
  const envelope = await response.json();
  if (envelope.error) throw new Error(`${name}: ${envelope.error.message}`);
  return JSON.parse(envelope.result.content.find(item => item.type === 'text').text);
}
const evaluate = script => call('evaluate_script', { script });
const snapshot = () => call('snapshot');
const click = selector => call('click', { selector });
async function until(expression, message) {
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true)}else if(++n>500){clearInterval(timer);reject(new Error(${JSON.stringify(message)}))}},50)})`);
}
async function settle() {
  const fonts = await evaluate(`(async()=>{await document.fonts.ready;const faces=await document.fonts.load('12px "Intention CJK"','中文图谱层级现实梦境');return faces.length>0&&faces.every(f=>f.status==='loaded')&&document.fonts.check('12px "Intention CJK"','中文图谱层级现实梦境')})()`);
  assert.equal(fonts, true, 'Mandatory self-hosted CJK font');
  await evaluate(`Promise.all([...document.querySelectorAll('[data-testid^="scene-background"], [data-rig-part]')].map(img=>img.decode()))`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function shot(name, capture = true) {
  await settle();
  const visual = await evaluate(`(()=>{const stage=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect(),parts=[...document.querySelectorAll('[data-testid="scene-character-rig-player"] [data-rig-part]')].map(p=>p.getBoundingClientRect());return{stageTop:stage.top,bodyTop:Math.min(...parts.map(p=>p.top)),rawLabels:[...document.querySelectorAll('button')].map(b=>b.textContent).filter(text=>/command\\.[a-z-]+\\.label/.test(text))}})()`);
  assert.ok(visual.bodyTop >= visual.stageTop - 1, `${name}: notebook must not clip the actual paper doll above scene (${visual.bodyTop} < ${visual.stageTop})`);
  assert.deepEqual(visual.rawLabels, [], `${name}: no raw untranslated command labels`);
  if (!capture) return;
  const data = await call('take_screenshot', { full_page: true });
  assert.equal(data.source, 'chromium-compositor');
  await writeFile(resolve(output, `${name}.png`), Buffer.from(data.screenshot.split(',')[1], 'base64'));
}
async function notebook(open, selector = '[data-testid="scene-layer-map"]') {
  const before = await snapshot();
  // Screenshot/command updates can resize the mobile dialogue and toolbar.
  // Establish the current toggle state, then use the actual button; never
  // manufacture React state or dismiss the terminal outcome dialog.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await evaluate(`document.querySelector('[data-testid="scene-layer-map"]').getAttribute('aria-expanded')===${JSON.stringify(String(open))}`)) break;
    await settle();
    await click(selector);
    await evaluate(`new Promise(resolve=>setTimeout(resolve,250))`);
  }
  await until(`${open ? '!!' : '!'}document.querySelector('[data-testid="layer-notebook"]')`, `Layer notebook ${open ? 'open' : 'close'} failed`);
  const after = await snapshot();
  assert.deepEqual(after.characters.player.position, before.characters.player.position, 'Opening/closing notebook cannot move the actor');
  assert.equal(after.character_rooms.player, before.character_rooms.player);
}
async function uiEvidence() {
  return evaluate(`(()=>{const rig=document.querySelector('[data-testid="scene-character-rig-player"]'), actor=document.querySelector('[data-testid="scene-character-player"]'), rail=document.querySelector('[data-testid="layer-action-rail"]');if(!rig||!actor||!rail)throw new Error('Missing persistent paper doll or action rail');const a=actor.getBoundingClientRect(),r=rail.getBoundingClientRect();return{identity:{outfit:rig.dataset.outfit,head:rig.dataset.head,parts:[...rig.querySelectorAll('[data-rig-part]')].map(p=>({part:p.dataset.rigPart,src:p.currentSrc}))},room:document.querySelector('[data-testid="scene-background"]').dataset.roomId,background:document.querySelector('[data-testid="scene-background"]').currentSrc,buttons:[...rail.querySelectorAll('button')].map(b=>({id:b.dataset.testid,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),overlap:Math.min(a.right,r.right)>Math.max(a.left,r.left)&&Math.min(a.bottom,r.bottom)>Math.max(a.top,r.top),overflow:document.documentElement.scrollWidth>innerWidth+1,markers:[...document.querySelectorAll('[data-testid^="layer-hotspot-"]')].map(e=>({id:e.dataset.testid,svg:!!e.querySelector('svg')}))}})()`);
}
try {
  assert.equal((await call('health')).status, 'OK');
  await call('open_main_menu');
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }]) {
    await call('set_viewport', { width: viewport.width, height: viewport.height });
    await evaluate(`window.__INTENTION_TEST__.loadLevel('cyber-dream')`);
    await until(`!!document.querySelector('[data-testid="scene-character-rig-player"]')&&!!document.querySelector('[data-testid="layer-action-rail"]')`, 'Cyber scene and production paper doll did not load');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.setUiMode('micro')`);
    await call('set_time_speed', { speed: 0 });
    assert.equal(await evaluate(`document.querySelector('[data-testid="scene-layer-map"]').getAttribute('aria-expanded')`), 'false', 'Level load closes notebook');
    const route = { viewport, checkpoints: [], negatives: [], realPortals: [], realHotspots: [], realCommandButtons: [] };
    report.routes.push(route);
    let identity;
    const check = async (label, world) => {
      await settle();
      const ui = await uiEvidence();
      assert.equal(ui.overflow, false, 'No horizontal page overflow');
      assert.equal(ui.overlap, false, 'Action rail must not obscure the character');
      assert.ok(ui.markers.every(m => m.svg), 'Physical hotspot code SVGs');
      for (const button of ui.buttons) assert.ok(button.width >= 44 && button.height >= 44, `${button.id}: 44px real touch targets`);
      if (identity) assert.deepEqual(ui.identity, identity, 'Same paper doll, head and outfit across all layers');
      else identity = ui.identity;
      route.checkpoints.push({ label, tick: world.tick, position: world.characters.player.position, context: world.layered_world.player.context_id, ui });
      await shot(`${viewport.name}-${label}`, false);
      if (label === 'comparison') {
        await notebook(true);
        await until(`!!document.querySelector('[data-testid="layer-notebook"]')`, 'Layer notebook absent');
        for (const context of world.scene.layered_world.contexts) assert.ok(await evaluate(`!!document.querySelector('[data-testid="layer-note-${context.id}"]')`));
        assert.ok(await evaluate(`!!document.querySelector('[data-testid="layer-comparison"]')`));
        await shot(`${viewport.name}-notebook-comparison`);
        // Reuse the real observations already collected by this journey.
        // A compact notebook may cover the scene, but must scroll and close.
        await call('set_viewport', { width: 320, height: 500 });
        await settle();
        const shortNotebook = await evaluate(`(()=>{const e=document.querySelector('[data-testid="layer-notebook"]'),r=e.getBoundingClientRect(),b=document.querySelector('[data-testid="scene-notes-close"]'),c=b.getBoundingClientRect();e.scrollTop=e.scrollHeight;return{width:r.width,height:r.height,top:r.top,bottom:r.bottom,text:e.textContent.trim(),scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflowY:getComputedStyle(e).overflowY,closeWidth:c.width,closeHeight:c.height,closeBottom:c.bottom,closeReachable:b.contains(document.elementFromPoint(c.x+c.width/2,c.y+c.height/2))}})()`);
        assert.ok(shortNotebook.width > 0 && shortNotebook.height >= 120 && shortNotebook.top >= 0 && shortNotebook.bottom <= 500 && shortNotebook.text, 'Short-phone notebook content stays inside the viewport');
        assert.equal(shortNotebook.overflowY, 'auto');
        assert.ok(shortNotebook.scrollTop > 0, 'Real collected notes scroll to their final comparison');
        assert.ok(shortNotebook.closeWidth >= 44 && shortNotebook.closeHeight >= 44 && shortNotebook.closeBottom <= 500 && shortNotebook.closeReachable, 'Notebook toggle remains a reachable touch target');
        assert.equal(await evaluate(`!!document.querySelector('[data-testid="objective-hud"]')`), false, 'Reading notes hides the competing objective panel');
        const screenshot = await call('take_screenshot', { full_page: true });
        assert.equal(screenshot.source, 'chromium-compositor');
        await writeFile(resolve(output, 'short-phone-notebook.png'), Buffer.from(screenshot.screenshot.split(',')[1], 'base64'));
        await notebook(false, '[data-testid="scene-notes-close"]');
        assert.equal(await evaluate(`!!document.querySelector('[data-testid="objective-hud"]')`), true, 'Closing notes restores level objectives');
        report.shortPhoneNotebook = { ...shortNotebook, closed: true };
        await call('set_viewport', { width: viewport.width, height: viewport.height });
      }
    };
    const walk = async destination => {
      let world = await snapshot();
      const targetRoom = world.scene.rooms.find(r => destination >= r.x_min && destination < r.x_max).id;
      if (world.character_rooms.player !== targetRoom) {
        const portal = world.scene.portals.find(p => [p.from_room, p.to_room].includes(world.character_rooms.player) && [p.from_room, p.to_room].includes(targetRoom));
        assert.ok(portal, `No legal portal from current context to ${targetRoom}`);
        const toRight = destination > world.characters.player.position.x;
        await click(`[data-testid="scene-portal-${portal.id}"]`);
        await until(`Math.abs(window.__INTENTION_TEST__.state().characters.player.position.x-${portal.x + (toRight ? 28 : -28)})<1`, `Portal ${portal.id} did not actually walk`);
        world = await snapshot();
        assert.equal(world.character_rooms.player, targetRoom);
        assert.equal(world.characters.player.position.y, 300);
        route.realPortals.push(portal.id);
      }
      const item = Object.values(world.items).find(i => i.position.x === destination);
      assert.ok(item, `Route destination ${destination} needs authored item`);
      // Marker may initially be outside a narrow camera. Walk using the real
      // movement button until its real physical hotspot becomes visible.
      for (let tries = 0; tries < 70; tries++) {
        const visible = await evaluate(`(()=>{const e=document.querySelector('[data-testid="layer-hotspot-${item.id}"] button');if(!e)return false;const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`);
        if (visible) break;
        const before = (await snapshot()).characters.player.position.x;
        await click(`[data-testid="scene-move-${destination > before ? 'right' : 'left'}"]`);
        await until(`window.__INTENTION_TEST__.state().characters.player.position.x!==${before}`, 'Movement button did not move actor');
      }
      await click(`[data-testid="layer-hotspot-${item.id}"] button`);
      await until(`Math.abs(window.__INTENTION_TEST__.state().characters.player.position.x-${destination})<1`, `Hotspot ${item.id} did not actually approach`);
      assert.equal((await snapshot()).characters.player.position.y, 300);
      route.realHotspots.push(item.id);
    };
    const available = () => call('list_commands', { actor_id: 'player' });
    const command = async command_id => {
      assert.ok((await available()).some(c => c.command_id === command_id), `Authoritative nearby availability ${command_id}`);
      // Open the notebook before the final real meal: the intentional victory
      // dialog cannot be dismissed into a frozen scene, but React must still
      // render the real receipt underneath it.
      if (command_id === 'satisfy-real-need') {
        await notebook(true);
        await shot(`${viewport.name}-notebook-before-real-meal`, false);
      }
      await click(`[data-testid="layer-action-${command_id}"]`);
      await until(`window.__INTENTION_TEST__.state().pending_commands.some(c=>c.command_id===${JSON.stringify(command_id)})`, `Real button ${command_id} did not queue`);
      const step = await call('step_tick');
      assert.ok(!(step.events ?? []).some(e => e.CommandRejected), `${command_id} rejected`);
      route.realCommandButtons.push(command_id);
    };
    const negative = async (command_id, reason) => {
      assert.equal(await evaluate(`!!document.querySelector('[data-testid="layer-action-${command_id}"]')`), false, `${reason}: hidden authoritative unavailable action`);
      const before = await snapshot();
      let rejected = false;
      try {
        const executed = await call('execute_command', { command_id, actor_id: 'player' });
        const step = await call('step_tick');
        rejected = executed.success === false || (step.events ?? []).some(e => e.CommandRejected);
      } catch (error) {
        assert.match(String(error), /前置条件未满足/, `${reason}: only an authoritative precondition rejection counts`);
        rejected = true;
      }
      assert.ok(rejected, `${reason}: authoritative negative must reject`);
      const after = await snapshot();
      assert.deepEqual(after.layered_world, before.layered_world, `${reason}: no fabricated receipt`);
      assert.equal(after.items['real-meal'].quantity, before.items['real-meal'].quantity);
      route.negatives.push({ command_id, reason, rejected });
    };
    const won = await layeredRoute({ snapshot, walk, command, available, checkpoint: check, negative });
    assert.equal(new Set(route.checkpoints.map(c => c.ui.room)).size, 6, 'All six authored rooms actually visited');
    assert.equal(new Set(route.checkpoints.map(c => c.ui.background)).size, 6, 'All six formal backgrounds distinct');
    await until(`!!document.querySelector('[data-testid="layer-notebook"]')`, 'Layer notebook absent');
    for (const context of won.scene.layered_world.contexts) assert.ok(await evaluate(`!!document.querySelector('[data-testid="layer-note-${context.id}"]')`));
    assert.ok(await evaluate(`!!document.querySelector('[data-testid="layer-comparison"]')&&!!document.querySelector('[data-testid="layer-meal-receipt"]')`));
    await shot(`${viewport.name}-notebook-complete`);
    route.final = won;
    route.passed = true;
    await evaluate(`window.__INTENTION_TEST__.loadLevel('cyber-dream')`);
    await until(`!!document.querySelector('[data-testid="scene-layer-map"]')`, 'Same-level restart scene missing');
    assert.equal(await evaluate(`document.querySelector('[data-testid="scene-layer-map"]').getAttribute('aria-expanded')`), 'false', 'Same-level restart must close notebook');
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="layer-notebook"]')`), false);
    assert.equal((await snapshot()).progress.status, 'InProgress');
    route.sameLevelRestartClosesNotebook = true;
  }
  report.errors = await call('browser_errors');
  assert.deepEqual(report.errors, [], 'No uncaught Chromium errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error); report.stack = error.stack;
  try { await shot('failure'); report.errors = await call('browser_errors'); } catch (captureError) { report.captureFailure = String(captureError); }
  process.exitCode = 1;
} finally {
  await writeFile(resolve(output, 'layered-world.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, failure: report.failure, output }));
}
