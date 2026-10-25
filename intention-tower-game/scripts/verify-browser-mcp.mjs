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
  await evaluate(`Promise.allSettled([...document.querySelectorAll('[data-testid^="scene-background"], [data-testid^="scene-character-sprite-"], [data-rig-part]')].map(img=>img.decode()))`);
  await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
}
async function shot(name) {
  await closeNotebook();
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
  await closeNotebook();
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
  await closeNotebook();
  await call('click', { selector: `[data-testid="command-${commandId}"]` });
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().pending_commands.some(command=>command.command_id===${JSON.stringify(commandId)})){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Real command button did not queue ${commandId}'))}},50)})`);
}
async function closeNotebook() {
  if (await evaluate(`!!document.querySelector('[data-testid="experiment-menu-close"]')?.getClientRects().length`)) {
    await call('click', { selector: '[data-testid="experiment-menu-close"]' });
  }
  // MUI keeps the backdrop mounted during the exit transition. Wait for its
  // removal before real pointer actions or compositor evidence, never force it.
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(!document.querySelector('[data-testid="experiment-menu"]')){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Experiment notebook did not close'))}},50)})`);
}
async function clickMode(mode) {
  await closeNotebook();
  await call('click', { selector: '[data-testid="experiment-menu-open"]' });
  await call('click', { selector: `[data-testid="experiment-menu"] [data-testid="mode-${mode}"]` });
  // Selecting the current mode must close the notebook as well.
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(!document.querySelector('[data-testid="experiment-menu"]')){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Mode selection left experiment notebook open'))}},50)})`);
}
async function waitPosition(character, x, y, pointerTolerance = .01) {
  // Pointer coordinates are rasterized by Chromium and walkTo stops below one
  // world unit. Button steps and connector endpoints still require exact x/y.
  assert.ok(pointerTolerance > 0 && pointerTolerance <= 1);
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{const p=window.__INTENTION_TEST__.state().characters[${JSON.stringify(character)}].position;if(Math.abs(p.x-${x})<${pointerTolerance}&&Math.abs(p.y-${y})<.01){clearInterval(timer);resolve(true)}else if(++n>240){clearInterval(timer);reject(new Error('Expected actual position ${character} ${x},${y}; got '+JSON.stringify(p)))}},50)})`);
}
async function clickWorldX(x, fractionY) {
  const position = await evaluate(`(()=>{const r=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect(),d=window.__itSceneDebug();return{x:${x}*d.scale+d.cameraX,y:r.height*${fractionY}}})()`);
  await call('click', { selector: '[data-testid="scene-viewport"]', position });
}
async function advance(count) { for (let i = 0; i < count; i++) await call('step_tick'); }
// Bounds are the union of articulated image parts, never the padded rig canvas.
async function rigEvidence(character) {
  const result = await evaluate(`(async()=>{const actor=document.querySelector('[data-testid="scene-character-${character}"]'),rig=document.querySelector('[data-testid="scene-character-rig-${character}"]');if(!rig)throw new Error('Missing articulated rig ${character}');const imgs=[...rig.querySelectorAll('[data-rig-part]')];await Promise.all(imgs.map(img=>img.decode()));const boxes=imgs.map(img=>img.getBoundingClientRect()),a=actor.getBoundingClientRect(),stage=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect();return{pose:rig.dataset.pose,outfit:rig.dataset.outfit,head:rig.dataset.head,headSrc:rig.querySelector('[data-rig-part="head"]').currentSrc,torsoSrc:rig.querySelector('[data-rig-part="torso"]').currentSrc,parts:imgs.map(img=>({part:img.dataset.rigPart,width:img.naturalWidth,height:img.naturalHeight,complete:img.complete})),bounds:{left:Math.min(...boxes.map(r=>r.left)),right:Math.max(...boxes.map(r=>r.right)),top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))},actor:a.toJSON(),stage:stage.toJSON(),ground:window.__itSceneDebug().ground}})()`);
  assert.equal(result.parts.length, 10, `${character}: head, torso and eight articulated limb parts`);
  assert.ok(result.parts.every(part => part.complete && part.width > 0 && part.height > 0), `${character}: every rig image decoded`);
  assert.ok(result.bounds.bottom - result.bounds.top > result.actor.height * .45, `${character}: real human body height`);
  assert.ok(Math.abs(result.actor.bottom - result.stage.top - result.ground) < 1, `${character}: outer actor feet on authored floor`);
  return result;
}
try {
  // A local rerun may reuse the previous short-landscape viewport. Establish
  // the desktop starting fixture before navigating via actual menu controls.
  await call('set_viewport', { width: 1440, height: 900 });
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
    const advance = async count => { for (let tick = 0; tick < count; tick++) await call('step_tick'); };
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
      if (response.progress.status === 'Won') break;
      const episode = catGraph(response).action_episodes.at(-1);
      assert.ok(episode.executed_at <= response.tick && episode.rewarded_at == null && episode.reward_consumed_at == null, 'Contingent food requires an actual unconsumed motor execution, not a persistent selected flag');
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
    await load('the-wave');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.selectActor('teacher-wenger');window.__INTENTION_TEST__.selectTarget('tim')`);
    await clickMode('observe');
    if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) {
      await call('click', { selector: '[data-testid="dialogue-toggle"]' });
    }
    await clickCommand('introduce-uniform'); await advance(1);
    assert.ok(await evaluate(`(()=>{const button=document.querySelector('[data-testid="command-give-approval"]');return !button||button.disabled})()`), 'Approval must not be offered before an actual response');
    await clickCommand('teach-gesture'); await advance(1);
    await clickCommand('request-sit'); await advance(4);
    const before = await call('snapshot');
    assert.equal(before.character_postures.tim, 'sitting');
    await clickCommand('give-approval'); await advance(1);
    const approved = await call('snapshot');
    const socialEdge = 'social_tim-loneliness_meme_it_concept_group-identity';
    const socialGraph = world => world.characters.tim.mind_graph;
    const edge = socialGraph(approved).edges[socialEdge];
    assert.ok(edge && Math.abs(edge.weight - .2) < 1e-9, 'Actual approval creates a paid social association');
    assert.ok(socialGraph(approved).nodes['tim-loneliness'].value < socialGraph(before).nodes['tim-loneliness'].value, 'Approval actually relieves loneliness');
    assert.ok(socialGraph(approved).nodes['tim-value-deficit'].value < socialGraph(before).nodes['tim-value-deficit'].value, 'Approval actually relieves value deficit, not just an identity score');
    assert.ok(socialGraph(approved).nodes['tim-dopamine'].value < socialGraph(before).nodes['tim-dopamine'].value, 'Learning cost exceeds passive regeneration');
    const credited = socialGraph(approved).action_episodes.find(episode => episode.action_id === 'tim-sit-on-command');
    assert.ok(credited && credited.reward_consumed_at === approved.tick && credited.social_reward_delivered_at === approved.tick && credited.rewarded_at === approved.tick && credited.reinforcement_dopamine_spent > 0, 'Reward credits the exact actual sitting response with paid learning');
    const approval = Object.values(socialGraph(approved).nodes).find(node => node.observation?.action_credit?.action_id === 'tim-sit-on-command');
    assert.equal(approval.observation.social_consumed_at, approved.tick);
    assert.equal(approval.observation.action_credit.target_character_id, 'tim');
    for (const need of ['tim-loneliness', 'tim-value-deficit']) {
      const learned = socialGraph(approved).edges[`operant_${need}_tim-sit-on-command`];
      assert.ok(learned && learned.weight > 0 && learned.evidence.co_occurrence_count === 1, 'Both actual need consequences learn the credited action');
    }
    assert.ok(await evaluate(`(()=>{const button=document.querySelector('[data-testid="command-give-approval"]');return !button||button.disabled})()`), 'The same response must not offer another approval');
    await clickMode('graph');
    const trace = await evaluate(`document.querySelector('[data-testid="graph-learning-trace"]')?.textContent ?? ''`);
    assert.ok(trace.includes('多巴胺') && trace.includes('预测'), 'Paid predictive learning must be visible in the actual graph trace');
    await evaluate(`(()=>{const trace=document.querySelector('[data-testid="graph-learning-trace"]');trace.scrollTop=trace.scrollHeight})()`);
    await shot('wave-real-social-learning');
    await advance(20);
    const lingering = await call('snapshot');
    assert.equal(socialGraph(lingering).edges[socialEdge].weight, edge.weight, 'Long TTL is not a new social reward');
    assert.equal(socialGraph(lingering).edges[socialEdge].evidence.co_occurrence_count, 1);
    await clickMode('observe');
    assert.ok(await evaluate(`(()=>{const button=document.querySelector('[data-testid="command-give-approval"]');return !button||button.disabled})()`), 'Waiting cannot revive a consumed response');
    await clickCommand('request-stand'); await advance(4);
    assert.equal((await call('snapshot')).character_postures.tim, 'standing');
    await clickCommand('give-approval'); await advance(1);
    const repeated = await call('snapshot');
    assert.equal(socialGraph(repeated).edges[socialEdge].evidence.co_occurrence_count, 2, 'A fresh presentation can teach again');
    assert.ok(socialGraph(repeated).edges[socialEdge].weight > edge.weight);
    const second = socialGraph(repeated).action_episodes.find(episode => episode.action_id === 'tim-stand-on-command');
    assert.ok(second && second.rewarded_at === repeated.tick && second.reinforcement_dopamine_spent > 0, 'Second reward requires and reinforces a new real action');
    await call('click', { selector: '[data-testid="objective-hud"] [aria-expanded]' });
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('[data-testid="objective-hud"] .MuiCollapse-entered')){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Objective card expansion did not finish'))}},25)})`);
    const objectiveColors = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="objective-label-"]')).map(node=>({text:node.textContent,color:getComputedStyle(node).color}))`);
    assert.ok(objectiveColors.length > 0 && objectiveColors.every(row => ['rgb(87, 65, 43)', 'rgb(86, 112, 68)'].includes(row.color)), 'Expanded objective text uses readable dark colors');
    await shot('wave-readable-objectives');
    await call('click', { selector: '[data-testid="objective-hud"] [aria-expanded]' });
    report.waveSocialLearning = { realButtons: true, firstTick: approved.tick, firstWeight: edge.weight, consumedAt: approval.observation.social_consumed_at, longTtlUpdates: 1, newPresentationUpdates: 2, graphTraceVisible: true, actualActionCredit: credited, valueRelief: socialGraph(before).nodes['tim-value-deficit'].value - socialGraph(approved).nodes['tim-value-deficit'].value, duplicateUnavailable: true, secondActionCredit: second, objectiveColors };
  } catch (error) {
    report.waveSocialFailure = String(error);
    await shot('wave-social-failure');
    process.exitCode = 1;
  }

  try {
    await load('the-wave');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.selectActor('teacher-wenger');window.__INTENTION_TEST__.selectTarget('tim')`);
    await clickMode('observe');
    if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) await call('click', { selector: '[data-testid="dialogue-toggle"]' });
    await clickCommand('introduce-uniform'); await advance(1);
    await clickCommand('teach-gesture'); await advance(1);
    const latest = world => world.characters.tim.mind_graph.action_episodes.at(-1);
    const actionWeights = (world, action) => Object.fromEntries(Object.entries(world.characters.tim.mind_graph.edges)
      .filter(([, edge]) => edge.learn_type === 'Operant' && edge.target_instance_id === action)
      .map(([id, edge]) => [id, edge.weight]));
    // Establish two independent action predictions using real completed responses.
    for (const posture of ['sit', 'stand']) {
      await clickCommand(`request-${posture}`); await advance(4);
      await clickCommand('give-approval'); await advance(1);
    }
    await clickCommand('request-sit'); await advance(4);
    const expectingWeak = await call('snapshot');
    const weakTrial = latest(expectingWeak).social_reward_expectation;
    assert.ok(weakTrial && weakTrial.prediction > .02 && weakTrial.settled_at == null);
    const beforeWeak = actionWeights(expectingWeak, 'tim-sit-on-command');
    await clickCommand('give-weak-approval'); await advance(1);
    const weakened = await call('snapshot');
    const weakReceipt = latest(weakened);
    assert.equal(weakReceipt.social_reward_expectation.outcome, 'delivered');
    assert.ok(Math.abs(weakReceipt.social_reward_expectation.reward - .02) < 1e-9);
    assert.ok(weakReceipt.social_reward_expectation.extinction_dopamine_spent > 0);
    assert.equal(weakReceipt.rewarded_at, null, 'Paid negative updates are not successful reinforcement');
    const afterWeak = actionWeights(weakened, 'tim-sit-on-command');
    assert.ok(Object.entries(beforeWeak).some(([id, weight]) => afterWeak[id] < weight));
    await clickMode('graph');
    const weakTrace = await evaluate(`document.querySelector('[data-testid="graph-learning-trace"]')?.textContent ?? ''`);
    assert.ok(weakTrace.includes('消退') && weakTrace.includes('多巴胺'), 'Diminished reward has an actual paid extinction trace');
    await shot('wave-weaker-reward');
    await clickMode('observe');
    await clickCommand('request-stand'); await advance(4);
    let pending = await call('snapshot');
    const pendingReceipt = latest(pending);
    assert.ok(pendingReceipt.social_reward_expectation.prediction > 0);
    const deadline = pendingReceipt.social_reward_expectation.deadline;
    const beforeOmission = actionWeights(pending, 'tim-stand-on-command');
    await advance(deadline - pending.tick);
    pending = await call('snapshot');
    assert.equal(latest(pending).social_reward_expectation.settled_at, null, 'The final reward tick remains eligible');
    await advance(1);
    const omitted = await call('snapshot');
    const omittedReceipt = latest(omitted);
    assert.equal(omittedReceipt.social_reward_expectation.outcome, 'omitted');
    assert.ok(omittedReceipt.social_reward_expectation.reward === 0, 'Omission realizes no reward (including IEEE negative zero)');
    assert.ok(omittedReceipt.social_reward_expectation.extinction_dopamine_spent > 0);
    const afterOmission = actionWeights(omitted, 'tim-stand-on-command');
    assert.ok(Object.entries(beforeOmission).some(([id, weight]) => afterOmission[id] != null && afterOmission[id] < weight));
    await clickMode('graph');
    const omissionTrace = await evaluate(`document.querySelector('[data-testid="graph-learning-trace"]')?.textContent ?? ''`);
    assert.ok(omissionTrace.includes('消退') && omissionTrace.includes('多巴胺'));
    await shot('wave-omitted-reward');
    await advance(5);
    const later = await call('snapshot');
    assert.deepEqual(actionWeights(later, 'tim-stand-on-command'), afterOmission, 'Quiet waiting cannot repeatedly extinguish the same response');
    assert.equal(latest(later).social_reward_expectation.settled_at, omittedReceipt.social_reward_expectation.settled_at);
    await clickMode('observe');
    await clickCommand('request-sit'); await advance(4);
    const beforeRecovery = await call('snapshot');
    await clickCommand('give-approval'); await advance(1);
    const recovered = await call('snapshot');
    assert.ok(latest(recovered).reinforcement_dopamine_spent > 0 && latest(recovered).rewarded_at != null, 'Fresh full approval can reinforce again after extinction');
    assert.ok(Object.entries(actionWeights(beforeRecovery, 'tim-sit-on-command')).some(([id, weight]) => actionWeights(recovered, 'tim-sit-on-command')[id] > weight));
    report.waveRewardExtinction = { realButtons: true, weakReceipt, beforeWeak, afterWeak, weakTrace, omittedReceipt, beforeOmission, afterOmission, omissionTrace, noIdleRepeat: true, recovery: latest(recovered), passed: true };
  } catch (error) {
    report.waveRewardExtinction = { passed: false, error: String(error) };
    process.exitCode = 1;
    await shot('wave-reward-extinction-failure');
  }

  try {
    const members = ['tim', 'student-b'];
    const exclusions = world => Object.fromEntries(members.map(member => [member, world.characters[member].mind_graph.action_episodes.filter(episode => episode.physical_outcome?.type === 'SocialExclusion')]));
    const prepare = async () => {
      await load('the-wave');
      await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
      await clickMode('observe');
      if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) await call('click', { selector: '[data-testid="dialogue-toggle"]' });
    };
    await prepare();
    await evaluate(`window.__INTENTION_TEST__.selectActor('outsider');window.__INTENTION_TEST__.selectTarget(null)`);
    await clickCommand('voice-dissent'); await advance(9);
    const untrained = await call('snapshot');
    assert.ok(Object.values(exclusions(untrained)).every(episodes => episodes.length === 0), 'Dissent alone cannot manufacture untrained exclusion');
    await prepare();
    const training = [];
    for (const member of members) {
      await evaluate(`window.__INTENTION_TEST__.selectActor('teacher-wenger');window.__INTENTION_TEST__.selectTarget(${JSON.stringify(member)})`);
      await clickCommand('introduce-uniform'); await advance(1);
      await clickCommand('teach-gesture'); await advance(1);
      await clickCommand('request-sit'); await advance(4);
      const response = await call('snapshot');
      assert.equal(response.character_postures[member], 'sitting');
      const episode = response.characters[member].mind_graph.action_episodes.find(episode => episode.physical_outcome?.type === 'ActorPosture' && episode.stimulus?.emitter_id === 'teacher-wenger');
      assert.ok(episode, `${member}: approval requires an actual instructed response`);
      await clickCommand('give-approval'); await advance(1);
      const rewarded = await call('snapshot');
      const credited = rewarded.characters[member].mind_graph.action_episodes.find(candidate => candidate.action_id === episode.action_id && candidate.executed_at === episode.executed_at);
      assert.ok(credited.rewarded_at != null && credited.reward_consumed_at != null && credited.reinforcement_dopamine_spent > 0, `${member}: actual UI approval must pay motor learning`);
      training.push({ member, episode: credited });
    }
    const before = await call('snapshot');
    await evaluate(`window.__INTENTION_TEST__.selectActor('outsider');window.__INTENTION_TEST__.selectTarget(null)`);
    await clickCommand('voice-dissent');
    let excluded;
    const visibleConsequences = [];
    for (let tick = 0; tick < 12; tick++) {
      await advance(1);
      excluded = await call('snapshot');
      const narrative = await evaluate(`document.querySelector('[data-testid="dialogue-hud"]')?.innerText ?? ''`);
      if (narrative.includes('排斥了') && narrative.includes('增加')) visibleConsequences.push({ tick: excluded.tick, text: narrative });
      if (Object.values(exclusions(excluded)).every(episodes => episodes.length > 0)) break;
    }
    const episodes = exclusions(excluded);
    for (const member of members) {
      const episode = episodes[member][0];
      assert.ok(episode, `${member}: learned member must actually execute exclusion`);
      const outcome = episode.physical_outcome;
      assert.equal(episode.action_schema_id, 'it:concept/exclude-outsider');
      assert.equal(episode.stimulus.emitter_id, 'outsider');
      assert.equal(episode.stimulus.observation_schema_id, 'it:concept/group-dissent');
      assert.equal(outcome.target_character_id, 'outsider');
      assert.equal(outcome.group_id, 'the-wave');
      assert.equal(outcome.target_need_schema_id, 'it:concept/loneliness');
      assert.ok(outcome.to - outcome.from >= .1 && outcome.social_dopamine_spent > 0);
      const graph = excluded.characters[member].mind_graph;
      assert.ok(graph.nodes[outcome.learned_identity_instance_id] && graph.edges[outcome.social_edge_id]?.evidence.social_dopamine_spent > 0, `${member}: consequence must reference real paid identity learning`);
    }
    const needDelta = excluded.characters.outsider.mind_graph.nodes['outsider-loneliness'].value - before.characters.outsider.mind_graph.nodes['outsider-loneliness'].value;
    assert.ok(needDelta >= .2, 'Both real exclusions aggravate the living outsider need');
    assert.ok(visibleConsequences.length > 0, 'Actual localized event consequence must be visible, not synthesized test copy');
    const sprites = [];
    for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      await call('set_viewport', { width: viewport.width, height: viewport.height });
      await settle(`wave-exclusion-${viewport.name}`);
      const outsiderRig = await rigEvidence('outsider');
      const art = await evaluate(`(async()=>{const manifest=await fetch('/mods/gpt-image-2-pack/manifest.json').then(r=>r.json()),asset=manifest.paperDoll.characters.outsider,img=document.querySelector('[data-testid="scene-character-sprite-outsider"]'),actor=document.querySelector('[data-testid="scene-character-outsider"]'),a=actor.getBoundingClientRect(),v=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect(),debug=window.__itSceneDebug();return {src:img.currentSrc,expectedSrc:new URL(manifest.paperDoll.heads[asset.headId],location.href).href,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,missing:actor.dataset.assetMissing,stage:v.toJSON(),ground:a.bottom-v.top,expectedGround:debug.ground,worldY:Number(actor.dataset.worldY)}})()`);
      art.rect = outsiderRig.bounds;
      art.rig = outsiderRig;
      assert.equal(art.src.split('?')[0], art.expectedSrc.split('?')[0], 'Outsider uses the formal manifest sprite');
      assert.ok(art.naturalWidth > 0 && art.naturalHeight > 0 && art.missing === 'false');
      assert.ok(art.rect.left >= art.stage.left - 1 && art.rect.right <= art.stage.right + 1 && art.rect.top >= art.stage.top - 1 && art.rect.bottom <= art.stage.bottom + 1, 'Full outsider body is in the visible scene');
      assert.equal(art.worldY, 300);
      assert.ok(Math.abs(art.ground - art.expectedGround) < 1, 'Outsider feet remain on the authored classroom floor');
      const feedback = await evaluate(`(()=>{const panel=document.querySelector('[data-testid="dialogue-scroll-content"]'),r=panel.getBoundingClientRect();return {scrollTop:panel.scrollTop,rows:[...panel.querySelectorAll('[data-testid^="dialogue-event-"]')].filter(node=>node.textContent.includes('排斥了')).map(node=>{const box=node.getBoundingClientRect();return {text:node.textContent,visible:box.top>=r.top&&box.bottom<=r.bottom,fontSize:parseFloat(getComputedStyle(node).fontSize)}})}})()`);
      assert.equal(feedback.rows.length, 2, 'Both actual consequences remain in the feedback panel');
      assert.ok(feedback.rows.every(row => row.visible && row.fontSize >= 13), 'New consequences must be legible and inside the visible scroll area, not merely present in the DOM');
      await shot(`wave-exclusion-${viewport.name}`);
      sprites.push({ viewport: viewport.name, ...art, feedback });
    }
    report.waveExclusion = { realButtons: true, untrainedEpisodes: exclusions(untrained), training, episodes, needDelta, visibleConsequences, sprites, passed: true };
  } catch (error) {
    report.waveExclusion = { passed: false, error: String(error) };
    process.exitCode = 1;
    await shot('wave-exclusion-failure');
  } finally {
    await call('set_viewport', { width: 1440, height: 900 });
  }

  try {
    await load('the-wave');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.selectActor('teacher-wenger');window.__INTENTION_TEST__.selectTarget('tim')`);
    await clickMode('observe');
    if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) {
      await call('click', { selector: '[data-testid="dialogue-toggle"]' });
    }
    await clickCommand('teach-gesture'); await advance(1);
    const before = await call('snapshot');
    await clickCommand('request-sit'); await advance(4);
    const seated = await call('snapshot');
    const motorEpisodes = world => world.characters.tim.mind_graph.action_episodes.filter(episode => episode.physical_outcome?.type === 'ActorPosture');
    assert.equal(seated.character_postures.tim, 'sitting');
    assert.deepEqual(seated.characters.tim.position, before.characters.tim.position, 'Instructed sitting must not move the character off the floor');
    assert.equal(motorEpisodes(seated).length, 1);
    const receipt = motorEpisodes(seated)[0].stimulus;
    assert.equal(receipt.emitter_id, 'teacher-wenger');
    assert.equal(receipt.group_context, 'the-wave');
    assert.equal(receipt.observation_schema_id, 'it:concept/instruction-sit');
    await shot('wave-instructed-sitting');
    await call('set_viewport', { width: 390, height: 844 });
    await settle('mobile-wave-projection-check');
    const projection = await evaluate(`(()=>{const viewport=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect(),d=window.__itSceneDebug();return d.characters.map(character=>{const r=document.querySelector('[data-testid="scene-character-'+character.id+'"]').getBoundingClientRect();return{id:character.id,actualX:r.left+r.width/2-viewport.left,expectedX:character.position.x*d.scale+d.cameraX,actualGround:r.bottom-viewport.top,expectedGround:d.ground+(character.position.y-300)*d.scale}})})()`);
    for (const anchor of projection) {
      assert.ok(Math.abs(anchor.actualX - anchor.expectedX) < 1, `${anchor.id}: resized sprite must land with room projection, not glide from the old viewport`);
      assert.ok(Math.abs(anchor.actualGround - anchor.expectedGround) < 1, `${anchor.id}: resized feet must remain on the actual floor`);
    }
    await shot('mobile-wave-instructed-sitting');
    await call('set_viewport', { width: 1440, height: 900 });
    await clickCommand('request-sit'); await advance(4);
    const noOp = await call('snapshot');
    assert.equal(motorEpisodes(noOp).length, 1, 'Already seated instruction is not a second successful motor response');
    assert.equal(noOp.characters.tim.mind_graph.consumed_action_stimuli.length, 2, 'The no-op instruction must still be consumed');
    await clickCommand('request-stand'); await advance(4);
    const stood = await call('snapshot');
    assert.equal(stood.character_postures.tim, 'standing');
    assert.equal(motorEpisodes(stood).length, 2);
    assert.equal(motorEpisodes(stood)[1].stimulus.observation_schema_id, 'it:concept/instruction-stand');
    assert.equal(stood.progress.objectives.find(objective => objective.objective_id === 'enforce-obedience').completed, false, 'One student cannot satisfy the three-student objective');
    await shot('wave-instructed-standing');
    report.instructedPosture = { realButtons: true, sitReceipt: receipt, noOpDidNotCount: true, sameGround: true, successfulEpisodes: 2, allStudentsStillRequired: true, mobileProjection: projection };
  } catch (error) {
    report.instructedPostureFailure = String(error);
    await shot('instructed-posture-failure');
    process.exitCode = 1;
    await call('set_viewport', { width: 1440, height: 900 });
  }

  try {
    await load('ideology');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.selectActor('ideologue');window.__INTENTION_TEST__.selectTarget('skeptic')`);
    await clickMode('observe');
    if (await evaluate(`document.querySelector('[data-testid="dialogue-hud"]').dataset.expanded==='false'`)) {
      await call('click', { selector: '[data-testid="dialogue-toggle"]' });
    }
    await clickCommand('reinforce-faith');
    await call('click', { selector: '[data-testid="step-tick"]' });
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{const text=document.querySelector('[data-testid="dialogue-hud"]').textContent;if(text.includes('命令没有可应用的效果')){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Rejected command reason was not visible'))}},50)})`);
    const rejected = await call('snapshot');
    assert.equal(rejected.progress.command_counts['reinforce-faith'] ?? 0, 0, 'Rejected UI command must not advance objectives');
    assert.equal(Object.values(rejected.characters.skeptic.mind_graph.nodes).some(node => node.schema_id === 'it:concept/ideology'), false, 'Rejected reinforcement cannot create a belief');
    await shot('ideology-real-command-rejection');
    report.commandRejection = { realButton: true, localizedReasonVisible: true, successfulCount: 0 };
  } catch (error) {
    report.commandRejectionFailure = String(error);
    await shot('command-rejection-failure');
    process.exitCode = 1;
  }

  try {
    await load('smart-cat');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
    // Regression: reselecting an already-active exclusive mode used to emit
    // null and leave the modal notebook intercepting all subsequent input.
    await clickMode('observe');
    await clickMode('observe');
    report.notebookFlow = { modeReselectionCloses: true, realClicks: true };
    const toolbar = await evaluate(`(()=>{const top=document.querySelector('[data-testid="game-topbar"]');return{height:top.getBoundingClientRect().height,buttons:[...top.querySelectorAll('button')].map(b=>({id:b.dataset.testid,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})),save:!!top.querySelector('[data-testid="save-menu-open"]')}})()`);
    assert.equal(toolbar.height, 60);
    assert.equal(toolbar.save, false, 'Save belongs inside the experiment menu, not topbar');
    assert.equal(toolbar.buttons.length, 4, 'Topbar has exactly four primary controls');
    for (const button of toolbar.buttons) assert.ok(button.width >= 44 && button.height >= 44, `${button.id} minimum touch target`);
    await call('click', { selector: '[data-testid="experiment-menu-open"]' });
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="save-menu-open"]')?.getClientRects().length`), true);
    await closeNotebook();
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="scene-item-"]').length`), 0, 'Item hotspots do not obscure the cast by default');
    await call('click', { selector: '[data-testid="scene-toggle-items"]' });
    assert.ok(await evaluate(`document.querySelectorAll('[data-testid^="scene-item-"]').length`) > 0, 'Players can reveal authored item hotspots');
    await call('click', { selector: '[data-testid="scene-toggle-items"]' });
    assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="scene-item-"]').length`), 0);
    await call('click', { selector: '[data-testid="scene-character-cat-billi"]' });
    const initial = await call('snapshot');
    assert.equal(initial.characters['cat-billi'].position.x, 400);
    await clickWorldX(460, .2); await waitPosition('cat-billi', 460, 300);
    await clickWorldX(520, .72); await waitPosition('cat-billi', 520, 300);
    await call('click', { selector: '[data-testid="scene-posture"]' });
    const sitting = await call('snapshot');
    assert.equal(sitting.character_postures['cat-billi'], 'sitting');
    assert.deepEqual(sitting.characters['cat-billi'].position, { x: 520, y: 300 });
    await shot('smart-cat-real-sitting');
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
    await clickMode('observe');
    await call('click', { selector: '[data-testid="scene-character-tim"]' });
    await call('click', { selector: '[data-testid="scene-posture"]' });
    assert.equal((await call('snapshot')).character_postures.tim, 'sitting');
    await shot('wave-real-sitting');
    const seatedArt = await rigEvidence('tim');
    assert.equal(seatedArt.pose, 'sitting', 'Tim displays the canonical articulated sitting pose');
    seatedArt.chairVisible = await evaluate(`(async()=>{const chair=document.querySelector('[data-testid="scene-chair-tim"]');if(chair)await chair.decode();const r=chair?.getBoundingClientRect();return !!chair&&chair.naturalWidth>0&&r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight})()`);
    assert.equal(seatedArt.chairVisible, true, 'Tim has a loaded visible chair');
    await clickWorldX(160, .2); await waitPosition('tim', 160, 300);
    const waveWalk = await call('snapshot');
    assert.equal(waveWalk.character_postures.tim, 'standing', 'Walking stands Tim up automatically');
    assert.deepEqual([...new Set(Object.values(waveWalk.characters).map(c => c.position.y))], [300], 'Walking keeps all classroom actors on one floor');
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="scene-chair-tim"]')`), false, 'Standing removes Tim’s chair');
    await shot('wave-standing-after-walk');
    report.sceneInteraction = { toolbar, sitting: sitting.characters['cat-billi'], wavePositions: Object.fromEntries(Object.entries(wave.characters).map(([id,c])=>[id,c.position])), waveSeatedArt: seatedArt, waveAfterWalk: waveWalk.characters.tim.position, passed: true };
  } catch (error) {
    report.sceneInteractionFailure = String(error); process.exitCode = 1;
    await shot('scene-interaction-failure');
  }

  try {
    report.articulatedHumans = [];
    for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      await call('set_viewport', { width: viewport.width, height: viewport.height });
      await load('the-wave');
      await evaluate(`window.__INTENTION_TEST__.setAutoStep(false);window.__INTENTION_TEST__.selectActor('tim')`);
      await clickMode('micro');
      await settle(`rig-${viewport.name}-standing`);
      const standing = await rigEvidence('tim');
      assert.equal(standing.pose, 'standing');
      await shot(`rig-${viewport.name}-standing`);
      const beforeCosmetic = await call('snapshot');
      await call('click', { selector: '[data-testid="scene-wardrobe"]' });
      const nextOutfit = await evaluate(`(()=>{const buttons=[...document.querySelectorAll('[data-testid^="scene-outfit-"]')];return (buttons.find(b=>b.dataset.testid==='scene-outfit-teacher'&&b.getAttribute('aria-pressed')!=='true')??buttons.find(b=>b.getAttribute('aria-pressed')!=='true'))?.dataset.testid})()`);
      assert.ok(nextOutfit, 'Wardrobe exposes a real alternative outfit');
      await call('click', { selector: `[data-testid="${nextOutfit}"]` });
      await settle(`rig-${viewport.name}-outfit`);
      const dressed = await rigEvidence('tim');
      assert.notEqual(dressed.outfit, standing.outfit);
      assert.notEqual(dressed.torsoSrc, standing.torsoSrc);
      assert.equal(dressed.headSrc, standing.headSrc, 'Changing clothes preserves the same identity head');
      assert.deepEqual(await call('snapshot'), beforeCosmetic, 'Cosmetics cannot mutate the authoritative world, graph, ticks or progress');
      await shot(`rig-${viewport.name}-outfit`);
      await call('click', { selector: '[data-testid="scene-wardrobe"]' });
      await call('click', { selector: '[data-testid="scene-posture"]' });
      await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().character_postures.tim==='sitting'&&document.querySelector('[data-testid="scene-character-rig-tim"]')?.dataset.pose==='sitting'){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Actual posture request did not finish'))}},20)})`);
      const sittingRig = await rigEvidence('tim');
      assert.equal(sittingRig.pose, 'sitting');
      await shot(`rig-${viewport.name}-sitting`);
      const beforeWalk = await call('snapshot');
      const walkingTarget = beforeWalk.characters.tim.position.x - 120;
      await clickWorldX(walkingTarget, .25);
      await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(document.querySelector('[data-testid="scene-character-rig-tim"]')?.dataset.pose==='walking'){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Real movement did not produce canonical walking pose'))}},10)})`);
      const walkingRig = await rigEvidence('tim');
      assert.equal(walkingRig.pose, 'walking');
      await shot(`rig-${viewport.name}-walking`);
      await waitPosition('tim', walkingTarget, 300, 1);
      const afterWalk = await call('snapshot');
      assert.equal(afterWalk.character_postures.tim, 'standing');
      assert.equal(afterWalk.characters.tim.position.y, beforeWalk.characters.tim.position.y);
      report.articulatedHumans.push({ viewport: viewport.name, standing, dressed, sitting: sittingRig, walking: walkingRig, before: beforeWalk.characters.tim.position, after: afterWalk.characters.tim.position });
    }
  } catch (error) {
    report.articulatedHumansFailure = String(error); process.exitCode = 1;
    await shot('articulated-humans-failure');
  }

  for (const roomViewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  const roomPrefix = roomViewport.name === 'mobile' ? 'mobile-' : '';
  try {
    await call('set_viewport', { width: roomViewport.width, height: roomViewport.height });
    await load('pavlov');
    await evaluate(`window.__INTENTION_TEST__.setAutoStep(false)`);
    await clickMode('micro');
    await call('click', { selector: '[data-testid="scene-character-pavlov"]' });
    assert.equal(await evaluate(`window.__itSceneDebug().actorId`), 'pavlov', 'Select Pavlov through his actual visible actor');
    const touchControl = async testId => {
      const target = await evaluate(`(()=>{const el=document.querySelector('[data-testid="${testId}"]'),r=el.getBoundingClientRect(),stage=document.querySelector('[data-testid="scene-viewport"]').getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{id:el.dataset.testid,rect:r.toJSON(),stage:stage.toJSON(),enabled:!el.disabled,hit:!!hit&&(hit===el||el.contains(hit))}})()`);
      assert.ok(target.enabled && target.hit, `${testId}: real enabled unobscured pointer target`);
      assert.ok(target.rect.width >= 44 && target.rect.height >= 44, `${testId}: minimum 44px touch target`);
      assert.ok(target.rect.left >= target.stage.left - 1 && target.rect.right <= target.stage.right + 1 && target.rect.top >= target.stage.top - 1 && target.rect.bottom <= target.stage.bottom + 1, `${testId}: whole control is visible inside scene`);
      return target;
    };
    const roomControls = { moveRight: await touchControl('scene-move-right'), moveLeft: await touchControl('scene-move-left') };
    const roomEvidence = async roomId => {
      await settle(`${roomPrefix}pavlov-room-${roomId}`);
      const world = await call('snapshot');
      assert.equal(world.character_rooms.pavlov, roomId);
      const visible = await evaluate(`(()=>({characters:[...document.querySelectorAll('[data-testid^="scene-character-"]')].filter(el=>el.tagName==='BUTTON').map(el=>el.dataset.testid.slice('scene-character-'.length)),items:[...document.querySelectorAll('[data-testid^="scene-item-"]')].map(el=>el.dataset.testid.slice('scene-item-'.length)),background:{src:document.querySelector('[data-testid="scene-background"]').currentSrc,loaded:document.querySelector('[data-testid="scene-background"]').naturalWidth>0}}))()`);
      const firstRoom = world.scene.rooms[0].id;
      const strip = new Set([roomId]);
      for (let changed = true; changed;) {
        changed = false;
        for (const portal of world.scene.portals ?? []) {
          if (strip.has(portal.from_room) || strip.has(portal.to_room)) {
            for (const id of [portal.from_room, portal.to_room]) if (!strip.has(id)) { strip.add(id); changed = true; }
          }
        }
      }
      assert.deepEqual(visible.characters.sort(), Object.keys(world.characters).filter(id => strip.has(world.character_rooms[id] ?? firstRoom)).sort(), 'Connected-strip actors remain rendered; disconnected-room actors are excluded');
      await evaluate(`new Promise(resolve=>setTimeout(resolve,180))`);
      visible.projection = await evaluate(`(()=>{const stage=document.querySelector('[data-testid="scene-viewport"]'),r=stage.getBoundingClientRect(),d=window.__itSceneDebug();return{clipping:getComputedStyle(stage).overflow,actors:[...stage.querySelectorAll('button[data-testid^="scene-character-"]')].map(actor=>{const a=actor.getBoundingClientRect();return{id:actor.dataset.testid.slice('scene-character-'.length),actualX:a.left+a.width/2-r.left,expectedX:Number(actor.dataset.worldX)*d.scale+d.cameraX}})}})()`);
      assert.equal(visible.projection.clipping, 'hidden', 'World strip is clipped by the actual scene viewport');
      for (const actor of visible.projection.actors) assert.ok(Math.abs(actor.actualX - actor.expectedX) < 1, `${actor.id}: connected actors use global world positions, never clamp to screen edges`);
      await call('click', { selector: '[data-testid="scene-toggle-items"]' });
      const hotspots = await evaluate(`[...document.querySelectorAll('button[data-testid^="scene-item-"]')].map(el=>el.dataset.testid.slice('scene-item-'.length))`);
      const localItems = Object.values(world.items).filter(item => !item.owner_id && strip.has(world.item_rooms[item.id] ?? firstRoom));
      assert.ok(hotspots.every(id => localItems.some(item => item.id === id)), 'Every displayed item hotspot belongs to the connected room strip');
      assert.equal(hotspots.length > 0, localItems.length > 0, 'Connected-strip items remain available through real item controls');
      await call('click', { selector: '[data-testid="scene-toggle-items"]' });
      visible.items = hotspots;
      assert.ok(visible.background.loaded);
      const manifest = await evaluate(`fetch('/mods/gpt-image-2-pack/manifest.json').then(r=>r.json())`);
      const expected = manifest.backgrounds[world.scene.rooms.find(room => room.id === roomId).background_key];
      assert.equal(new URL(visible.background.src).pathname, new URL(expected, 'http://localhost').pathname);
      visible.backgrounds = await evaluate(`[...document.querySelectorAll('img[data-room-id]')].map(img=>({room:img.dataset.roomId,src:img.currentSrc,loaded:img.complete&&img.naturalWidth>0}))`);
      assert.deepEqual(visible.backgrounds.map(bg=>bg.room).sort(), [...strip].sort(), 'Each connected room has one background, with disconnected rooms excluded');
      for (const bg of visible.backgrounds) {
        assert.ok(bg.loaded, `${bg.room}: connected background decoded`);
        const room = world.scene.rooms.find(room => room.id === bg.room);
        assert.equal(new URL(bg.src).pathname, new URL(manifest.backgrounds[room.background_key], 'http://localhost').pathname);
      }
      await shot(`${roomPrefix}pavlov-room-${roomId}`);
      return { world, visible };
    };
    const lab = await roomEvidence('lab');
    await shot(`${roomPrefix}pavlov-room-initial-lab`);
    // Approach using the same real movement controls as a player, not snapshot edits.
    while ((await call('snapshot')).characters.pavlov.position.x < 760) {
      const x = (await call('snapshot')).characters.pavlov.position.x;
      await call('click', { selector: '[data-testid="scene-move-right"]' });
      await waitPosition('pavlov', x + 28, 300);
    }
    const beforeCross = await call('snapshot');
    await shot(`${roomPrefix}pavlov-room-before-crossing`);
    const seamCamera = () => evaluate(`(()=>{const d=window.__itSceneDebug(),w=window.__INTENTION_TEST__.state();return{cameraX:d.cameraX,scale:d.scale,x:w.characters.pavlov.position.x,room:w.character_rooms.pavlov}})()`);
    const beforeSeamCamera = await seamCamera();
    roomControls.enterPantry = await touchControl('scene-portal-lab_pantry');
    await call('click', { selector: '[data-testid="scene-portal-lab_pantry"]' });
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().character_rooms.pavlov==='pantry'){clearInterval(timer);resolve(true)}else if(++n>200){clearInterval(timer);reject(new Error('Real portal walk failed'))}},50)})`);
    const pantry = await roomEvidence('pantry');
    assert.equal(pantry.world.characters.pavlov.position.y, 300, 'Entering pantry preserves authored ground floor');
    const afterSeamCamera = await seamCamera();
    assert.equal(afterSeamCamera.scale, beforeSeamCamera.scale, 'Crossing a room seam preserves world scale');
    assert.ok(Math.abs(afterSeamCamera.cameraX - beforeSeamCamera.cameraX) <= Math.abs(afterSeamCamera.x - beforeSeamCamera.x) * beforeSeamCamera.scale + 1, 'Seam camera displacement is bounded by actual horizontal travel, not a room-width jump');
    const invariant = world => ({ tick: world.tick, progress: world.progress, minds: Object.fromEntries(Object.entries(world.characters).map(([id,c])=>[id,c.mind_graph])), characters: Object.keys(world.characters).sort(), items: Object.keys(world.items).sort() });
    assert.deepEqual(invariant(pantry.world), invariant(beforeCross), 'Room crossing preserves tick, complete minds, progress and entity counts');
    if (roomViewport.name === 'mobile') {
      // The ladder's global x=1200 lies offscreen after entering the pantry.
      // Walk with real 28-unit buttons until it is reachable, not an offscreen
      // pointer click or an injected position. Traversal itself snaps to 1200.
      while ((await call('snapshot')).characters.pavlov.position.x < 1172) {
        const x = (await call('snapshot')).characters.pavlov.position.x;
        await call('click', { selector: '[data-testid="scene-move-right"]' });
        await waitPosition('pavlov', x + 28, 300);
      }
    } else {
      await clickWorldX(1200, .25); await waitPosition('pavlov', 1200, 300, 1);
    }
    roomControls.ladderUp = await touchControl('scene-traverse');
    await call('click', { selector: '[data-testid="scene-traverse"]' });
    await waitPosition('pavlov', 1200, 180);
    const ladderUp = await call('snapshot');
    assert.equal(ladderUp.character_rooms.pavlov, 'pantry');
    assert.deepEqual(invariant(ladderUp), invariant(beforeCross), 'Ladder ascent preserves ticks, complete minds, progress and entities');
    await shot(`${roomPrefix}pavlov-pantry-real-ladder-up`);
    roomControls.ladderDown = await touchControl('scene-traverse');
    await call('click', { selector: '[data-testid="scene-traverse"]' });
    await waitPosition('pavlov', 1200, 300);
    const ladderDown = await call('snapshot');
    assert.equal(ladderDown.character_rooms.pavlov, 'pantry');
    assert.deepEqual(invariant(ladderDown), invariant(beforeCross), 'Ladder descent preserves ticks, complete minds, progress and entities');
    await shot(`${roomPrefix}pavlov-pantry-real-ladder-down`);
    const beforeReturnCamera = await seamCamera();
    roomControls.returnLab = await touchControl('scene-portal-lab_pantry');
    await call('click', { selector: '[data-testid="scene-portal-lab_pantry"]' });
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().character_rooms.pavlov==='lab'){clearInterval(timer);resolve(true)}else if(++n>300){clearInterval(timer);reject(new Error('Real return portal walk failed'))}},50)})`);
    const returned = await roomEvidence('lab');
    assert.equal(returned.world.characters.pavlov.position.y, 300, 'Returning to lab preserves authored ground floor');
    await shot(`${roomPrefix}pavlov-room-returned-lab`);
    const afterReturnCamera = await seamCamera();
    assert.equal(afterReturnCamera.scale, beforeReturnCamera.scale);
    assert.ok(Math.abs(afterReturnCamera.cameraX - beforeReturnCamera.cameraX) <= Math.abs(afterReturnCamera.x - beforeReturnCamera.x) * beforeReturnCamera.scale + 1, 'Return camera displacement is bounded by actual horizontal travel');
    assert.deepEqual(invariant(returned.world), invariant(beforeCross), 'Portal round trip and ladder traversal never reset simulation');
    assert.deepEqual(invariant(returned.world), invariant(lab.world), 'Normal actor selection, approach, both crossings and ladder preserve all simulation learning');
    report[roomViewport.name === 'mobile' ? 'mobileMultipleRooms' : 'multipleRooms'] = { viewport: roomViewport, lab, beforeCross, pantry, returned, ladderUp: ladderUp.characters.pavlov.position, ladderDown: ladderDown.characters.pavlov.position, beforeSeamCamera, afterSeamCamera, beforeReturnCamera, afterReturnCamera, roomControls, realActorSelection: true, realPortalClicks: true, realLadderClicks: true, passed: true };
  } catch (error) {
    report[roomViewport.name === 'mobile' ? 'mobileMultipleRooms' : 'multipleRooms'] = { passed: false, error: String(error) }; process.exitCode = 1;
    await shot(`${roomPrefix}multiple-rooms-failure`);
  }
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
      const roomGeometry = await evaluate(`(()=>{const bg=document.querySelector('[data-testid="scene-background"]'),stage=document.querySelector('[data-testid="scene-viewport"]'),debug=window.__itBgDebug();const rect=bg.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();return {backgroundTop:rect.top-stageRect.top,floor:rect.top-stageRect.top+debug.metadata.floorY*rect.width/debug.metadata.width,ground:debug.floorY}})()`);
      assert.ok(roomGeometry.backgroundTop <= 60.01, 'One authored room covers the area below the topbar without repeated scenery');
      assert.ok(Math.abs(roomGeometry.floor - roomGeometry.ground) < .1, 'Background floor aligns with the scene ground');
      if (viewport.name !== 'desktop' && level === 'pavlov') {
        const touchTargets = await evaluate(`[...document.querySelector('[data-testid="game-topbar"]').querySelectorAll('button')].map(b=>({id:b.dataset.testid,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))`);
        for (const button of touchTargets) assert.ok(button.width >= 44 && button.height >= 44, `${viewport.name} ${button.id} minimum touch target`);
        await call('click', { selector: '[data-testid="scene-character-pavlov"]' });
        const beforeMove = (await call('snapshot')).characters.pavlov.position;
        await call('click', { selector: '[data-testid="scene-move-right"]' });
        await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.__INTENTION_TEST__.state().characters.pavlov.position.x>${beforeMove.x}){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(new Error('Mobile real movement did not update'))}},50)})`);
        const afterMove = (await call('snapshot')).characters.pavlov.position;
        assert.ok(afterMove.x > beforeMove.x, 'Mobile movement changes x');
        assert.equal(afterMove.y, beforeMove.y, 'Mobile movement preserves authored floor y');
        assert.equal(afterMove.y, 300, 'Mobile movement remains on the ground platform');
        (report.mobileInteraction ??= []).push({ viewport: viewport.name, touchTargets, beforeMove, afterMove, passed: true });
        await shot(`${viewport.name}-real-movement`);
      }
      await evaluate(`window.__INTENTION_TEST__.setUiMode('graph')`);
      await shot(`${viewport.name}-${level}-graph`);
      const scene = await evaluate(`(()=>({viewport:{width:innerWidth,height:innerHeight},characters:[...document.querySelectorAll('[data-testid^="scene-character-sprite-"]')].map(img=>({id:img.dataset.testid,src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,assetMissing:img.closest('button')?.dataset.assetMissing,rect:img.getBoundingClientRect().toJSON()})),overflow:document.documentElement.scrollWidth>innerWidth+1}))()`);
      const assetFailures = [];
      if (!scene.characters.length) assetFailures.push('No real character sprites');
      for (const character of scene.characters) {
        if (!character.width || !character.height || character.assetMissing === 'true') assetFailures.push(`Missing authored sprite: ${character.id}`);
      }
      const rigParts = await evaluate(`[...document.querySelectorAll('[data-rig-part]')].map(img=>({part:img.dataset.rigPart,src:img.currentSrc,complete:img.complete,width:img.naturalWidth,height:img.naturalHeight}))`);
      for (const part of rigParts) {
        if (!part.complete || !part.width || !part.height) assetFailures.push(`Missing articulated body part: ${part.part} ${part.src}`);
      }
      scene.rigParts = rigParts;
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
