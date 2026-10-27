import assert from 'node:assert/strict';

// Shared real-action route. Drivers may use MCP movement or actual DOM controls;
// neither can replace actor positions or fabricate causal evidence.
export async function layeredRoute({ snapshot, walk, command, available, checkpoint = async () => {}, negative = async () => {} }) {
  const initial = await snapshot(), actor = initial.default_actor_id;
  const config = initial.scene.layered_world;
  assert.ok(config && config.contexts.length === 3);
  const state = world => world.layered_world[actor];
  const need = world => Object.values(world.characters[actor].mind_graph.nodes).find(n => n.schema_id === config.need_schema_id).value;
  const originalNodes = Object.keys(initial.characters[actor].mind_graph.nodes);
  const originalEdges = initial.characters[actor].mind_graph.edges;
  const observations = {};
  const visit = async label => {
    const world = await snapshot();
    assert.equal(world.characters[actor].position.y, 300);
    assert.equal(world.characters[actor].id, initial.characters[actor].id);
    for (const id of originalNodes) assert.ok(world.characters[actor].mind_graph.nodes[id], `Persistent graph node ${id}`);
    for (const [id, edge] of Object.entries(originalEdges)) {
      const current = world.characters[actor].mind_graph.edges[id];
      assert.ok(current, `Persistent graph edge ${id}`);
      assert.equal(current.source_instance_id, edge.source_instance_id);
      assert.equal(current.target_instance_id, edge.target_instance_id);
    }
    for (const [context, observation] of Object.entries(observations)) assert.deepEqual(state(world).observations[context], observation, 'Historical observation provenance remains immutable');
    await checkpoint(label, world);
    return world;
  };
  const near = async id => { const world = await snapshot(); await walk(world.items[id].position.x); };
  const absent = async (id, reason) => { assert.ok(!(await available()).some(c => c.command_id === id), reason); await negative(id, reason); assert.notEqual((await snapshot()).progress.status, 'Won'); };
  await absent('enter-vr', 'far terminal entry');
  await absent('compare-layers', 'early comparison');
  await visit('reality-arrival');
  await near(config.meal_item_id); await absent('satisfy-real-need', 'early real meal');
  const saved = [];
  for (let depth = 0; depth < config.contexts.length; depth++) {
    const context = config.contexts[depth];
    await near(context.cue_item_id);
    await command('examine-reality');
    let world = await visit(`${context.id}-observed`);
    const observation = state(world).observations[context.id];
    assert.equal(observation.item_id, context.cue_item_id);
    assert.equal(observation.fact, context.cue_fact);
    assert.equal(observation.depth, depth);
    assert.equal(observation.room_id, world.item_rooms[context.cue_item_id]);
    assert.equal(observation.is_virtual, depth > 0);
    assert.ok(world.characters[actor].mind_graph.nodes[observation.id]);
    observations[context.id] = observation;
    if (depth > 0) {
      const before = need(world);
      await command('earn-virtual-reward'); world = await snapshot();
      assert.equal(need(world), before, 'Virtual points cannot relieve physical hunger');
      assert.equal(state(world).rewards[context.id], 1);
      assert.notEqual(world.progress.status, 'Won', 'Reward alone never wins');
    }
    if (context.entry_item_id) {
      await near(context.entry_item_id);
      world = await snapshot();
      saved.push({ context: context.id, room: world.character_rooms[actor], position: world.characters[actor].position });
      await command('enter-vr');
      world = await visit(`${config.contexts[depth + 1].id}-arrival`);
      assert.equal(state(world).stack.length, depth + 1);
      assert.equal(state(world).context_id, config.contexts[depth + 1].id);
    }
  }
  await absent('enter-vr', 'third layer entry');
  await command('compare-layers');
  let world = await visit('comparison');
  assert.deepEqual(state(world).comparison.observation_ids, config.contexts.map(c => state(world).observations[c.id].id));
  assert.notEqual(world.progress.status, 'Won');
  for (let depth = config.contexts.length - 1; depth > 0; depth--) {
    await near(config.contexts[depth].return_item_id);
    await command('exit-vr');
    world = await visit(`${config.contexts[depth - 1].id}-returned`);
    const parent = saved[depth - 1];
    assert.equal(state(world).context_id, parent.context);
    assert.equal(state(world).stack.length, depth - 1);
    assert.equal(world.character_rooms[actor], parent.room);
    assert.deepEqual(world.characters[actor].position, parent.position, 'One-level unwind restores saved parent position');
    assert.notEqual(world.progress.status, 'Won');
  }
  await near(config.meal_item_id);
  const before = await snapshot();
  await command('satisfy-real-need');
  world = await visit('real-meal-won');
  assert.equal(world.items[config.meal_item_id].quantity, before.items[config.meal_item_id].quantity - 1);
  assert.ok(need(before) - need(world) >= .5);
  assert.ok(need(world) <= config.need_max);
  assert.equal(state(world).unwind_count, 2);
  assert.equal(state(world).max_depth, 2);
  assert.equal(state(world).transitions.length, 4);
  assert.ok(state(world).need_receipt);
  assert.equal(world.progress.status, 'Won');
  return world;
}
