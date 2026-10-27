import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = process.env.BROWSER_MCP_URL ?? 'http://127.0.0.1:9233/mcp';
const output = resolve(process.env.EVIDENCE_DIR ?? 'verification-evidence');
await mkdir(output, { recursive: true });
const actor = 'antimeme-agent';
const dictionaries = await Promise.all(['zh-CN-ui', 'en-ui'].map(async locale => JSON.parse(await readFile(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8'))));
const report = { started: new Date().toISOString(), source: 'real Chromium compositor / authoritative Rust', viewports: [], errors: [] };
let sequence = 0;
async function call(name, args = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method: 'tools/call', params: { name, arguments: args } }) });
  const rpc = await response.json();
  if (rpc.error) throw Error(`${name}: ${rpc.error.message}`);
  return JSON.parse(rpc.result.content.find(item => item.type === 'text').text);
}
const evaluate = script => call('evaluate_script', { script });
const snapshot = () => call('snapshot');
const memory = world => world.room_memory[actor].rooms.archive;
const about = world => world.characters[actor].mind_graph.nodes['agent-memory-of-location']?.observation?.about;
async function waitFor(expression, label) {
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true)}else if(++n>400){clearInterval(timer);reject(new Error(${JSON.stringify(label)}))}},25)})`);
}
async function settle() {
  await evaluate(`(async()=>{await document.fonts.ready;const faces=await document.fonts.load('12px "Intention CJK"','逆模因记忆档案药物');if(!faces.length||faces.some(face=>face.status!=='loaded'))throw Error('CJK font not loaded');await Promise.all([...document.querySelectorAll('[data-testid^="scene-background"], [data-rig-part], [data-testid^="scene-character-sprite-"]')].map(img=>img.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`);
}
async function shot(name) {
  await settle();
  const result = await call('take_screenshot');
  assert.equal(result.source, 'chromium-compositor');
  await writeFile(resolve(output, `${name}.png`), Buffer.from(result.screenshot.split(',')[1], 'base64'));
}
async function closeNotebook() {
  if (await evaluate(`!!document.querySelector('[data-testid="experiment-menu-close"]')?.getClientRects().length`)) await call('click', { selector: '[data-testid="experiment-menu-close"]' });
  await waitFor(`!document.querySelector('[data-testid="experiment-menu"]')`, 'Notebook close');
}
async function mode(value) {
  await closeNotebook();
  await call('click', { selector: '[data-testid="experiment-menu-open"]' });
  await call('click', { selector: `[data-testid="experiment-menu"] [data-testid="mode-${value}"]` });
  // Mode selection already closes the notebook. Wait for its exit transition;
  // clicking the outgoing close button races MUI unmounting and is not gameplay.
  await waitFor(`!document.querySelector('[data-testid="experiment-menu"]')`, 'Mode selection closes notebook');
}
async function load() {
  await closeNotebook();
  await evaluate(`window.__INTENTION_TEST__.loadLevel('antimeme-division')`);
  await waitFor(`document.querySelector('[data-testid="scene-character-${actor}"]')`, 'Agent scene load');
  // Disable UI auto-advance, not simulation mechanics or backend pause state.
  await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
  await mode('micro');
  await settle();
  await call('click', { selector: `[data-testid="scene-character-${actor}"]` });
  assert.equal(await evaluate(`window.__itSceneDebug().actorId`), actor);
}
async function control(testId, mobile) {
  const result = await evaluate(`(()=>{const el=document.querySelector('[data-testid="${testId}"]');if(!el)return null;const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{testId:el.dataset.testid,enabled:!el.disabled,width:r.width,height:r.height,visible:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,hit:!!hit&&(el===hit||el.contains(hit))}})()`);
  assert.ok(result?.enabled && result.visible && result.hit, `${testId}: visible enabled real pointer target`);
  if (mobile) assert.ok(result.width >= 44 && result.height >= 44, `${testId}: 44px mobile operation (${result.width}×${result.height})`);
  return result;
}
async function step(count) {
  for (let i = 0; i < count; i++) {
    const result = await call('step_tick');
    for (const event of result.events ?? []) {
      const memoryEvent = event.RoomMemoryChanged;
      if (!memoryEvent) continue;
      if (memoryEvent.room_id) assert.equal(typeof memoryEvent.variant_id, 'string', 'Memory event captures its historical perceived identity');
      assert.equal(typeof memoryEvent.drug_ticks_remaining, 'number', 'Memory event captures historical remaining drug window');
    }
  }
}
async function portal(destination, mobile) {
  await mode('micro');
  await control('scene-portal-reception_archive', mobile);
  const before = await snapshot();
  await call('click', { selector: '[data-testid="scene-portal-reception_archive"]' });
  const expectedX = destination === 'archive' ? 828 : 772;
  await waitFor(`window.__INTENTION_TEST__.state().character_rooms[${JSON.stringify(actor)}]===${JSON.stringify(destination)}&&Math.abs(window.__INTENTION_TEST__.state().characters[${JSON.stringify(actor)}].position.x-${expectedX})<.01`, `Real portal walk to ${destination}`);
  const after = await snapshot();
  assert.equal(after.characters[actor].position.y, 300);
  assert.equal(after.tick, before.tick, 'Walking alone never advances learning ticks');
  const variant = memory(after).variant_id;
  const expectedNames = dictionaries.map(dictionary => dictionary[`memory.variant.${variant}`]);
  const feedback = await evaluate(`[...document.querySelectorAll('[data-testid^="dialogue-event-"]')].map(el=>el.textContent).find(line=>line.startsWith('📖'))`);
  assert.ok(expectedNames.some(name => feedback?.includes(name)), `${destination}: real portal movement immediately publishes its entered/left memory feedback without a tick`);
  return after;
}
async function command(commandId, mobile, accepted = true) {
  await mode('observe');
  if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) await call('click', { selector: '[data-testid="dialogue-toggle"]' });
  const selector = `[data-testid="command-${commandId}"]`;
  const present = await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
  if (!present && !accepted) return { rejectedByAvailability: true };
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
  await control(`command-${commandId}`, mobile);
  const before = await snapshot();
  await call('click', { selector });
  await waitFor(`window.__INTENTION_TEST__.state().pending_commands.some(c=>c.command_id===${JSON.stringify(commandId)})`, `Actual ${commandId} button queues command`);
  await step(1);
  const after = await snapshot();
  assert.equal((after.progress.command_counts[commandId] ?? 0) - (before.progress.command_counts[commandId] ?? 0), accepted ? 1 : 0, `${commandId}: actual execution result`);
  return after;
}
async function presentation() {
  await settle();
  return evaluate(`(()=>{const img=document.querySelector('img[data-room-id="archive"]'),fog=document.querySelector('[data-testid="scene-memory-fog-archive"]');return{phase:img?.dataset.memoryPhase??fog?.dataset.memoryPhase,src:img?.currentSrc??null,filter:img?getComputedStyle(img).filter:null,opacity:img?Number(getComputedStyle(img).opacity):null,fog:!!fog,backgroundCount:document.querySelectorAll('img[data-room-id="archive"]').length}})()`);
}
async function capture(run, label) {
  const world = await snapshot(), view = await presentation();
  const phase = memory(world)?.phase ?? 'unvisited';
  const key = phase === 'unvisited' || phase === 'forgotten' ? `memory.phase.${phase}` : `memory.variant.${memory(world).variant_id}`;
  const labels = dictionaries.map(dictionary => dictionary[key]);
  const actorRoom = world.character_rooms[actor];
  const title = await evaluate(`document.querySelector('[data-testid="scene-room-title"]').textContent`);
  if (actorRoom === 'archive') assert.ok(labels.includes(title), `${label}: scene title describes actual perceived identity`);
  let portalLabel;
  if (actorRoom === 'reception') {
    portalLabel = await evaluate(`document.querySelector('[data-testid="scene-portal-reception_archive"]').getAttribute('aria-label')`);
    const portalLabels = phase === 'unvisited' || phase === 'forgotten' ? dictionaries.map(dictionary => dictionary['memory.unknownExit']) : labels;
    assert.ok(portalLabels.some(text => portalLabel.includes(text)), `${label}: portal names perceived destination (or unknown fog), not static room identity`);
  }
  let notebookLabel;
  // The real victory modal intentionally prevents further scene interaction.
  // Check every interactive phase, retaining the victory overlay in its artifact.
  if (world.progress.status !== 'Won') {
    await call('click', { selector: '[data-testid="scene-memory-map"]' });
    await waitFor(`document.querySelector('[data-testid="room-memory-notes"]')`, 'Memory map opens');
    notebookLabel = await evaluate(`document.querySelector('[data-testid="memory-map-room-archive"]').textContent`);
    assert.ok(labels.some(text => notebookLabel.includes(text)), `${label}: map names actual perceived room identity`);
    await call('click', { selector: '[data-testid="scene-memory-map"]' });
    await waitFor(`!document.querySelector('[data-testid="room-memory-notes"]')`, 'Memory map closes');
  }
  const eventLines = await evaluate(`[...document.querySelectorAll('[data-testid^="dialogue-event-"]')].map(el=>el.textContent)`);
  const eventText = eventLines.find(line => line.startsWith('📖'));
  // Real movements must publish authoritative event-log deltas immediately;
  // tick aging and command feedback arrive through the actual tick RPC.
  // Rejections intentionally have HUD priority above the newest memory message.
  if (['observed', 'remembered', 'fading', 'forgotten', 'new-variant', 'witness-recall', 'anchored', 'anchored-away-six-ticks', 'drug-only-observed', 'drug-only-forgotten'].includes(label)) {
    const variants = dictionaries.map(dictionary => dictionary[`memory.variant.${memory(world).variant_id}`]);
    assert.ok(variants.some(text => eventText?.includes(text)), `${label}: newest memory feedback names actual historical variant`);
  }
  const evidence = { label, tick: world.tick, status: world.progress.status, entry: memory(world), about: about(world), view, identity: { title, portalLabel, notebookLabel, eventText } };
  run.stages.push(evidence);
  await shot(`${run.viewport.name}-room-memory-${label}`);
  return { world, view, entry: memory(world) };
}

async function verifyThirdRoom(run) {
  await load();
  await portal('archive', true);
  const initialArchive = structuredClone(memory(await snapshot()));
  // Approach the second seam with actual mobile movement controls. Never inject
  // positions or use an offscreen world coordinate as a pointer target.
  while ((await snapshot()).characters[actor].position.x < 1556) {
    const x = (await snapshot()).characters[actor].position.x;
    await control('scene-move-right', true);
    await call('click', { selector: '[data-testid="scene-move-right"]' });
    await waitFor(`Math.abs(window.__INTENTION_TEST__.state().characters[${JSON.stringify(actor)}].position.x-${x + 28})<.01`, 'Real second-room approach');
  }
  const camera = async () => {
    await evaluate(`new Promise(resolve=>setTimeout(resolve,180))`);
    return evaluate(`(()=>{const d=window.__itSceneDebug(),w=window.__INTENTION_TEST__.state();return{x:w.characters[${JSON.stringify(actor)}].position.x,cameraX:d.cameraX,scale:d.scale}})()`);
  };
  const cross = async destination => {
    const before = await snapshot(), beforeCamera = await camera();
    const target = await control('scene-portal-archive_conservatory', true);
    await call('click', { selector: '[data-testid="scene-portal-archive_conservatory"]' });
    const x = destination === 'conservatory' ? 1628 : 1572;
    await waitFor(`window.__INTENTION_TEST__.state().character_rooms[${JSON.stringify(actor)}]===${JSON.stringify(destination)}&&Math.abs(window.__INTENTION_TEST__.state().characters[${JSON.stringify(actor)}].position.x-${x})<.01`, `Second portal ${destination}`);
    const after = await snapshot(), afterCamera = await camera();
    assert.equal(after.characters[actor].position.y, 300);
    assert.equal(after.tick, before.tick);
    assert.deepEqual(after.progress, before.progress);
    assert.deepEqual(Object.keys(after.characters).sort(), Object.keys(before.characters).sort());
    assert.equal(afterCamera.scale, beforeCamera.scale);
    assert.ok(Math.abs(afterCamera.cameraX-beforeCamera.cameraX) <= Math.abs(afterCamera.x-beforeCamera.x)*beforeCamera.scale+1, 'Second seam camera follows travel without room-width jump');
    const variant = after.room_memory[actor].rooms[destination].variant_id;
    const labels = dictionaries.map(dictionary => dictionary[`memory.variant.${variant}`]);
    const feedback = await evaluate(`[...document.querySelectorAll('[data-testid^="dialogue-event-"]')].map(el=>el.textContent).find(line=>line.startsWith('📖'))`);
    assert.ok(labels.some(name => feedback?.includes(name)), 'Second portal immediately publishes its perceived destination feedback');
    await shot(`mobile-room-memory-second-seam-${destination}-${after.room_memory[actor].rooms[destination].generation}`);
    return { beforeCamera, afterCamera, target, feedback, world: after };
  };
  const entered = await cross('conservatory');
  const initialConservatory = structuredClone(entered.world.room_memory[actor].rooms.conservatory);
  assert.equal(initialConservatory.phase, 'visible');
  assert.equal(memory(entered.world).phase, 'remembered');
  await step(6);
  let world = await snapshot();
  assert.equal(memory(world).phase, 'forgotten');
  assert.equal(world.room_memory[actor].rooms.conservatory.phase, 'visible');
  assert.equal(world.room_memory[actor].rooms.conservatory.generation, initialConservatory.generation);
  await shot('mobile-room-memory-conservatory-visible-archive-forgotten');
  const returned = await cross('archive');
  assert.notEqual(memory(returned.world).variant_id, initialArchive.variant_id);
  assert.equal(memory(returned.world).forgotten_revisits.length, 1);
  assert.equal(returned.world.room_memory[actor].rooms.conservatory.phase, 'remembered');
  await step(6);
  world = await snapshot();
  assert.equal(memory(world).phase, 'visible');
  assert.equal(world.room_memory[actor].rooms.conservatory.phase, 'forgotten');
  assert.equal(memory(world).generation, memory(returned.world).generation);
  await shot('mobile-room-memory-archive-visible-conservatory-forgotten');
  const revisited = await cross('conservatory');
  assert.notEqual(revisited.world.room_memory[actor].rooms.conservatory.variant_id, initialConservatory.variant_id);
  assert.equal(revisited.world.room_memory[actor].rooms.conservatory.forgotten_revisits.length, 1);
  assert.equal(memory(revisited.world).generation, memory(returned.world).generation);
  run.thirdRoom = { entered, returned, revisited, independentMemory: true, passed: true };
}

try {
  await call('health');
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const run = { viewport, stages: [] };
    report.viewports.push(run);
    const mobile = viewport.name === 'mobile';
    try {
      await call('set_viewport', { width: viewport.width, height: viewport.height });
      await load();
      const initial = await capture(run, 'unvisited');
      assert.equal(initial.entry, undefined);
      assert.equal(initial.view.backgroundCount, 0);
      await portal('archive', mobile);
      const observed = await capture(run, 'observed');
      assert.equal(observed.entry.phase, 'visible');
      assert.ok(observed.view.src && about(observed.world));
      await command('remember-this-place', mobile, false);
      assert.equal(memory(await snapshot()).anchored_at_tick, null, 'Drugless remember never anchors');
      await capture(run, 'drugless-cannot-anchor');
      await portal('reception', mobile);
      await step(2);
      const remembered = await capture(run, 'remembered');
      assert.equal(remembered.entry.phase, 'remembered');
      assert.equal(remembered.view.filter, 'none', 'Still-remembered room keeps its full colors until fade threshold');
      assert.equal(remembered.view.opacity, 1);
      await step(1);
      const fading = await capture(run, 'fading');
      assert.equal(fading.entry.phase, 'fading');
      assert.equal(fading.view.filter, 'grayscale(1)');
      assert.ok(fading.view.opacity < .5);
      await step(3);
      const forgotten = await capture(run, 'forgotten');
      assert.equal(forgotten.entry.phase, 'forgotten');
      assert.equal(forgotten.view.backgroundCount, 0, 'Forgotten room has no background image in DOM');
      assert.ok(forgotten.view.fog);
      assert.equal(about(forgotten.world), undefined);
      await portal('archive', mobile);
      const revisited = await capture(run, 'new-variant');
      assert.notEqual(revisited.entry.variant_id, observed.entry.variant_id);
      assert.ok(revisited.entry.generation > observed.entry.generation);
      assert.notEqual(revisited.view.src, observed.view.src);
      assert.notDeepEqual(about(revisited.world), about(observed.world));
      assert.equal(revisited.entry.forgotten_revisits.length, 1);
      await portal('reception', mobile);
      // Bring the same-room witness into view through actual 28-unit walking.
      while ((await snapshot()).characters[actor].position.x > 520) {
        const before = (await snapshot()).characters[actor].position;
        await control('scene-move-left', mobile);
        await call('click', { selector: '[data-testid="scene-move-left"]' });
        await waitFor(`Math.abs(window.__INTENTION_TEST__.state().characters[${JSON.stringify(actor)}].position.x-${before.x - 28})<.01`, 'Real witness approach');
      }
      await call('click', { selector: '[data-testid="scene-select-target"]' });
      await call('click', { selector: '[data-testid="scene-character-bystander"]' });
      const witnessWorld = await command('ask-bystander', mobile);
      assert.equal(memory(witnessWorld).witness_recalls.length, 1);
      assert.equal(memory(witnessWorld).witness_recalls[0].meeting_room_id, 'reception');
      await capture(run, 'witness-recall');
      const drugWorld = await command('take-memory-drug', mobile);
      assert.ok(drugWorld.room_memory[actor].drug_until_tick > drugWorld.tick);
      await capture(run, 'drug-active');
      await portal('archive', mobile);
      await command('remember-this-place', mobile);
      const anchored = await capture(run, 'anchored');
      assert.ok(anchored.entry.anchored_at_tick != null);
      await portal('reception', mobile); await step(6);
      const retained = await capture(run, 'anchored-away-six-ticks');
      assert.equal(retained.entry.phase, 'anchored');
      assert.ok(retained.view.src);
      await portal('archive', mobile); await step(1);
      const won = await capture(run, 'anchored-return-won');
      assert.equal(won.entry.variant_id, anchored.entry.variant_id);
      assert.equal(won.entry.generation, anchored.entry.generation);
      assert.equal(won.view.src, anchored.view.src);
      assert.equal(won.entry.anchored_revisits.length, 1);
      assert.equal(won.world.progress.status, 'Won');
      assert.ok(won.world.progress.objectives.every(objective => objective.completed));
      // Independent negative control: active drug does not anchor by itself.
      await load();
      await command('take-memory-drug', mobile);
      await portal('archive', mobile);
      const drugOnly = await capture(run, 'drug-only-observed');
      assert.equal(drugOnly.entry.anchored_at_tick, null);
      await portal('reception', mobile); await step(6);
      const drugForgotten = await capture(run, 'drug-only-forgotten');
      assert.equal(drugForgotten.entry.phase, 'forgotten');
      assert.equal(drugForgotten.view.backgroundCount, 0);
      assert.ok(drugForgotten.world.room_memory[actor].drug_until_tick > drugForgotten.world.tick);
      assert.notEqual(drugForgotten.world.progress.status, 'Won');
      if (mobile) await verifyThirdRoom(run);
      run.passed = true;
    } catch (error) {
      run.passed = false; run.error = String(error); process.exitCode = 1;
      try { await shot(`${viewport.name}-room-memory-failure`); } catch (captureError) { run.captureError = String(captureError); }
    }
  }
  report.errors = await call('browser_errors');
  assert.deepEqual(report.errors, []);
  report.status = process.exitCode ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(resolve(output, 'room-memory-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, evidence: output, viewports: report.viewports.map(run => ({ name: run.viewport.name, passed: run.passed, error: run.error })) }));
}
