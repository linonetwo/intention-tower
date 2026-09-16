import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const endpoint = process.env.MCP_URL ?? 'http://127.0.0.1:9222/mcp';
let sequence = 1;

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
  if (levelId === 'pavlov') {
    // The dog starts below its hunger threshold. Let the physiological state
    // become trainable before alternating bell and food commands.
    for (let tick = 0; tick < 40; tick += 1) await call('step_tick');
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
}

await call('health');
const levelsRoot = resolve('assets/levels');
const levelIds = (await readdir(levelsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (levelIds.length !== 21) throw new Error(`expected 21 levels, found ${levelIds.length}`);
for (const levelId of levelIds) await playLevel(levelId);
console.log(`MCP verified all ${levelIds.length} levels`);
