//! Observer-local room identity and memory. Stable physical topology is never regenerated.
use crate::models::{events::WorldEvent, mind_node::*, room_memory::*, world_state::WorldState};

pub fn validate_world(world: &WorldState) -> Result<(), String> {
    world.scene.validate()?;
    if let Some(config) = &world.scene.room_memory {
        if config
            .observer_ids
            .iter()
            .chain(&config.witness_ids)
            .any(|id| !world.characters.contains_key(id))
            || !world.items.contains_key(&config.drug_item_id)
        {
            return Err("room-memory character or drug item missing".into());
        }
        for observer in &config.observer_ids {
            for room in &config.rooms {
                if world.characters[observer]
                    .mind_graph
                    .nodes
                    .get(&node_id(config, &room.room_id))
                    .is_some_and(|node| !compatible_node(node, config))
                {
                    return Err("room-memory observation ID collides with another node".into());
                }
            }
        }
        for (observer, memory) in &world.room_memory {
            if !config.observer_ids.contains(observer) {
                return Err("room-memory state has unconfigured observer".into());
            }
            match (memory.drug_used_at_tick, memory.drug_until_tick) {
                (None, None) => (),
                (Some(used), Some(until))
                    if used <= world.tick
                        && used.checked_add(config.drug_duration_ticks) == Some(until) => {}
                _ => return Err("invalid room-memory drug window".into()),
            }
            for (id, entry) in &memory.rooms {
                let room = config
                    .rooms
                    .iter()
                    .find(|r| &r.room_id == id)
                    .ok_or("room-memory state has unconfigured room")?;
                validate_entry(world, config, observer, room, entry)?;
                if entry
                    .anchor_drug_used_at_tick
                    .is_some_and(|used| memory.drug_used_at_tick.is_none_or(|latest| latest < used))
                {
                    return Err("room-memory anchor lacks observer drug-use history".into());
                }
                let existing = world.characters[observer]
                    .mind_graph
                    .nodes
                    .get(&node_id(config, id));
                let about = format!("it:room/{id}/variant/{}", entry.variant_id);
                if existing.is_some_and(|node| {
                    entry.phase == RoomMemoryPhase::Forgotten
                        || node.observation.as_ref().and_then(|o| o.about.as_deref())
                            != Some(about.as_str())
                }) {
                    return Err(
                        "room-memory observation does not match remembered room identity".into(),
                    );
                }
            }
        }
    } else if !world.room_memory.is_empty() {
        return Err("room-memory state without scene configuration".into());
    }
    fn valid(condition: &crate::models::progress::LevelCondition, world: &WorldState) -> bool {
        use crate::models::progress::LevelCondition;
        match condition {
            LevelCondition::RoomMemoryEvidence {
                character_id,
                room_id,
                ..
            } => world.scene.room_memory.as_ref().is_some_and(|config| {
                config.observer_ids.contains(character_id)
                    && room_id
                        .as_ref()
                        .is_none_or(|id| config.rooms.iter().any(|r| &r.room_id == id))
            }),
            LevelCondition::All { conditions } | LevelCondition::Any { conditions } => {
                conditions.iter().all(|c| valid(c, world))
            }
            _ => true,
        }
    }
    if world
        .progress
        .objectives
        .iter()
        .any(|o| !valid(&o.condition, world))
        || world
            .progress
            .failure_rules
            .iter()
            .any(|r| !valid(&r.condition, world))
    {
        return Err("room-memory objective references an unconfigured observer or room".into());
    }
    Ok(())
}

fn compatible_node(node: &MindNode, config: &RoomMemoryConfig) -> bool {
    node.node_type == NodeType::Observation
        && node.schema_id == config.observation_schema_id
        && node.observation.is_some()
        && node.action.is_none()
        && node.motivation.is_none()
        && node.prior_instinct.is_none()
        && node.meme.is_none()
}

/// Structural consistency, not cryptographic proof against editing an entire save.
fn validate_entry(
    world: &WorldState,
    config: &RoomMemoryConfig,
    observer: &str,
    room: &MemoryRoom,
    entry: &RoomMemoryEntry,
) -> Result<(), String> {
    let expected = variant(world.seed, observer, room, entry.generation);
    if entry.variant_id != expected.id
        || entry.background_key != expected.background_key
        || entry.visit_count == 0
        || entry.entered_at_tick > entry.last_seen_tick
        || entry.last_seen_tick > world.tick
        || entry.left_at_tick.is_some_and(|t| {
            t > world.tick || t < entry.entered_at_tick || t != entry.last_seen_tick
        })
        || entry.forgotten_at_tick.is_some_and(|t| t > world.tick)
    {
        return Err("invalid room-memory identity or timestamps".into());
    }
    let anchor = match (
        entry.anchored_at_tick,
        entry.anchor_drug_used_at_tick,
        entry.anchor_drug_until_tick,
    ) {
        (None, None, None) => None,
        (Some(at), Some(used), Some(until))
            if used <= at
                && at <= world.tick
                && at <= entry.last_seen_tick
                && at < until
                && used.checked_add(config.drug_duration_ticks) == Some(until) =>
        {
            Some((at, used, until))
        }
        _ => return Err("invalid room-memory anchor drug window".into()),
    };
    let current = world.entity_room(observer) == Some(room.room_id.as_str());
    if current {
        if entry.phase != RoomMemoryPhase::Visible || entry.left_at_tick.is_some() {
            return Err("current room-memory entry must be visible without departure".into());
        }
    } else {
        let left = entry
            .left_at_tick
            .ok_or("departed room-memory entry needs departure timestamp")?;
        let age = world.tick - left;
        let phase = if anchor.is_some() {
            RoomMemoryPhase::Anchored
        } else if age >= config.forget_after_ticks {
            RoomMemoryPhase::Forgotten
        } else if age >= config.fade_after_ticks {
            RoomMemoryPhase::Fading
        } else {
            RoomMemoryPhase::Remembered
        };
        if entry.phase != phase || anchor.is_some_and(|(at, _, _)| at > left) {
            return Err("departed room-memory phase does not match elapsed time or anchor".into());
        }
        if phase == RoomMemoryPhase::Forgotten
            && !entry.forgotten_at_tick.is_some_and(|forgotten| {
                forgotten >= left && forgotten - left >= config.forget_after_ticks
            })
        {
            return Err("forgotten room-memory entry needs actual elapsed departure".into());
        }
    }
    let mut previous_revisit = 0;
    for (index, receipt) in entry.forgotten_revisits.iter().enumerate() {
        let generation = index as u64 + 1;
        if receipt.generation != generation
            || receipt.previous_variant_id != variant(world.seed, observer, room, generation - 1).id
            || receipt.variant_id != variant(world.seed, observer, room, generation).id
            || receipt.left_at_tick < previous_revisit
            || receipt.forgotten_at_tick < receipt.left_at_tick
            || receipt.forgotten_at_tick - receipt.left_at_tick < config.forget_after_ticks
            || receipt.revisited_at_tick < receipt.forgotten_at_tick
            || receipt.revisited_at_tick > entry.entered_at_tick
        {
            return Err("invalid room-memory forgotten-revisit receipt".into());
        }
        previous_revisit = receipt.revisited_at_tick;
    }
    if anchor.is_some_and(|(at, _, _)| at < previous_revisit)
        || entry.generation != entry.forgotten_revisits.len() as u64
        || entry.revisit_count != entry.forgotten_revisits.len() as u64
        || entry.forgotten_count
            != entry.revisit_count + u64::from(entry.phase == RoomMemoryPhase::Forgotten)
        || entry.anchored_revisit_count != entry.anchored_revisits.len() as u64
        || entry.visit_count < 1 + entry.revisit_count + entry.anchored_revisit_count
        || (entry.forgotten_count == 0) != entry.forgotten_at_tick.is_none()
        || entry.forgotten_revisits.last().is_some_and(|r| {
            entry
                .forgotten_at_tick
                .is_none_or(|t| t < r.forgotten_at_tick)
        })
        || (entry.phase != RoomMemoryPhase::Forgotten
            && entry.forgotten_at_tick
                != entry.forgotten_revisits.last().map(|r| r.forgotten_at_tick))
    {
        return Err("room-memory counters do not match causal receipts".into());
    }
    let mut previous_return = 0;
    for receipt in &entry.anchored_revisits {
        if anchor
            != Some((
                receipt.anchored_at_tick,
                receipt.drug_used_at_tick,
                receipt.drug_until_tick,
            ))
            || receipt.variant_id != entry.variant_id
            || receipt.generation != entry.generation
            || receipt.left_at_tick < previous_return
            || receipt.left_at_tick < receipt.anchored_at_tick
            || receipt.returned_at_tick < receipt.left_at_tick
            || receipt.returned_at_tick > entry.entered_at_tick
            || receipt.returned_at_tick - receipt.left_at_tick < config.forget_after_ticks
        {
            return Err("invalid room-memory anchored-revisit receipt".into());
        }
        previous_return = receipt.returned_at_tick;
    }
    let mut recalled = std::collections::HashSet::new();
    let mut previous_recall = (0, 0);
    for receipt in &entry.witness_recalls {
        if !config.witness_ids.contains(&receipt.witness_id)
            || !world
                .scene
                .rooms
                .iter()
                .any(|r| r.id == receipt.meeting_room_id)
            || receipt.recalled_at_tick > world.tick
            || receipt.recalled_at_tick < receipt.revisited_at_tick
            || !recalled.insert(receipt.generation)
            || receipt.generation <= previous_recall.0
            || receipt.recalled_at_tick < previous_recall.1
            || !entry.forgotten_revisits.iter().any(|r| {
                r.generation == receipt.generation
                    && r.revisited_at_tick == receipt.revisited_at_tick
            })
        {
            return Err("invalid room-memory witness receipt reference or timestamps".into());
        }
        previous_recall = (receipt.generation, receipt.recalled_at_tick);
    }
    Ok(())
}

fn variant<'a>(
    seed: u64,
    observer: &str,
    room: &'a MemoryRoom,
    generation: u64,
) -> &'a RoomVariant {
    // Explicit FNV-1a bytes, independent of HashMap iteration, OS hash seeds and clocks.
    let hash = observer
        .bytes()
        .chain([0])
        .chain(room.room_id.bytes())
        .fold(14695981039346656037u64 ^ seed, |h, b| {
            (h ^ b as u64).wrapping_mul(1099511628211)
        });
    &room.variants[((hash % room.variants.len() as u64 + generation % room.variants.len() as u64)
        % room.variants.len() as u64) as usize]
}

fn node_id(config: &RoomMemoryConfig, room: &str) -> String {
    config
        .observation_node_ids
        .get(room)
        .cloned()
        .unwrap_or_else(|| format!("room-memory:{room}"))
}

fn feedback(world: &mut WorldState, observer: &str, room: Option<&str>, kind: &str, direct: bool) {
    let event = WorldEvent::RoomMemoryChanged {
        observer_id: observer.into(),
        room_id: room.map(str::to_owned),
        variant_id: room.and_then(|id| {
            world
                .room_memory
                .get(observer)?
                .rooms
                .get(id)
                .map(|entry| entry.variant_id.clone())
        }),
        drug_ticks_remaining: world.room_memory.get(observer).map(|state| {
            state
                .drug_until_tick
                .unwrap_or_default()
                .saturating_sub(world.tick)
        }),
        kind: kind.into(),
        tick: world.tick,
    };
    if direct {
        world.event_log.push(event);
    } else {
        world.pending_events.push(event);
    }
}

fn sync_node(world: &mut WorldState, observer: &str, room: &str) {
    let Some(config) = &world.scene.room_memory else {
        return;
    };
    let id = node_id(config, room);
    let Some(entry) = world
        .room_memory
        .get(observer)
        .and_then(|m| m.rooms.get(room))
    else {
        return;
    };
    let Some(character) = world.characters.get_mut(observer) else {
        return;
    };
    // Defense in depth: never mutate or remove an unrelated node, even if an
    // in-process caller bypassed configuration/snapshot validation.
    if character
        .mind_graph
        .nodes
        .get(&id)
        .is_some_and(|node| !compatible_node(node, config))
    {
        return;
    }
    if entry.phase == RoomMemoryPhase::Forgotten {
        character.mind_graph.remove_node(&id);
        return;
    }
    let about = format!("it:room/{room}/variant/{}", entry.variant_id);
    let value = match entry.phase {
        RoomMemoryPhase::Fading => 0.25,
        RoomMemoryPhase::Remembered => 0.6,
        _ => 1.0,
    };
    if let Some(node) = character.mind_graph.nodes.get_mut(&id) {
        node.value = value;
        node.strength = value;
        node.active = true;
        node.attended = entry.phase == RoomMemoryPhase::Visible;
        node.ttl = None;
        return;
    }
    character.mind_graph.add_node(MindNode {
        instance_id: id,
        schema_id: config.observation_schema_id.clone(),
        label: about.clone(),
        node_type: NodeType::Observation,
        value,
        value_velocity: 0.0,
        strength: value,
        active: true,
        attended: entry.phase == RoomMemoryPhase::Visible,
        suppression: 0.0,
        created_at: world.tick,
        ttl: None,
        hidden_by_default: false,
        thresholds: vec![],
        costs: vec![],
        observation: Some(ObservationData {
            modality: Some(Modality::Visual),
            about: Some(about.clone()),
            novelty_key: Some(about),
            credibility: 1.0,
            presentation_count: entry.generation.saturating_add(1).min(u32::MAX as u64) as u32,
            source: Some(ObservationSource::Environment),
            ..Default::default()
        }),
        prior_instinct: None,
        motivation: None,
        action: None,
        meme: None,
        prev_value: 0.0,
        reality_layer: 0,
        is_virtual: false,
    });
}

/// Initialize only authored spawn perception, not fabricated prior visits.
pub fn initialize(world: &mut WorldState) {
    let Some(config) = world.scene.room_memory.clone() else {
        return;
    };
    for observer in &config.observer_ids {
        if !world.room_memory.contains_key(observer) {
            if let Some(character) = world.characters.get_mut(observer) {
                let ids: Vec<_> = character
                    .mind_graph
                    .nodes
                    .values()
                    .filter(|n| {
                        n.schema_id == config.observation_schema_id
                            && n.node_type == NodeType::Observation
                    })
                    .map(|n| n.instance_id.clone())
                    .collect();
                for id in ids {
                    character.mind_graph.remove_node(&id);
                }
            }
            world
                .room_memory
                .insert(observer.clone(), ObserverRoomMemory::default());
        }
        if let Some(room) = world.entity_room(observer).map(str::to_owned) {
            if config.rooms.iter().any(|r| r.room_id == room)
                && !world.room_memory[observer].rooms.contains_key(&room)
            {
                enter(world, observer, &room, false);
            }
        }
    }
}

fn enter(world: &mut WorldState, observer: &str, room_id: &str, direct: bool) {
    let Some(config) = world.scene.room_memory.clone() else {
        return;
    };
    let Some(room) = config.rooms.iter().find(|r| r.room_id == room_id) else {
        return;
    };
    let tick = world.tick;
    let state = world.room_memory.entry(observer.into()).or_default();
    let entry = state.rooms.entry(room_id.into()).or_insert_with(|| {
        let v = variant(world.seed, observer, room, 0);
        RoomMemoryEntry {
            phase: RoomMemoryPhase::Remembered,
            generation: 0,
            variant_id: v.id.clone(),
            background_key: v.background_key.clone(),
            visit_count: 0,
            entered_at_tick: tick,
            last_seen_tick: tick,
            left_at_tick: None,
            forgotten_at_tick: None,
            forgotten_count: 0,
            revisit_count: 0,
            anchored_at_tick: None,
            anchor_drug_used_at_tick: None,
            anchor_drug_until_tick: None,
            anchored_revisit_count: 0,
            forgotten_revisits: vec![],
            anchored_revisits: vec![],
            witness_recalls: vec![],
        }
    });
    let mut kind = "room_observed";
    if entry.phase == RoomMemoryPhase::Forgotten {
        let previous = entry.variant_id.clone();
        entry.generation = entry.generation.saturating_add(1);
        let v = variant(world.seed, observer, room, entry.generation);
        entry.variant_id = v.id.clone();
        entry.background_key = v.background_key.clone();
        entry.revisit_count = entry.revisit_count.saturating_add(1);
        entry.forgotten_revisits.push(ForgottenRevisit {
            left_at_tick: entry.left_at_tick.unwrap_or(tick),
            forgotten_at_tick: entry.forgotten_at_tick.unwrap_or(tick),
            revisited_at_tick: tick,
            generation: entry.generation,
            previous_variant_id: previous,
            variant_id: entry.variant_id.clone(),
        });
        kind = "forgotten_room_revisited";
    } else if let (Some(left), Some(anchor), Some(drug), Some(until)) = (
        entry.left_at_tick,
        entry.anchored_at_tick,
        entry.anchor_drug_used_at_tick,
        entry.anchor_drug_until_tick,
    ) {
        if anchor <= left
            && drug <= anchor
            && anchor < until
            && tick.saturating_sub(left) >= config.forget_after_ticks
        {
            entry.anchored_revisit_count = entry.anchored_revisit_count.saturating_add(1);
            entry.anchored_revisits.push(AnchoredRevisit {
                left_at_tick: left,
                returned_at_tick: tick,
                anchored_at_tick: anchor,
                drug_used_at_tick: drug,
                drug_until_tick: until,
                generation: entry.generation,
                variant_id: entry.variant_id.clone(),
            });
            kind = "anchored_room_revisited";
        }
    }
    entry.phase = RoomMemoryPhase::Visible;
    entry.visit_count = entry.visit_count.saturating_add(1);
    entry.entered_at_tick = tick;
    entry.last_seen_tick = tick;
    entry.left_at_tick = None;
    sync_node(world, observer, room_id);
    feedback(world, observer, Some(room_id), kind, direct);
}

/// Called only after authoritative movement and occupancy have both committed.
pub fn crossed(world: &mut WorldState, observer: &str, from: &str, to: &str, direct: bool) {
    if from == to
        || !world
            .scene
            .room_memory
            .as_ref()
            .is_some_and(|c| c.observer_ids.iter().any(|id| id == observer))
    {
        return;
    }
    if let Some(entry) = world
        .room_memory
        .get_mut(observer)
        .and_then(|s| s.rooms.get_mut(from))
    {
        entry.left_at_tick = Some(world.tick);
        entry.last_seen_tick = world.tick;
        entry.phase = if entry.anchored_at_tick.is_some() {
            RoomMemoryPhase::Anchored
        } else {
            RoomMemoryPhase::Remembered
        };
        sync_node(world, observer, from);
        feedback(world, observer, Some(from), "room_left", direct);
    }
    enter(world, observer, to, direct);
}

/// Simulation time, never wall time or rendering frames, advances memory loss.
pub fn tick(world: &mut WorldState) {
    let Some(config) = world.scene.room_memory.clone() else {
        return;
    };
    if world.paused {
        return;
    }
    initialize(world);
    for observer in &config.observer_ids {
        let current = world.entity_room(observer).map(str::to_owned);
        let state = world.room_memory.entry(observer.clone()).or_default();
        let mut room_ids: Vec<_> = state
            .rooms
            .keys()
            .filter(|id| config.rooms.iter().any(|room| &room.room_id == *id))
            .cloned()
            .collect();
        room_ids.sort();
        for room in room_ids {
            let entry = world
                .room_memory
                .get_mut(observer)
                .unwrap()
                .rooms
                .get_mut(&room)
                .unwrap();
            let previous = entry.phase;
            if current.as_deref() == Some(room.as_str()) {
                entry.last_seen_tick = world.tick;
            } else if entry.anchored_at_tick.is_none() && entry.phase != RoomMemoryPhase::Forgotten
            {
                if let Some(left) = entry.left_at_tick {
                    let age = world.tick.saturating_sub(left);
                    if age >= config.forget_after_ticks {
                        entry.phase = RoomMemoryPhase::Forgotten;
                        entry.forgotten_at_tick = Some(world.tick);
                        entry.forgotten_count = entry.forgotten_count.saturating_add(1);
                    } else if age >= config.fade_after_ticks {
                        entry.phase = RoomMemoryPhase::Fading;
                    }
                }
            }
            let phase = entry.phase;
            sync_node(world, observer, &room);
            if phase != previous {
                feedback(
                    world,
                    observer,
                    Some(&room),
                    if phase == RoomMemoryPhase::Forgotten {
                        "room_forgotten"
                    } else {
                        "room_fading"
                    },
                    false,
                );
            }
        }
        if world.room_memory[observer].drug_until_tick == Some(world.tick) {
            feedback(world, observer, None, "memory_drug_expired", false);
        }
    }
}

pub fn apply_drug(world: &mut WorldState, observer: &str) -> Result<(), &'static str> {
    let config = world
        .scene
        .room_memory
        .as_ref()
        .ok_or("room_memory_disabled")?;
    if !config.observer_ids.iter().any(|id| id == observer) {
        return Err("not_memory_observer");
    }
    if !world.items.contains_key(&config.drug_item_id)
        || !world.same_room(observer, &config.drug_item_id)
    {
        return Err("memory_drug_not_here");
    }
    let duration = config.drug_duration_ticks;
    let state = world.room_memory.entry(observer.into()).or_default();
    if state
        .drug_until_tick
        .is_some_and(|until| world.tick < until)
    {
        return Err("memory_drug_already_active");
    }
    state.drug_used_at_tick = Some(world.tick);
    state.drug_until_tick = Some(world.tick.saturating_add(duration));
    feedback(world, observer, None, "memory_drug_taken", false);
    Ok(())
}

pub fn anchor(world: &mut WorldState, observer: &str) -> Result<(), &'static str> {
    let config = world
        .scene
        .room_memory
        .as_ref()
        .ok_or("room_memory_disabled")?;
    if !config.observer_ids.iter().any(|id| id == observer) {
        return Err("not_memory_observer");
    }
    let room = world
        .entity_room(observer)
        .ok_or("observer_missing")?
        .to_owned();
    if !config.rooms.iter().any(|r| r.room_id == room) {
        return Err("room_not_observed");
    }
    let state = world
        .room_memory
        .get_mut(observer)
        .ok_or("room_not_observed")?;
    let until = state
        .drug_until_tick
        .filter(|until| world.tick < *until)
        .ok_or("memory_drug_required_or_expired")?;
    let drug = state
        .drug_used_at_tick
        .ok_or("memory_drug_required_or_expired")?;
    let entry = state.rooms.get_mut(&room).ok_or("room_not_observed")?;
    if entry.phase != RoomMemoryPhase::Visible {
        return Err("room_not_visible");
    }
    if entry.anchored_at_tick.is_some() {
        return Err("room_already_anchored");
    }
    entry.anchored_at_tick = Some(world.tick);
    entry.anchor_drug_used_at_tick = Some(drug);
    entry.anchor_drug_until_tick = Some(until);
    sync_node(world, observer, &room);
    feedback(world, observer, Some(&room), "room_anchored", false);
    Ok(())
}

pub fn inspect(world: &mut WorldState, observer: &str) -> Result<(), &'static str> {
    let config = world
        .scene
        .room_memory
        .as_ref()
        .ok_or("room_memory_disabled")?;
    if !config.observer_ids.iter().any(|id| id == observer) {
        return Err("not_memory_observer");
    }
    let room = world
        .entity_room(observer)
        .ok_or("observer_missing")?
        .to_owned();
    if !config.rooms.iter().any(|r| r.room_id == room) {
        return Err("room_not_observed");
    }
    if !world
        .room_memory
        .get(observer)
        .and_then(|s| s.rooms.get(&room))
        .is_some_and(|e| e.phase == RoomMemoryPhase::Visible)
    {
        return Err("room_not_observed");
    }
    sync_node(world, observer, &room);
    feedback(world, observer, Some(&room), "room_investigated", false);
    Ok(())
}

pub fn recall(
    world: &mut WorldState,
    observer: &str,
    witness: Option<&str>,
) -> Result<(), &'static str> {
    let config = world
        .scene
        .room_memory
        .as_ref()
        .ok_or("room_memory_disabled")?;
    if !config.observer_ids.iter().any(|id| id == observer) {
        return Err("not_memory_observer");
    }
    let witness = witness
        .filter(|id| config.witness_ids.iter().any(|w| w == id))
        .ok_or("invalid_memory_witness")?;
    if !world.same_room(observer, witness) {
        return Err("memory_witness_not_here");
    }
    let meeting_room_id = world
        .entity_room(observer)
        .ok_or("observer_missing")?
        .to_owned();
    let state = world
        .room_memory
        .get_mut(observer)
        .ok_or("no_forgotten_revisit")?;
    let mut rooms: Vec<_> = state
        .rooms
        .iter()
        .filter(|(id, _)| config.rooms.iter().any(|room| &room.room_id == *id))
        .filter_map(|(room, entry)| {
            entry
                .forgotten_revisits
                .last()
                .filter(|r| {
                    !entry
                        .witness_recalls
                        .iter()
                        .any(|w| w.generation == r.generation)
                })
                .map(|r| (r.revisited_at_tick, room.clone()))
        })
        .collect();
    rooms.sort();
    let room = rooms
        .last()
        .ok_or("no_unconfirmed_forgotten_revisit")?
        .1
        .clone();
    let entry = state.rooms.get_mut(&room).unwrap();
    let receipt = entry.forgotten_revisits.last().unwrap();
    entry.witness_recalls.push(WitnessRecall {
        witness_id: witness.into(),
        meeting_room_id,
        recalled_at_tick: world.tick,
        revisited_at_tick: receipt.revisited_at_tick,
        generation: receipt.generation,
    });
    feedback(
        world,
        observer,
        Some(&room),
        "witness_you_forgot_this_place",
        false,
    );
    Ok(())
}

pub fn evidence(
    world: &WorldState,
    observer: &str,
    room_id: Option<&str>,
    kind: RoomMemoryEvidence,
) -> bool {
    let Some(config) = &world.scene.room_memory else {
        return false;
    };
    if !config.observer_ids.iter().any(|id| id == observer) {
        return false;
    }
    let Some(state) = world.room_memory.get(observer) else {
        return false;
    };
    state
        .rooms
        .iter()
        .filter(|(id, _)| {
            config.rooms.iter().any(|r| &r.room_id == *id) && room_id.is_none_or(|room| *id == room)
        })
        .any(|(_, entry)| {
            let forgotten = |r: &ForgottenRevisit| {
                r.left_at_tick <= r.forgotten_at_tick
                    && r.forgotten_at_tick <= r.revisited_at_tick
                    && r.revisited_at_tick <= world.tick
                    && r.forgotten_at_tick.saturating_sub(r.left_at_tick)
                        >= config.forget_after_ticks
                    && r.generation > 0
                    && r.previous_variant_id != r.variant_id
            };
            match kind {
                RoomMemoryEvidence::ForgottenRevisit => {
                    entry.forgotten_revisits.iter().any(forgotten)
                }
                RoomMemoryEvidence::WitnessRecall => entry.witness_recalls.iter().any(|w| {
                    config.witness_ids.contains(&w.witness_id)
                        && world.scene.rooms.iter().any(|r| r.id == w.meeting_room_id)
                        && w.recalled_at_tick <= world.tick
                        && w.recalled_at_tick >= w.revisited_at_tick
                        && entry.forgotten_revisits.iter().any(|r| {
                            forgotten(r)
                                && r.generation == w.generation
                                && r.revisited_at_tick == w.revisited_at_tick
                        })
                }),
                RoomMemoryEvidence::AnchoredRevisit => entry.anchored_revisits.iter().any(|r| {
                    r.drug_used_at_tick <= r.anchored_at_tick
                        && r.anchored_at_tick < r.drug_until_tick
                        && r.anchored_at_tick <= r.left_at_tick
                        && r.left_at_tick <= r.returned_at_tick
                        && r.returned_at_tick <= world.tick
                        && r.returned_at_tick.saturating_sub(r.left_at_tick)
                            >= config.forget_after_ticks
                        && r.variant_id == entry.variant_id
                        && r.generation == entry.generation
                        && entry.anchored_at_tick == Some(r.anchored_at_tick)
                }),
            }
        })
}
