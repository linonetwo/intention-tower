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
async function settle(screenshotName) {
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  const font = await evaluate(`(async()=>{
    const family='Intention CJK', font='12px "Intention CJK"', text='中文图谱学习奖励巴甫洛夫聪明猫';
    let timer;
    try {
      const result=await Promise.race([
        (async()=>{
          await document.fonts.ready;
          const faces=await document.fonts.load(font,text);
          await document.fonts.ready;
          const checked=document.fonts.check(font,text);
          return {family,font,text,loadedFaces:faces.map(face=>({family:face.family,status:face.status})),checked,passed:faces.length>0&&faces.every(face=>face.status==='loaded')&&checked};
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Self-hosted CJK font load timed out after 15 seconds')),15000)})
      ]);
      return result;
    } catch(error) {return {family,font,text,passed:false,error:String(error)}}
    finally {clearTimeout(timer)}
  })()`);
  const fonts = report.fonts ??= { family: 'Intention CJK', checks: 0, failures: [], passed: true };
  fonts.checks += 1;
  fonts.lastCheck = font;
  if (!font.passed) {
    fonts.passed = false;
    fonts.failures.push({ screenshot: screenshotName, ...font });
    process.exitCode = 1;
  }
  await evaluate(`Promise.allSettled([...document.querySelectorAll('[data-testid="scene-background"], [data-testid^="scene-character-sprite-"]')].map(img=>img.decode()))`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function shot(name) {
  await settle(name);
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
async function clickMode(mode) {
  if (!await evaluate(`!!document.querySelector('[data-testid="mode-${mode}"]')?.getClientRects().length`)) await call('click', { selector: '[data-testid="experiment-menu-open"]' });
  await call('click', { selector: `[data-testid="mode-${mode}"]` });
}
async function waitPosition(character, x, y) {
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{const p=window.__INTENTION_TEST__.state().characters[${JSON.stringify(character)}].position;if(Math.abs(p.x-${x})<.01&&Math.abs(p.y-${y})<.01){clearInterval(timer);resolve(true)}else if(++n>240){clearInterval(timer);reject(new Error('Expected actual position ${character} ${x},${y}'))}},50)})`);
}
async function clickWorldX(x, fractionY) {
  const position = await evaluate(`(()=>{const r=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect(),d=window.__itSceneDebug();return{x:${x}*d.scale+d.cameraX,y:r.height*${fractionY}}})()`);
  await call('click', { selector: '[data-testid="scene-viewport"]', position });
}
async function advance(count) { for (let i = 0; i < count; i++) await call('step_tick'); }
try {
  await waitReady();
  try {
  // At least one run enters the level through the actual visible menu card.
  await call('click', { selector: '[data-testid="level-card-pavlov"]' });
  await waitScene();
  await shot('desktop-pavlov-menu-entry');
  await clickMode('micro');
  const movementBefore = await call('snapshot');
  await call('click', { selector: '[data-testid="scene-move-right"]' });
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().characters.pavlov.position.x>${movementBefore.characters.pavlov.position.x}){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Movement did not update authoritative UI'))}},50)})`);
  const movementAfter = await call('snapshot');
  assert.ok(movementAfter.characters.pavlov.position.x > movementBefore.characters.pavlov.position.x);
  await shot('desktop-pavlov-real-movement');
  await call('click', { selector: '[data-testid="scene-move-left"]' });
  await call('click', { selector: '[data-testid="step-tick"]' });
  await clickMode('observe');
  await evaluate(`window.__INTENTION_TEST__.selectActor('pavlov');window.__INTENTION_TEST__.selectTarget('dog');window.__INTENTION_TEST__.setAutoStep(false)`);
  await command('ring-bell'); await advance(11);
  const baseline = await captureLearning('untrained');
  assert.equal(weight(baseline), 0, 'Untrained bell must not create association');
  assert.notEqual(baseline.progress.status, 'Won');
  for (let trial = 0; trial < 5; trial++) {
    if (trial === 0) {
      await clickMode('observe');
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
    const advance = async count => { for (let tick = 0; tick < count; tick++) await call('tick', { dt: 0.5 }); };
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
        await clickMode('observe');
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
    for (let trial = 0; trial < 80; trial++) {
      let ready;
      for (let wait = 0; wait < 300; wait++) {
        ready = await call('snapshot');
        const graph = catGraph(ready);
        if (graph.action_episodes.some(episode => episode.autonomous)) break;
        if (graph.nodes['cat-hunger'].value >= .65 && !graph.nodes['cat-press-button'].action.selected) break;
        await advance(1);
      }
      ready = await call('snapshot');
      if (catGraph(ready).action_episodes.some(episode => episode.autonomous)) break;
      assert.ok(catGraph(ready).nodes['cat-hunger'].value >= .65 && !catGraph(ready).nodes['cat-press-button'].action.selected, `trial ${trial}: hungry response failed to reset within 300 ticks`);
      const before = catGraph(ready).action_episodes.length;
      if (trial === 0) { await clickMode('observe'); await clickCommand('demonstrate-press'); }
      else await command('demonstrate-press');
      let response;
      for (let wait = 0; wait < 6; wait++) {
        await advance(1); response = await call('snapshot');
        if (catGraph(response).action_episodes.length > before) break;
      }
      assert.ok(catGraph(response).action_episodes.length > before, `trial ${trial}: new real motor episode required`);
      const selected = catGraph(response).nodes['cat-press-button'];
      assert.ok(selected.active && selected.attended && selected.action.selected, 'Completed response comes from actual attended selected motor execution');
      if (trial === 0) {
        await clickCommand('feed-after-press');
        (report.realCommandButtons ??= []).push('command-demonstrate-press', 'command-feed-after-press');
      } else await command('feed-after-press');
      await advance(1);
      const rewarded = await call('snapshot');
      assert.ok(catGraph(rewarded).action_episodes.at(-1).rewarded_at != null);
      assert.ok(catGraph(rewarded).action_episodes.at(-1).reinforcement_dopamine_spent > 0, 'Real reinforcement must pay dopamine');
      const available = await call('list_commands', { actor_id: 'trainer', target_id: 'cat-billi' });
      assert.ok(!available.some(command => command.command_id === 'feed-after-press'), 'A persistent selected flag cannot reward one episode twice');
      if (trial === 0) {
        await call('restore_snapshot', { world: rewarded }); await evaluate(`window.__INTENTION_TEST__.refresh()`);
        assert.deepEqual(await call('snapshot'), rewarded, 'Save restore preserves complete cat motor and learning state');
      }
      await advance(12);
    }
    await advance(300);
    const operant = await catEvidence('selected-action-operant-reward');
    assert.ok(Object.values(catGraph(operant).edges).some(edge => edge.learnable && edge.learn_type === 'Operant' && edge.source_instance_id === 'cat-hunger' && edge.weight > 0), 'Food need must learn real motor credit');
    assert.ok(catGraph(operant).action_episodes.some(episode => episode.autonomous && episode.contexts.some(context => context.schema_id === 'it:concept/hunger' && context.value >= .6)), 'Won requires a real unprompted hungry press, not command counts');
    assert.equal(operant.progress.status, 'Won');
  } catch (error) {
    report.smartCatFailure = String(error);
    await shot('smart-cat-failure');
    process.exitCode = 1;
  }

  try {
    const motivation = world => world.characters.gosling.mind_graph.nodes['gosling-imprint-target'].motivation;
    const gap = world => Math.hypot(world.characters.gosling.position.x - world.characters.lorenz.position.x, world.characters.gosling.position.y - world.characters.lorenz.position.y);
    const capture = async label => {
      const world = await call('snapshot');
      (report.goslingLearning ??= []).push({ label, tick: world.tick, status: world.progress.status, motivation: motivation(world), positions: { lorenz: world.characters.lorenz.position, gosling: world.characters.gosling.position }, gap: gap(world) });
      await evaluate(`window.__INTENTION_TEST__.setUiMode('micro')`);
      await shot(`gosling-${label}-scene`);
      await evaluate(`window.__INTENTION_TEST__.setUiMode('graph')`);
      await shot(`gosling-${label}-graph`);
      return world;
    };
    await load('gosling');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
    const initial = await capture('untrained');
    assert.equal(motivation(initial).target_entity, null);
    assert.ok(!motivation(initial).imprinting_evidence, 'Initial Imprinting-labelled wiring is not acquisition evidence');
    await command('show-decoy'); await advance(1);
    const decoy = await capture('decoy-first');
    assert.equal(motivation(decoy).target_entity, 'it:entity/mother-goose-decoy');
    await command('approach-gosling'); await advance(1);
    assert.equal(motivation(await call('snapshot')).target_entity, 'it:entity/mother-goose-decoy', 'Later contact cannot replace first imprint');
    assert.equal((await call('snapshot')).progress.status, 'InProgress');

    await load('gosling');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.selectActor('lorenz');window.__INTENTION_TEST__.selectTarget('gosling')`);
    if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) await call('click', { selector: '[data-testid="dialogue-toggle"]' });
    await clickCommand('approach-gosling'); await advance(1);
    const acquired = await capture('acquired-lorenz');
    assert.equal(motivation(acquired).target_entity, 'it:entity/lorenz');
    assert.equal(motivation(acquired).imprinting_evidence.target_entity, 'it:entity/lorenz');
    assert.equal(motivation(acquired).imprinting_evidence.dopamine_spent, 0.2);
    assert.equal(acquired.progress.status, 'InProgress', 'Imprinting alone is not successful following');
    await clickMode('micro');
    await clickCommand('move-away'); await advance(1);
    const separated = await capture('target-moved-away');
    assert.ok(separated.characters.lorenz.position.x < acquired.characters.lorenz.position.x, 'Target must actually move');
    // Authoritative full-world restore, identical to the save payload: never
    // inject learned evidence or positions; replay the core's own snapshot.
    await call('restore_snapshot', { world: separated });
    await evaluate(`window.__INTENTION_TEST__.refresh()`);
    assert.deepEqual(await call('snapshot'), separated, 'Save restore must preserve complete imprint/movement state');
    await advance(12);
    const followed = await capture('real-following');
    const evidence = motivation(followed).imprinting_evidence;
    assert.ok(gap(followed) < gap(separated) && gap(followed) <= 80, 'Follower must close real entity distance');
    assert.ok(followed.characters.gosling.position.x < separated.characters.gosling.position.x, 'Follower sprite position must come from actual Rust movement');
    assert.ok(evidence.followed_distance >= 80 && evidence.follow_ticks >= 3 && evidence.max_separation_distance >= 210);
    assert.equal(evidence.target_entity, 'it:entity/lorenz');
    assert.equal(followed.progress.status, 'Won');
    (report.realCommandButtons ??= []).push('command-approach-gosling', 'command-move-away');
  } catch (error) {
    report.goslingFailure = String(error);
    await shot('gosling-failure');
    process.exitCode = 1;
  }

  try {
    await load('smart-cat');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
    const toolbar = await evaluate(`(()=>{const top=document.querySelector('[data-testid="game-topbar"]');return{height:top.getBoundingClientRect().height,buttons:[...top.querySelectorAll('button')].map(b=>({id:b.dataset.testid,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),save:!!top.querySelector('[data-testid="save-menu-open"]')}})()`);
    assert.equal(toolbar.height, 60);
    assert.equal(toolbar.save, false, 'Save belongs inside the experiment menu, not topbar');
    assert.equal(toolbar.buttons.length, 4, 'Topbar has exactly four primary controls');
    for (const button of toolbar.buttons) assert.ok(button.width >= 44 && button.height >= 44, `${button.id} minimum touch target`);
    await call('click', { selector: '[data-testid="experiment-menu-open"]' });
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="save-menu-open"]')?.getClientRects().length`), true);
    await call('click', { selector: '[data-testid="experiment-menu-close"]' });
    await call('click', { selector: '[data-testid="scene-character-cat-billi"]' });
    const initial = await call('snapshot');
    assert.equal(initial.characters['cat-billi'].position.x, 400);
    await clickWorldX(460, .2); await waitPosition('cat-billi', 460, 300);
    await clickWorldX(520, .72); await waitPosition('cat-billi', 520, 300);
    await call('click', { selector: '[data-testid="scene-posture"]' });
    const sitting = await call('snapshot');
    assert.equal(sitting.character_postures['cat-billi'], 'sitting');
    assert.deepEqual(sitting.characters['cat-billi'].position, { x: 520, y: 300 });
    await call('click', { selector: '[data-testid="scene-posture"]' });
    assert.equal((await call('snapshot')).character_postures['cat-billi'], 'standing');
    await call('click', { selector: '[data-testid="scene-traverse"]' });
    await waitPosition('cat-billi', 580, 180);
    assert.equal((await call('snapshot')).characters['cat-billi'].position.y, 180);
    await shot('smart-cat-real-stairs-up');
    await call('click', { selector: '[data-testid="scene-traverse"]' });
    await waitPosition('cat-billi', 520, 300);
    await shot('smart-cat-real-stairs-down');
    await load('the-wave');
    const wave = await call('snapshot');
    assert.deepEqual([...new Set(Object.values(wave.characters).map(c => c.position.y))], [300], 'All classroom characters share one authored floor');
    report.sceneInteraction = { toolbar, sitting: sitting.characters['cat-billi'], wavePositions: Object.fromEntries(Object.entries(wave.characters).map(([id,c])=>[id,c.position])), passed: true };
  } catch (error) {
    report.sceneInteractionFailure = String(error); process.exitCode = 1;
    await shot('scene-interaction-failure');
  }

  const levels = (await readdir(resolve('assets/levels'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'mobile-landscape', width: 844, height: 390 }]) {
    await call('set_viewport', viewport);
    for (const level of levels) {
      if (viewport.name === 'mobile-landscape' && !['pavlov', 'smart-cat', 'gosling', 'the-wave'].includes(level)) continue;
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
