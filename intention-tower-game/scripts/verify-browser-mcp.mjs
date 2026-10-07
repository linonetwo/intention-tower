import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = process.env.BROWSER_MCP_URL ?? 'http://127.0.0.1:9233/mcp';
const output = resolve(process.env.EVIDENCE_DIR ?? 'verification-evidence');
await mkdir(output, { recursive: true });
const report = { backend: 'authoritative Rust standalone MCP', screenshotSource: 'real Chromium compositor', started: new Date().toISOString(), viewports: [], learning: [], errors: [] };
let id = 0;
async function call(name, args = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) });
  const rpc = await response.json();
  if (rpc.error) throw new Error(`${name}: ${rpc.error.message}`);
  return JSON.parse(rpc.result.content.find(item => item.type === 'text').text);
}
const evaluate = script => call('evaluate_script', { script });
async function settle() {
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  await evaluate(`Promise.allSettled([...document.querySelectorAll('[data-testid="scene-background"], [data-testid^="scene-character-sprite-"]')].map(img=>img.decode()))`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function shot(name) {
  await settle();
  const data = await call('take_screenshot');
  assert.equal(data.source, 'chromium-compositor');
  await writeFile(resolve(output, `${name}.png`), Buffer.from(data.screenshot.split(',')[1], 'base64'));
}
async function waitReady() {
  for (let i = 0; i < 120; i++) {
    try { await call('health'); return; } catch { await new Promise(done => setTimeout(done, 500)); }
  }
  throw new Error('Browser MCP never became ready');
}
async function waitScene() {
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('[data-testid="scene-viewport"]')){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Scene not rendered'))}},50)})`);
}
async function load(level) {
  await evaluate(`window.__INTENTION_TEST__.loadLevel(${JSON.stringify(level)})`);
  await waitScene();
}
const edgeId = 'learned_obs_it_concept_hear-metronome_dog-salivate';
const graph = world => world.characters.dog.mind_graph;
const weight = world => graph(world).edges[edgeId]?.weight ?? 0;
async function captureLearning(label) {
  const world = await call('snapshot');
  report.learning.push({ label, tick: world.tick, status: world.progress.status, weight: weight(world), stats: graph(world).conditioning_stats[edgeId] ?? null, graph: graph(world) });
  await evaluate(`window.__INTENTION_TEST__.setUiMode('graph')`);
  await shot(`learning-${label}`);
  return world;
}
async function command(commandId) {
  // UI action, not direct graph injection: normal store command -> Rust MCP.
  await evaluate(`window.__INTENTION_TEST__.executeCommand(${JSON.stringify(commandId)})`);
  const error = await evaluate(`window.__INTENTION_TEST__.state() ? null : 'Missing state'`);
  assert.equal(error, null);
}
async function clickCommand(commandId) {
  await call('click', { selector: `[data-testid="command-${commandId}"]` });
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().pending_commands.some(command=>command.command_id===${JSON.stringify(commandId)})){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Real command button did not queue ${commandId}'))}},50)})`);
}
async function advance(count) { for (let i = 0; i < count; i++) await call('step_tick'); }
try {
  await waitReady();
  try {
  // At least one run enters the level through the actual visible menu card.
  await call('click', { selector: '[data-testid="level-card-pavlov"]' });
  await waitScene();
  await shot('desktop-pavlov-menu-entry');
  await call('click', { selector: '[data-testid="mode-micro"]' });
  const movementBefore = await call('snapshot');
  await call('click', { selector: '[data-testid="scene-move-right"]' });
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().characters.pavlov.position.x>${movementBefore.characters.pavlov.position.x}){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Movement did not update authoritative UI'))}},50)})`);
  const movementAfter = await call('snapshot');
  assert.ok(movementAfter.characters.pavlov.position.x > movementBefore.characters.pavlov.position.x);
  await shot('desktop-pavlov-real-movement');
  await call('click', { selector: '[data-testid="scene-move-left"]' });
  await call('click', { selector: '[data-testid="step-tick"]' });
  await call('click', { selector: '[data-testid="mode-observe"]' });
  await evaluate(`window.__INTENTION_TEST__.selectActor('pavlov');window.__INTENTION_TEST__.selectTarget('dog');window.__INTENTION_TEST__.setAutoStep(false)`);
  await command('ring-bell'); await advance(11);
  const baseline = await captureLearning('untrained');
  assert.equal(weight(baseline), 0, 'Untrained bell must not create association');
  assert.notEqual(baseline.progress.status, 'Won');
  for (let trial = 0; trial < 5; trial++) {
    if (trial === 0) {
      await call('click', { selector: '[data-testid="mode-observe"]' });
      if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) {
        await call('click', { selector: '[data-testid="dialogue-toggle"]' });
      }
      await clickCommand('ring-bell');
      await advance(1);
      await clickCommand('feed');
      await advance(11);
      await shot('learning-real-command-buttons');
      report.realCommandButtons = ['command-ring-bell', 'command-feed'];
    } else {
      await command('ring-bell'); await advance(1);
      await command('feed'); await advance(11);
    }
  }
  const trained = await captureLearning('trained');
  assert.ok(weight(trained) >= 0.3, 'Paired training must establish real association');
  assert.ok(Math.abs(weight(trained) - 0.67232) < 1e-9, 'Five isolated reward pairings must match the authoritative update rule');
  assert.ok(graph(trained).conditioning_stats[edgeId].paired_trials >= 3);
  await command('ring-bell'); await advance(11);
  const independent = await captureLearning('independent-bell');
  assert.ok(graph(independent).conditioning_stats[edgeId].independent_responses >= 1);
  assert.ok(Math.abs(weight(independent) - 0.537856) < 1e-9, 'Independent unrewarded bell must extinguish exactly one trial');
  assert.equal(independent.progress.status, 'Won', 'Actual independent response must win tutorial');
  // Sandbox removes outcome freeze, not mechanics, so extinction can be exercised.
  await call('load_level', { level_id: 'pavlov', sandbox: true });
  await evaluate(`window.__INTENTION_TEST__.refresh()`);
  for (let trial = 0; trial < 5; trial++) {
    await command('ring-bell'); await advance(1); await command('feed'); await advance(11);
  }
  const before = await call('snapshot');
  for (let trial = 0; trial < 4; trial++) { await command('ring-bell'); await advance(11); }
  const extinct = await captureLearning('extinction');
  assert.ok(weight(extinct) < weight(before), 'Reward omission must weaken learned association');
  } catch (error) {
    report.learningFailure = String(error);
    await shot('learning-failure');
    process.exitCode = 1;
  }

  try {
    const catGraph = world => world.characters['cat-billi'].mind_graph;
    const catEvidence = async label => {
      const world = await call('snapshot');
      (report.smartCatLearning ??= []).push({ label, tick: world.tick, status: world.progress.status, graph: catGraph(world) });
      await evaluate(`window.__INTENTION_TEST__.setUiMode('graph')`);
      await shot(`smart-cat-${label}`);
      return world;
    };
    await load('smart-cat');
    await evaluate(`window.__INTENTION_TEST__.selectActor('trainer');window.__INTENTION_TEST__.selectTarget('cat-billi');window.__INTENTION_TEST__.setAutoStep(false)`);
    await command('demonstrate-press'); await advance(12);
    const untrained = await catEvidence('unrewarded-demonstration');
    assert.equal(Object.values(catGraph(untrained).edges).filter(edge => edge.learnable).length, 0, 'Unrewarded demonstration must not train cat');
    assert.equal(catGraph(untrained).nodes['cat-press-button'].value, 0, 'Demonstration cannot puppet action value');
    assert.equal(catGraph(untrained).nodes['cat-press-button'].action.selected, false);
    const unavailable = await call('list_commands', { actor_id: 'trainer', target_id: 'cat-billi' });
    assert.ok(!unavailable.some(command => command.command_id === 'feed-after-press'));

    await load('smart-cat');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
    await command('show-button'); await advance(1);
    for (let trial = 0; trial < 3; trial++) {
      if (trial === 0) {
        await call('click', { selector: '[data-testid="mode-observe"]' });
        if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) await call('click', { selector: '[data-testid="dialogue-toggle"]' });
        await clickCommand('demonstrate-press'); await advance(1);
        const available = await call('list_commands', { actor_id: 'trainer', target_id: 'cat-billi' });
        assert.ok(!available.some(command => command.command_id === 'feed-after-press'), 'An untrained demonstration cannot unlock contingent food');
        await clickCommand('feed');
      } else { await command('demonstrate-press'); await advance(1); await command('feed'); }
      await advance(1); await advance(11);
    }
    const paired = await catEvidence('rewarded-training');
    assert.ok(Object.values(catGraph(paired).edges).some(edge => edge.learnable && edge.target_instance_id === 'cat-press-button' && edge.weight > 0));
    for (let trial = 0; trial < 3; trial++) {
      await command('demonstrate-press'); await advance(1);
      const beforeSelection = await call('list_commands', { actor_id: 'trainer', target_id: 'cat-billi' });
      if (trial === 0) assert.ok(!beforeSelection.some(command => command.command_id === 'feed-after-press'), 'Eligible value alone cannot unlock contingent food');
      await advance(1);
      const selected = catGraph(await call('snapshot')).nodes['cat-press-button'];
      assert.ok(selected.active && selected.attended && selected.action.selected && selected.value >= 0.3, 'Reward requires actual attended and selected cat action');
      if (trial === 0) {
        await call('click', { selector: '[data-testid="mode-observe"]' });
        await clickCommand('feed-after-press');
        (report.realCommandButtons ??= []).push('command-demonstrate-press', 'command-feed-after-press');
      } else await command('feed-after-press');
      await advance(1);
    }
    const operant = await catEvidence('selected-action-operant-reward');
    assert.ok(Object.values(catGraph(operant).edges).some(edge => edge.learnable && edge.learn_type === 'Operant' && edge.weight > 0), 'Rewarded selected action must create real operant credit');
    assert.equal(operant.progress.status, 'Won');
  } catch (error) {
    report.smartCatFailure = String(error);
    await shot('smart-cat-failure');
    process.exitCode = 1;
  }

  const levels = (await readdir(resolve('assets/levels'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    await call('set_viewport', viewport);
    for (const level of levels) {
      try {
      await load(level);
      await evaluate(`window.__INTENTION_TEST__.setUiMode('observe')`);
      // Capture both views before assessing assets: missing art must not hide the
      // independent graph/layout evidence needed for human aesthetic review.
      await shot(`${viewport.name}-${level}-scene`);
      await evaluate(`window.__INTENTION_TEST__.setUiMode('graph')`);
      await shot(`${viewport.name}-${level}-graph`);
      const scene = await evaluate(`(()=>({viewport:{width:innerWidth,height:innerHeight},characters:[...document.querySelectorAll('[data-testid^="scene-character-sprite-"]')].map(img=>({id:img.dataset.testid,src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,assetMissing:img.closest('button')?.dataset.assetMissing,rect:img.getBoundingClientRect().toJSON()})),overflow:document.documentElement.scrollWidth>innerWidth+1}))()`);
      const assetFailures = [];
      if (!scene.characters.length) assetFailures.push('No real character sprites');
      for (const character of scene.characters) {
        if (!character.width || !character.height || character.assetMissing === 'true') assetFailures.push(`Missing authored sprite: ${character.id}`);
      }
      const layoutFailures = scene.overflow ? ['Horizontal page overflow'] : [];
      report.viewports.push({ viewport: viewport.name, level, ...scene, assetFailures, layoutFailures });
      if (assetFailures.length || layoutFailures.length) process.exitCode = 1;
      } catch (error) {
        report.viewports.push({ viewport: viewport.name, level, failure: String(error) });
        await shot(`${viewport.name}-${level}-failure`);
        process.exitCode = 1;
      }
    }
  }
  report.errors = await call('browser_errors');
  assert.deepEqual(report.errors, [], 'Uncaught browser errors');
  report.status = process.exitCode ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error);
  try { await shot('failure'); report.errors = await call('browser_errors'); } catch (captureError) { report.captureFailure = String(captureError); }
  process.exitCode = 1;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, failure: report.failure, evidence: output, screenshots: report.viewports.length * 2 }));
}
