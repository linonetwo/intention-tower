import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = process.env.MCP_URL ?? 'http://127.0.0.1:9222/mcp';
let sequence = 1;
const results = [];

async function call(name, args = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: sequence++,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const envelope = await response.json();
  if (envelope.error) throw new Error(`${name}: ${envelope.error.message}`);
  const text = envelope.result?.content?.find((item) => item.type === 'text')?.text;
  if (text == null) throw new Error(`${name}: missing text result`);
  return JSON.parse(text);
}

function collectCommandRequirements(condition, output) {
  if (!condition || typeof condition !== 'object') return;
  if (condition.type === 'commandUsed') {
    const existing = output.get(condition.commandId) ?? { minCount: 0, distinctTargets: 0 };
    existing.minCount = Math.max(existing.minCount, condition.minCount ?? 1);
    existing.distinctTargets = Math.max(existing.distinctTargets, condition.distinctTargets ?? 0);
    output.set(condition.commandId, existing);
  }
  for (const child of condition.conditions ?? []) collectCommandRequirements(child, output);
}

async function findTarget(world, commandId, actorId, distinctTargets) {
  const command = world.command_defs.find((candidate) => candidate.command_id === commandId);
  if (!command) throw new Error(`${world.level_id}: missing ${commandId}`);
  if (command.targeting === 'NoTarget') {
    const available = await call('list_commands', { actor_id: actorId });
    return available.some((candidate) => candidate.command_id === commandId) ? null : undefined;
  }

  const used = new Set(world.progress.command_targets[commandId] ?? []);
  const ids = Object.keys(world.characters);
  const candidates = [
    world.default_target_id,
    ...ids.filter((id) => id !== actorId),
    actorId,
  ].filter((id, index, all) => id && all.indexOf(id) === index);

  for (const targetId of candidates) {
    if (distinctTargets > 0 && used.has(targetId)) continue;
    const available = await call('list_commands', { actor_id: actorId, target_id: targetId });
    if (available.some((candidate) => candidate.command_id === commandId)) return targetId;
  }
  // Once the distinct quota is met, reusing the semantically valid default is fine.
  if (used.size >= distinctTargets) {
    for (const targetId of candidates) {
      const available = await call('list_commands', { actor_id: actorId, target_id: targetId });
      if (available.some((candidate) => candidate.command_id === commandId)) return targetId;
    }
  }
  return undefined;
}

async function playLevel(levelId) {
  await call('load_level', { level_id: levelId });
  await call('set_time_speed', { speed: 0 });
  if (levelId === 'gosling') {
    const execute = command_id => call('execute_command', { command_id, actor_id: 'lorenz', target_id: 'gosling' });
    const advance = async count => { for (let tick = 0; tick < count; tick++) await call('step_tick'); };
    const initial = await call('snapshot');
    if (initial.characters.gosling.mind_graph.nodes['gosling-imprint-target'].motivation.imprinting_evidence) throw new Error('gosling: initial wiring is not newly acquired imprint evidence');
    await execute('approach-gosling'); await advance(1);
    const acquired = await call('snapshot');
    const imprint = acquired.characters.gosling.mind_graph.nodes['gosling-imprint-target'].motivation;
    if (imprint.target_entity !== 'it:entity/lorenz' || imprint.imprinting_evidence?.dopamine_spent !== 0.2) throw new Error('gosling: actual entity imprint acquisition missing');
    await execute('move-away'); await advance(1);
    const separated = await call('snapshot');
    if (!(separated.characters.lorenz.position.x < acquired.characters.lorenz.position.x)) throw new Error('gosling: move-away did not move the real target');
    await advance(12);
    const followed = await call('snapshot');
    const evidence = followed.characters.gosling.mind_graph.nodes['gosling-imprint-target'].motivation.imprinting_evidence;
    const distance = world => Math.hypot(world.characters.gosling.position.x - world.characters.lorenz.position.x, world.characters.gosling.position.y - world.characters.lorenz.position.y);
    if (followed.progress.status !== 'Won' || !(distance(followed) < distance(separated) && distance(followed) <= 80 && evidence.followed_distance >= 80 && evidence.follow_ticks >= 3 && evidence.max_separation_distance >= 210)) throw new Error('gosling: real fixed-entity following did not satisfy outcomes');
    results.push({ levelId, tick: followed.tick, status: followed.progress.status, imprinting: evidence, separation: distance(separated), finalDistance: distance(followed) });
    console.log(`MCP verified gosling with real entity acquisition and movement in ${followed.tick} ticks`);
    return;
  }
  if (levelId === 'smart-cat') {
    const execute = command_id => call('execute_command', { command_id, actor_id: 'trainer', target_id: 'cat-billi' });
    const advance = async count => { for (let tick = 0; tick < count; tick++) await call('step_tick'); };
    await execute('show-button'); await advance(1);
    for (let trial = 0; trial < 3; trial++) {
      await execute('demonstrate-press'); await advance(1);
      if (trial === 0) {
        const available = await call('list_commands', { actor_id: 'trainer', target_id: 'cat-billi' });
        if (available.some(command => command.command_id === 'feed-after-press')) throw new Error('smart-cat: untrained demonstration falsely selected a cat action');
      }
      await execute('feed'); await advance(1); await advance(11);
    }
    for (let trial = 0; trial < 3; trial++) {
      await execute('demonstrate-press'); await advance(2);
      const selected = (await call('snapshot')).characters['cat-billi'].mind_graph.nodes['cat-press-button'];
      if (!(selected.active && selected.attended && selected.action?.selected && selected.value >= 0.3)) throw new Error('smart-cat: contingent food lacks genuinely selected learned action');
      await execute('feed-after-press'); await advance(1);
    }
    const trained = await call('snapshot');
    const edges = Object.values(trained.characters['cat-billi'].mind_graph.edges);
    if (trained.progress.status !== 'Won' || !edges.some(edge => edge.learnable && edge.learn_type === 'Operant' && edge.weight > 0)) throw new Error('smart-cat: actual operant learning did not win');
    results.push({ levelId, tick: trained.tick, status: trained.progress.status, learningEdges: edges.filter(edge => edge.learnable) });
    console.log(`MCP verified smart-cat with actual conditioned and selected-action reward in ${trained.tick} ticks`);
    return;
  }
  if (levelId === 'pavlov') {
    const execute = command_id => call('execute_command', { command_id, actor_id: 'pavlov', target_id: 'dog' });
    const advance = async count => { for (let tick = 0; tick < count; tick++) await call('step_tick'); };
    for (let trial = 0; trial < 5; trial++) {
      await execute('ring-bell'); await advance(1);
      await execute('feed'); await advance(11);
    }
    await execute('ring-bell'); await advance(11);
    const trained = await call('snapshot');
    if (trained.progress.status !== 'Won') throw new Error('pavlov: real independent conditioned response did not win');
    results.push({ levelId, tick: trained.tick, status: trained.progress.status, conditioning: trained.characters.dog.mind_graph.conditioning_stats });
    console.log(`MCP verified pavlov with paired training and independent bell in ${trained.tick} ticks`);
    return;
  }
  let world = await call('snapshot');
  const actorId = world.default_actor_id ?? Object.keys(world.characters)[0];
  if (!actorId) throw new Error(`${levelId}: no playable actor`);

  const requirements = new Map();
  for (const objective of world.progress.objectives.filter((candidate) => candidate.required)) {
    collectCommandRequirements(objective.condition, requirements);
  }
  if (requirements.size === 0) throw new Error(`${levelId}: no command-backed objectives`);

  for (let round = 0; round < 40 && world.progress.status === 'InProgress'; round += 1) {
    let executed = false;
    for (const [commandId, requirement] of requirements) {
      const count = world.progress.command_counts[commandId] ?? 0;
      const distinctCount = (world.progress.command_targets[commandId] ?? []).length;
      if (count >= requirement.minCount && distinctCount >= requirement.distinctTargets) continue;

      const targetId = await findTarget(world, commandId, actorId, requirement.distinctTargets);
      if (targetId === undefined) {
        throw new Error(`${levelId}: no valid target for ${commandId} at round ${round}`);
      }
      await call('execute_command', {
        command_id: commandId,
        actor_id: actorId,
        ...(targetId == null ? {} : { target_id: targetId }),
      });
      await call('step_tick');
      executed = true;
      world = await call('snapshot');
      if (world.progress.status !== 'InProgress') break;
    }

    if (!executed && world.progress.status === 'InProgress') {
      if (levelId === 'pavlov') {
        // Feeding lowers hunger by design; recovery time is part of this level,
        // not a reason to spam another command immediately.
        for (let tick = 0; tick < 50; tick += 1) await call('step_tick');
        world = await call('snapshot');
      }
      if (world.progress.status !== 'InProgress') break;
      // A physical predicate may need another reinforcement after the minimum
      // command count. Only repeat commands belonging to incomplete objectives.
      const reinforcement = new Set();
      for (const objective of world.progress.objectives.filter((candidate) => !candidate.completed)) {
        const local = new Map();
        collectCommandRequirements(objective.condition, local);
        for (const commandId of local.keys()) reinforcement.add(commandId);
      }
      if (reinforcement.size === 0) {
        throw new Error(`${levelId}: incomplete objective has no executable route`);
      }
      for (const commandId of reinforcement) {
        const requirement = requirements.get(commandId);
        if (requirement) requirement.minCount += 1;
      }
    }
  }

  if (world.progress.status !== 'Won') {
    const incomplete = world.progress.objectives
      .filter((objective) => !objective.completed)
      .map((objective) => objective.objective_id);
    throw new Error(`${levelId}: status=${world.progress.status}, incomplete=${incomplete.join(',')}`);
  }
  console.log(`MCP verified ${levelId} in ${world.tick} ticks`);
  results.push({ levelId, tick: world.tick, status: world.progress.status });
}

await call('health');
const levelsRoot = resolve('assets/levels');
const levelIds = (await readdir(levelsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (levelIds.length !== 21) throw new Error(`expected 21 levels, found ${levelIds.length}`);
await mkdir('verification-evidence', { recursive: true });
try {
  for (const levelId of levelIds) await playLevel(levelId);
} finally {
  await writeFile('verification-evidence/all-levels.json', JSON.stringify({ expectedLevels: levelIds.length, results }, null, 2));
}
console.log(`MCP verified all ${levelIds.length} levels`);
