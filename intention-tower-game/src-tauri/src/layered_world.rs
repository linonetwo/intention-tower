//! Opt-in actor-local layered spaces. History is stored as causal receipts, never command counts.
use crate::models::{
    commands::CommandEffect,
    events::WorldEvent,
    mind_node::*,
    world_state::{Position, WorldState},
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LayerContext {
    pub id: String,
    pub room_ids: Vec<String>,
    pub arrival: Position,
    pub arrival_room: String,
    pub entry_item_id: Option<String>,
    pub return_item_id: Option<String>,
    pub cue_item_id: String,
    pub cue_fact: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LayeredConfig {
    pub actor_ids: Vec<String>,
    /// Ordered root-to-leaf; a terminal in context N enters context N+1 only.
    pub contexts: Vec<LayerContext>,
    pub interaction_range: f64,
    pub need_schema_id: String,
    pub meal_item_id: String,
    pub need_relief: f64,
    pub need_max: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnFrame {
    pub context_id: String,
    pub room_id: String,
    pub position: Position,
    pub entered_at_tick: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerObservation {
    pub sequence: u64,
    pub id: String,
    pub context_id: String,
    pub room_id: String,
    pub item_id: String,
    pub fact: String,
    pub depth: u8,
    pub is_virtual: bool,
    pub observed_at_tick: u64,
    pub position: Position,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerComparison {
    pub sequence: u64,
    pub observation_ids: Vec<String>,
    pub compared_at_tick: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeedReceipt {
    pub sequence: u64,
    pub item_id: String,
    pub before: f64,
    pub after: f64,
    pub satisfied_at_tick: u64,
    pub room_id: String,
    pub position: Position,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerTransition {
    pub sequence: u64,
    pub kind: String,
    pub from_context_id: String,
    pub to_context_id: String,
    pub from_room: String,
    pub to_room: String,
    pub from_position: Position,
    pub to_position: Position,
    pub at_tick: u64,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LayeredState {
    #[serde(default)]
    pub next_sequence: u64,
    pub context_id: String,
    pub stack: Vec<ReturnFrame>,
    pub observations: HashMap<String, LayerObservation>,
    pub comparison: Option<LayerComparison>,
    pub max_depth: u8,
    pub unwind_count: u32,
    pub need_receipt: Option<NeedReceipt>,
    pub rewards: HashMap<String, u32>,
    #[serde(default)]
    pub transitions: Vec<LayerTransition>,
    #[serde(default)]
    pub legacy_virtual_context_stack: Vec<String>,
    #[serde(default)]
    pub legacy_in_virtual_context: bool,
}

pub fn context<'a>(world: &'a WorldState, actor: &str) -> Option<(&'a str, u8)> {
    world
        .layered_world
        .get(actor)
        .map(|s| (s.context_id.as_str(), s.stack.len() as u8))
        .or_else(|| {
            world.scene.layered_world.as_ref().and_then(|config| {
                config
                    .contexts
                    .iter()
                    .enumerate()
                    .find(|(_, c)| {
                        c.room_ids
                            .iter()
                            .any(|r| world.entity_room(actor) == Some(r.as_str()))
                    })
                    .map(|(d, c)| (c.id.as_str(), d as u8))
            })
        })
}
pub fn depth(world: &WorldState, actor: &str) -> u8 {
    context(world, actor)
        .map(|(_, d)| d)
        .unwrap_or_else(|| world.virtual_context_stack.len().min(255) as u8)
}
pub fn initialize(world: &mut WorldState) {
    let Some(config) = world.scene.layered_world.clone() else {
        return;
    };
    for id in &config.actor_ids {
        if !world.layered_world.contains_key(id) {
            for objective in &mut world.progress.objectives {
                if refers_to_actor(&objective.condition, id) {
                    objective.completed = false;
                    objective.completed_at_tick = None;
                    if world.progress.status == crate::models::progress::LevelStatus::Won {
                        world.progress.status = crate::models::progress::LevelStatus::InProgress;
                        world.progress.completed_at_tick = None;
                        world.progress.outcome_label = None;
                    }
                }
            }
            // Legacy flags are archival only, not evidence of any visit or observation.
            world.layered_world.insert(
                id.clone(),
                LayeredState {
                    context_id: config.contexts[0].id.clone(),
                    legacy_virtual_context_stack: world.virtual_context_stack.clone(),
                    legacy_in_virtual_context: world.in_virtual_context,
                    ..Default::default()
                },
            );
            let root = &config.contexts[0];
            if !root
                .room_ids
                .iter()
                .any(|r| world.entity_room(id) == Some(r.as_str()))
            {
                if let Some(c) = world.characters.get_mut(id) {
                    c.position = root.arrival.clone();
                }
                world
                    .character_rooms
                    .insert(id.clone(), root.arrival_room.clone());
            }
        }
    }
    sync_legacy(world);
}
fn refers_to_actor(condition: &crate::models::progress::LevelCondition, actor: &str) -> bool {
    use crate::models::progress::LevelCondition;
    match condition {
        LevelCondition::LayeredJourney { character_id, .. } => character_id == actor,
        LevelCondition::All { conditions } | LevelCondition::Any { conditions } => {
            conditions.iter().any(|c| refers_to_actor(c, actor))
        }
        _ => false,
    }
}
fn sync_legacy(world: &mut WorldState) {
    if let Some(state) = world
        .default_actor_id
        .as_ref()
        .and_then(|id| world.layered_world.get(id))
    {
        world.in_virtual_context = !state.stack.is_empty();
        world.virtual_context_stack = state.stack.iter().map(|f| f.context_id.clone()).collect();
    }
}
fn observation_id(actor: &str, context: &str) -> String {
    format!("layer-observation:{actor}:{context}")
}
fn near(world: &WorldState, actor: &str, item: &str, range: f64) -> bool {
    world.same_room(actor, item)
        && world
            .entity_position(actor)
            .zip(world.entity_position(item))
            .is_some_and(|(a, b)| (a.x - b.x).abs() <= range)
}
fn valid_comparison(state: &LayeredState, config: &LayeredConfig) -> bool {
    state.comparison.as_ref().is_some_and(|c| {
        c.observation_ids.len() == config.contexts.len()
            && config.contexts.iter().all(|ctx| {
                state.observations.get(&ctx.id).is_some_and(|o| {
                    c.observation_ids.contains(&o.id) && o.observed_at_tick <= c.compared_at_tick
                })
            })
    })
}
pub fn evidence(world: &WorldState, actor: &str, complete: bool) -> bool {
    let Some(config) = world.scene.layered_world.as_ref() else {
        return false;
    };
    let Some(state) = world.layered_world.get(actor) else {
        return false;
    };
    let journey =
        state.max_depth as usize == config.contexts.len() - 1 && valid_comparison(state, config);
    journey
        && (!complete
            || (state.stack.is_empty()
                && state.context_id == config.contexts[0].id
                && state.unwind_count >= (config.contexts.len() - 1) as u32
                && state
                    .need_receipt
                    .as_ref()
                    .is_some_and(|r| r.before - r.after >= 0.5 && r.after <= config.need_max)
                && world.characters.get(actor).is_some_and(|c| {
                    c.mind_graph
                        .nodes
                        .values()
                        .any(|n| n.schema_id == config.need_schema_id && n.value <= config.need_max)
                })))
}

pub fn apply(
    world: &mut WorldState,
    actor: &str,
    target: Option<&str>,
    effect: &CommandEffect,
) -> Result<(), &'static str> {
    let config = world
        .scene
        .layered_world
        .clone()
        .ok_or("layered_world_unconfigured")?;
    if !config.actor_ids.iter().any(|id| id == actor) || !world.characters.contains_key(actor) {
        return Err("layered_actor_invalid");
    }
    if target.is_some_and(|id| id != actor) {
        return Err("layered_target_invalid");
    }
    let mut state = world
        .layered_world
        .get(actor)
        .cloned()
        .ok_or("layered_actor_uninitialized")?;
    let d = state.stack.len();
    let ctx = &config.contexts[d];
    let sequence = state
        .next_sequence
        .checked_add(1)
        .ok_or("layer_sequence_exhausted")?;
    let mut fact = None;
    let kind;
    let from_room = world
        .entity_room(actor)
        .ok_or("actor_room_missing")?
        .to_owned();
    let from_position = world.characters[actor].position.clone();
    match effect {
        CommandEffect::EnterLayer => {
            let next = config.contexts.get(d + 1).ok_or("layer_limit")?;
            let terminal = ctx
                .entry_item_id
                .as_deref()
                .ok_or("entry_terminal_missing")?;
            if !near(world, actor, terminal, config.interaction_range) {
                return Err("entry_terminal_out_of_range");
            }
            state.stack.push(ReturnFrame {
                context_id: ctx.id.clone(),
                room_id: world.entity_room(actor).unwrap().into(),
                position: world.characters[actor].position.clone(),
                entered_at_tick: world.tick,
            });
            state.context_id = next.id.clone();
            state.max_depth = state.max_depth.max((d + 1) as u8);
            world.characters.get_mut(actor).unwrap().position = next.arrival.clone();
            world
                .character_rooms
                .insert(actor.into(), next.arrival_room.clone());
            kind = "entered";
        }
        CommandEffect::ExitLayer => {
            if d == 0 {
                return Err("cannot_exit_root");
            }
            let terminal = ctx
                .return_item_id
                .as_deref()
                .ok_or("return_terminal_missing")?;
            if !near(world, actor, terminal, config.interaction_range) {
                return Err("return_terminal_out_of_range");
            }
            let frame = state.stack.pop().unwrap();
            state.context_id = frame.context_id;
            world.characters.get_mut(actor).unwrap().position = frame.position;
            world.character_rooms.insert(actor.into(), frame.room_id);
            state.unwind_count += 1;
            kind = "returned";
        }
        CommandEffect::ObserveLayer => {
            if !near(world, actor, &ctx.cue_item_id, config.interaction_range) {
                return Err("cue_out_of_range");
            }
            if state.observations.contains_key(&ctx.id) {
                return Err("cue_already_observed");
            }
            if world.characters[actor]
                .mind_graph
                .nodes
                .contains_key(&observation_id(actor, &ctx.id))
            {
                return Err("layer_observation_id_collision");
            }
            let record = LayerObservation {
                sequence,
                id: observation_id(actor, &ctx.id),
                context_id: ctx.id.clone(),
                room_id: world.entity_room(actor).unwrap().into(),
                item_id: ctx.cue_item_id.clone(),
                fact: ctx.cue_fact.clone(),
                depth: d as u8,
                is_virtual: d > 0,
                observed_at_tick: world.tick,
                position: from_position.clone(),
            };
            let node = MindNode {
                instance_id: record.id.clone(),
                schema_id: "it:concept/layer-evidence".into(),
                label: record.fact.clone(),
                node_type: NodeType::Observation,
                value: 1.0,
                value_velocity: 0.0,
                strength: 0.9,
                active: true,
                attended: true,
                suppression: 0.0,
                created_at: world.tick,
                ttl: None,
                hidden_by_default: false,
                thresholds: vec![],
                costs: vec![],
                observation: Some(ObservationData {
                    about: Some(format!("it:entity/{}", record.item_id)),
                    source: Some(if d > 0 {
                        ObservationSource::Virtual
                    } else {
                        ObservationSource::Environment
                    }),
                    modality: Some(Modality::Visual),
                    credibility: 1.0,
                    novelty_key: Some(ctx.id.clone()),
                    ..Default::default()
                }),
                prior_instinct: None,
                motivation: None,
                action: None,
                meme: None,
                prev_value: 1.0,
                reality_layer: d as u8,
                is_virtual: d > 0,
            };
            world
                .characters
                .get_mut(actor)
                .unwrap()
                .mind_graph
                .add_node(node);
            fact = Some(serde_json::to_value(&record).unwrap());
            state.observations.insert(ctx.id.clone(), record);
            kind = "observed";
        }
        CommandEffect::CompareLayers => {
            if state.comparison.is_some() {
                return Err("already_compared");
            }
            let ids = config
                .contexts
                .iter()
                .map(|c| state.observations.get(&c.id).map(|o| o.id.clone()))
                .collect::<Option<Vec<_>>>()
                .ok_or("missing_layer_observations")?;
            let comparison = LayerComparison {
                sequence,
                observation_ids: ids,
                compared_at_tick: world.tick,
            };
            fact = Some(serde_json::to_value(&comparison).unwrap());
            state.comparison = Some(comparison);
            kind = "compared";
        }
        CommandEffect::EarnLayerReward => {
            if d == 0 || !near(world, actor, &ctx.cue_item_id, config.interaction_range) {
                return Err("virtual_reward_unavailable");
            }
            if state.rewards.get(&ctx.id).copied().unwrap_or(0) >= 1 {
                return Err("virtual_reward_exhausted");
            }
            state.rewards.insert(ctx.id.clone(), 1);
            fact = Some(
                serde_json::json!({"context_id":ctx.id,"quantity":1,"physical_need_relief":0}),
            );
            kind = "rewarded";
        }
        CommandEffect::SatisfyLayerNeed => {
            if d != 0
                || !valid_comparison(&state, &config)
                || state.max_depth as usize != config.contexts.len() - 1
                || state.unwind_count < (config.contexts.len() - 1) as u32
            {
                return Err("journey_incomplete");
            }
            if state.need_receipt.is_some()
                || !near(world, actor, &config.meal_item_id, config.interaction_range)
            {
                return Err("real_meal_unavailable");
            }
            if world
                .items
                .get(&config.meal_item_id)
                .is_none_or(|i| i.quantity < 1.0)
            {
                return Err("real_meal_exhausted");
            }
            let node = world
                .characters
                .get_mut(actor)
                .unwrap()
                .mind_graph
                .nodes
                .values_mut()
                .find(|n| n.schema_id == config.need_schema_id)
                .ok_or("physical_need_missing")?;
            let before = node.value;
            let after = (before - config.need_relief).max(0.0);
            if before - after < 0.5 || after > config.need_max {
                return Err("insufficient_real_relief");
            }
            node.value = after;
            world.items.get_mut(&config.meal_item_id).unwrap().quantity -= 1.0;
            let receipt = NeedReceipt {
                sequence,
                item_id: config.meal_item_id.clone(),
                before,
                after,
                satisfied_at_tick: world.tick,
                room_id: from_room.clone(),
                position: from_position.clone(),
            };
            fact = Some(serde_json::to_value(&receipt).unwrap());
            state.need_receipt = Some(receipt);
            kind = "need_satisfied";
        }
        _ => return Err("not_layered_effect"),
    }
    if matches!(effect, CommandEffect::EnterLayer | CommandEffect::ExitLayer) {
        let transition = LayerTransition {
            sequence,
            kind: kind.into(),
            from_context_id: ctx.id.clone(),
            to_context_id: state.context_id.clone(),
            from_room,
            to_room: world.entity_room(actor).unwrap().into(),
            from_position,
            to_position: world.characters[actor].position.clone(),
            at_tick: world.tick,
        };
        fact = Some(serde_json::to_value(&transition).unwrap());
        state.transitions.push(transition);
    }
    if !matches!(effect, CommandEffect::EarnLayerReward) {
        state.next_sequence = sequence;
    }
    let event = WorldEvent::LayeredWorldChanged {
        actor_id: actor.into(),
        context_id: state.context_id.clone(),
        depth: state.stack.len() as u8,
        kind: kind.into(),
        fact,
    };
    world.layered_world.insert(actor.into(), state);
    sync_legacy(world);
    world.emit_event(event);
    Ok(())
}

pub fn validate_world(world: &WorldState) -> Result<(), String> {
    let Some(config) = world.scene.layered_world.as_ref() else {
        return if world.layered_world.is_empty() {
            Ok(())
        } else {
            Err("layered state without config".into())
        };
    };
    let unique = |ids: Vec<&str>| {
        let mut set = HashSet::new();
        !ids.is_empty() && ids.into_iter().all(|id| !id.is_empty() && set.insert(id))
    };
    if !(2..=8).contains(&config.contexts.len())
        || !unique(config.actor_ids.iter().map(String::as_str).collect())
        || !unique(config.contexts.iter().map(|c| c.id.as_str()).collect())
        || !config.interaction_range.is_finite()
        || config.interaction_range <= 0.0
        || config.interaction_range > 60.0
        || !config.need_relief.is_finite()
        || config.need_relief < 0.5
        || !config.need_max.is_finite()
        || !(0.0..=0.5).contains(&config.need_max)
        || !world.items.contains_key(&config.meal_item_id)
        || !unique(
            config
                .contexts
                .iter()
                .map(|c| c.cue_fact.as_str())
                .collect(),
        )
        || !unique(
            config
                .contexts
                .iter()
                .map(|c| c.cue_item_id.as_str())
                .collect(),
        )
        || !config.contexts[0]
            .room_ids
            .iter()
            .any(|r| world.entity_room(&config.meal_item_id) == Some(r.as_str()))
        || !world.items[&config.meal_item_id].quantity.is_finite()
        || !(0.0..=1.0).contains(&world.items[&config.meal_item_id].quantity)
    {
        return Err("invalid layered config".into());
    }
    let mut rooms = HashSet::new();
    for (d, ctx) in config.contexts.iter().enumerate() {
        if ctx.cue_fact.is_empty()
            || !world.items.contains_key(&ctx.cue_item_id)
            || ctx.room_ids.is_empty()
            || !ctx.room_ids.contains(&ctx.arrival_room)
            || world
                .scene
                .support_in_room(ctx.arrival.x, ctx.arrival.y, &ctx.arrival_room)
                .is_none()
            || !ctx
                .room_ids
                .iter()
                .all(|r| rooms.insert(r) && world.scene.rooms.iter().any(|room| &room.id == r))
            || !ctx
                .room_ids
                .iter()
                .any(|r| world.entity_room(&ctx.cue_item_id) == Some(r.as_str()))
            || (d + 1 < config.contexts.len() && ctx.entry_item_id.is_none())
            || (d > 0 && ctx.return_item_id.is_none())
            || ctx
                .entry_item_id
                .iter()
                .chain(&ctx.return_item_id)
                .any(|id| {
                    !world.items.contains_key(id)
                        || !ctx
                            .room_ids
                            .iter()
                            .any(|r| world.entity_room(id) == Some(r.as_str()))
                })
        {
            return Err("invalid layered context topology".into());
        }
        for id in std::iter::once(&ctx.cue_item_id)
            .chain(ctx.entry_item_id.iter())
            .chain(ctx.return_item_id.iter())
        {
            let item = &world.items[id];
            if !item.position.x.is_finite()
                || !item.position.y.is_finite()
                || !world.scene.rooms.iter().any(|r| {
                    world.entity_room(id) == Some(r.id.as_str())
                        && item.position.x >= r.x_min
                        && item.position.x <= r.x_max
                })
            {
                return Err("layer item has invalid room or position".into());
            }
        }
    }
    if world.scene.portals.iter().any(|p| {
        !config
            .contexts
            .iter()
            .any(|c| c.room_ids.contains(&p.from_room) && c.room_ids.contains(&p.to_room))
    }) {
        return Err("layer portal escapes context".into());
    }
    for actor in &config.actor_ids {
        if !world.characters.contains_key(actor)
            || !world.characters[actor].mind_graph.nodes.values().any(|n| {
                n.schema_id == config.need_schema_id
                    && n.node_type == NodeType::PriorInstinct
                    && n.prior_instinct.is_some()
                    && !n.is_resource()
                    && !n.is_virtual
                    && n.reality_layer == 0
            })
        {
            return Err("layered actor or physical need missing".into());
        }
        for ctx in &config.contexts {
            if world.characters[actor]
                .mind_graph
                .nodes
                .contains_key(&observation_id(actor, &ctx.id))
                && world
                    .layered_world
                    .get(actor)
                    .is_none_or(|s| !s.observations.contains_key(&ctx.id))
            {
                return Err("layer observation ID collides with existing node".into());
            }
        }
    }
    for (actor, state) in &world.layered_world {
        validate_causal_sequence(state, config, world.tick)?;
        let d = state.stack.len();
        if !config.actor_ids.contains(actor)
            || d >= config.contexts.len()
            || state.max_depth as usize >= config.contexts.len()
            || state.max_depth < d as u8
            || state.context_id != config.contexts[d].id
            || !config.contexts[d].room_ids.iter().any(|r| {
                world.entity_room(actor) == Some(r.as_str())
                    && world
                        .scene
                        .support_in_room(
                            world.characters[actor].position.x,
                            world.characters[actor].position.y,
                            r,
                        )
                        .is_some()
            })
        {
            return Err("invalid layered actor context".into());
        }
        let mut last = 0;
        let mut replay_depth = 0usize;
        let mut replay_max = 0usize;
        let mut replay_returns = 0u32;
        let mut replay_stack: Vec<&LayerTransition> = vec![];
        for t in &state.transitions {
            if t.at_tick < last
                || t.at_tick > world.tick
                || t.from_context_id != config.contexts[replay_depth].id
                || !config.contexts[replay_depth]
                    .room_ids
                    .contains(&t.from_room)
                || world
                    .scene
                    .support_in_room(t.from_position.x, t.from_position.y, &t.from_room)
                    .is_none()
            {
                return Err("invalid layer transition source".into());
            }
            if t.kind == "entered" {
                if replay_depth + 1 >= config.contexts.len() {
                    return Err("invalid layer transition depth".into());
                }
                let source = &config.contexts[replay_depth];
                let terminal = world
                    .entity_position(source.entry_item_id.as_ref().unwrap())
                    .unwrap();
                if world.entity_room(source.entry_item_id.as_ref().unwrap())
                    != Some(t.from_room.as_str())
                    || (t.from_position.x - terminal.x).abs() > config.interaction_range
                {
                    return Err("invalid layer transition terminal".into());
                }
                replay_depth += 1;
                let destination = &config.contexts[replay_depth];
                if t.to_room != destination.arrival_room
                    || t.to_position.x != destination.arrival.x
                    || t.to_position.y != destination.arrival.y
                {
                    return Err("invalid layer arrival".into());
                }
                replay_stack.push(t);
                replay_max = replay_max.max(replay_depth);
            } else if t.kind == "returned" && replay_depth > 0 {
                let source = &config.contexts[replay_depth];
                let terminal = world
                    .entity_position(source.return_item_id.as_ref().unwrap())
                    .unwrap();
                if world.entity_room(source.return_item_id.as_ref().unwrap())
                    != Some(t.from_room.as_str())
                    || (t.from_position.x - terminal.x).abs() > config.interaction_range
                {
                    return Err("invalid layer return terminal".into());
                }
                let entered = replay_stack.pop().ok_or("return without entry")?;
                if t.to_room != entered.from_room
                    || t.to_position.x != entered.from_position.x
                    || t.to_position.y != entered.from_position.y
                {
                    return Err("return does not restore parent position".into());
                }
                replay_depth -= 1;
                replay_returns += 1;
            } else {
                return Err("invalid layer transition kind".into());
            }
            if t.to_context_id != config.contexts[replay_depth].id {
                return Err("invalid layer transition destination".into());
            }
            last = t.at_tick;
        }
        if replay_depth != d
            || replay_max != state.max_depth as usize
            || replay_returns != state.unwind_count
        {
            return Err("layer history does not support milestones".into());
        }
        last = 0;
        for (i, frame) in state.stack.iter().enumerate() {
            let ctx = &config.contexts[i];
            if frame.context_id != ctx.id
                || !ctx.room_ids.contains(&frame.room_id)
                || frame.entered_at_tick < last
                || frame.entered_at_tick > world.tick
                || world
                    .scene
                    .support_in_room(frame.position.x, frame.position.y, &frame.room_id)
                    .is_none()
            {
                return Err("invalid layered return frame".into());
            }
            let entered = replay_stack[i];
            if frame.entered_at_tick != entered.at_tick
                || frame.position.x != entered.from_position.x
                || frame.position.y != entered.from_position.y
                || frame.room_id != entered.from_room
            {
                return Err("layer frame differs from entry history".into());
            }
            let terminal = world
                .entity_position(ctx.entry_item_id.as_ref().unwrap())
                .unwrap();
            if world.entity_room(ctx.entry_item_id.as_ref().unwrap())
                != Some(frame.room_id.as_str())
                || (terminal.x - frame.position.x).abs() > config.interaction_range
            {
                return Err("return frame lacks terminal proximity".into());
            }
            last = frame.entered_at_tick;
        }
        for (key, o) in &state.observations {
            let Some(i) = config.contexts.iter().position(|c| &c.id == key) else {
                return Err("unknown layered observation".into());
            };
            let ctx = &config.contexts[i];
            let node = world.characters[actor].mind_graph.nodes.get(&o.id);
            if o.id != observation_id(actor, key)
                || o.context_id != *key
                || o.depth != i as u8
                || o.is_virtual != (i > 0)
                || o.item_id != ctx.cue_item_id
                || o.fact != ctx.cue_fact
                || world.entity_room(&o.item_id) != Some(o.room_id.as_str())
                || o.observed_at_tick > world.tick
                || i > state.max_depth as usize
                || world
                    .scene
                    .support_in_room(o.position.x, o.position.y, &o.room_id)
                    .is_none()
                || world
                    .entity_position(&o.item_id)
                    .is_none_or(|p| (p.x - o.position.x).abs() > config.interaction_range)
                || (i > 0
                    && !state.transitions.iter().any(|t| {
                        t.kind == "entered"
                            && t.to_context_id == o.context_id
                            && t.at_tick <= o.observed_at_tick
                    }))
                || node.is_none_or(|n| {
                    n.node_type != NodeType::Observation
                        || n.schema_id != "it:concept/layer-evidence"
                        || n.label != o.fact
                        || n.ttl.is_some()
                        || n.prior_instinct.is_some()
                        || n.motivation.is_some()
                        || n.action.is_some()
                        || n.meme.is_some()
                        || n.reality_layer != o.depth
                        || n.is_virtual != o.is_virtual
                        || n.created_at != o.observed_at_tick
                        || n.observation.as_ref().is_none_or(|obs| {
                            obs.novelty_key.as_deref() != Some(o.context_id.as_str())
                                || obs.source
                                    != Some(if i > 0 {
                                        ObservationSource::Virtual
                                    } else {
                                        ObservationSource::Environment
                                    })
                        })
                        || n.observation.as_ref().and_then(|o| o.about.as_deref())
                            != Some(format!("it:entity/{}", ctx.cue_item_id).as_str())
                })
            {
                return Err("invalid layered observation receipt".into());
            }
        }
        if state
            .comparison
            .as_ref()
            .is_some_and(|c| c.compared_at_tick > world.tick || !valid_comparison(state, config))
        {
            return Err("invalid layered comparison".into());
        }
        if state.rewards.iter().any(|(id, count)| {
            *count != 1
                || !config
                    .contexts
                    .iter()
                    .enumerate()
                    .skip(1)
                    .any(|(i, c)| &c.id == id && i <= state.max_depth as usize)
        }) {
            return Err("invalid layer rewards".into());
        }
        if let Some(r) = &state.need_receipt {
            if !r.before.is_finite()
                || !r.after.is_finite()
                || r.before > 1.0
                || r.after < 0.0
                || r.before - r.after < 0.5
                || r.after > config.need_max
                || r.satisfied_at_tick > world.tick
                || r.after != (r.before - config.need_relief).max(0.0)
                || !config.contexts[0].room_ids.contains(&r.room_id)
                || world.entity_room(&r.item_id) != Some(r.room_id.as_str())
                || world
                    .scene
                    .support_in_room(r.position.x, r.position.y, &r.room_id)
                    .is_none()
                || world
                    .entity_position(&r.item_id)
                    .is_none_or(|p| (p.x - r.position.x).abs() > config.interaction_range)
                || state.max_depth as usize != config.contexts.len() - 1
                || state.unwind_count < (config.contexts.len() - 1) as u32
                || !valid_comparison(state, config)
                || state
                    .comparison
                    .as_ref()
                    .is_some_and(|c| c.compared_at_tick > r.satisfied_at_tick)
                || r.item_id != config.meal_item_id
                || world.items[&r.item_id].quantity != 0.0
            {
                return Err("invalid physical need receipt".into());
            }
        }
    }
    fn valid_objective(
        c: &crate::models::progress::LevelCondition,
        config: &LayeredConfig,
    ) -> bool {
        use crate::models::progress::LevelCondition;
        match c {
            LevelCondition::LayeredJourney { character_id, .. } => {
                config.actor_ids.contains(character_id)
            }
            LevelCondition::All { conditions } | LevelCondition::Any { conditions } => {
                conditions.iter().all(|c| valid_objective(c, config))
            }
            _ => true,
        }
    }
    if world
        .progress
        .objectives
        .iter()
        .any(|o| !valid_objective(&o.condition, config))
    {
        return Err("layered objective has unconfigured actor".into());
    }
    Ok(())
}

/// Sequence, rather than tick alone, distinguishes legitimate same-tick commands.
/// Validate each historical fact against the context/milestones that existed then.
fn validate_causal_sequence(
    state: &LayeredState,
    config: &LayeredConfig,
    tick: u64,
) -> Result<(), String> {
    enum Receipt<'a> {
        Transition(&'a LayerTransition),
        Observation(&'a LayerObservation),
        Comparison(&'a LayerComparison),
        Need,
    }
    let mut receipts: Vec<(u64, u64, Receipt<'_>)> = vec![];
    let mut previous_transition_sequence = 0;
    for t in &state.transitions {
        if t.sequence <= previous_transition_sequence {
            return Err("layer transitions are not sequence-ordered".into());
        }
        previous_transition_sequence = t.sequence;
        receipts.push((t.sequence, t.at_tick, Receipt::Transition(t)));
    }
    for o in state.observations.values() {
        receipts.push((o.sequence, o.observed_at_tick, Receipt::Observation(o)));
    }
    if let Some(c) = &state.comparison {
        receipts.push((c.sequence, c.compared_at_tick, Receipt::Comparison(c)));
    }
    if let Some(n) = &state.need_receipt {
        receipts.push((n.sequence, n.satisfied_at_tick, Receipt::Need));
    }
    receipts.sort_by_key(|r| r.0);
    if receipts.len() as u64 != state.next_sequence {
        return Err("layer receipt sequence has missing records".into());
    }
    let mut depth = 0usize;
    let mut deepest = 0usize;
    let mut returns = 0usize;
    let mut previous_tick = 0;
    let mut seen = HashSet::new();
    let mut compared = false;
    for (index, (sequence, at_tick, receipt)) in receipts.into_iter().enumerate() {
        if sequence != index as u64 + 1 || at_tick < previous_tick || at_tick > tick {
            return Err("invalid layer receipt sequence or timestamp order".into());
        }
        previous_tick = at_tick;
        match receipt {
            Receipt::Transition(t) => {
                if t.from_context_id != config.contexts[depth].id {
                    return Err("historical layer source context mismatch".into());
                }
                match t.kind.as_str() {
                    "entered" if depth + 1 < config.contexts.len() => {
                        depth += 1;
                        deepest = deepest.max(depth);
                    }
                    "returned" if depth > 0 => {
                        depth -= 1;
                        returns += 1;
                    }
                    _ => return Err("invalid historical layer transition".into()),
                }
                if t.to_context_id != config.contexts[depth].id {
                    return Err("historical layer destination mismatch".into());
                }
            }
            Receipt::Observation(o) => {
                if o.context_id != config.contexts[depth].id
                    || o.depth as usize != depth
                    || !seen.insert(o.id.as_str())
                {
                    return Err("observation was not recorded during its layer residency".into());
                }
            }
            Receipt::Comparison(c) => {
                if compared
                    || deepest + 1 != config.contexts.len()
                    || seen.len() != config.contexts.len()
                    || c.observation_ids.len() != seen.len()
                    || c.observation_ids
                        .iter()
                        .any(|id| !seen.contains(id.as_str()))
                {
                    return Err("comparison precedes actual layer observations".into());
                }
                compared = true;
            }
            Receipt::Need => {
                if depth != 0
                    || deepest + 1 != config.contexts.len()
                    || returns + 1 < config.contexts.len()
                    || !compared
                {
                    return Err("physical meal precedes comparison and complete unwind".into());
                }
            }
        }
    }
    Ok(())
}
