use intention_tower_game_lib::{
    command_rules::command_available,
    level_loader::load_level_from_path,
    models::{
        commands::{CommandDTO, CommandDef, CommandEffect, TargetingMode},
        events::WorldEvent,
        progress::LevelStatus,
        room_memory::{RoomMemoryEntry, RoomMemoryEvidence as Evidence, RoomMemoryPhase as Phase},
        world_state::WorldState,
    },
    movement, room_memory,
    systems::{command_system::CommandSystem, runner::SimulationRunner, System},
};

const AGENT: &str = "antimeme-agent";

fn world() -> WorldState {
    load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../assets/levels/antimeme-division"),
    )
    .unwrap()
}
fn walk_as(w: &mut WorldState, actor: &str, x: f64) {
    for _ in 0..100 {
        let dx = x - w.characters[actor].position.x;
        if dx.abs() < 0.001 {
            return;
        }
        movement::move_character(w, actor, dx.clamp(-40.0, 40.0), 0.0).unwrap();
    }
    panic!("walking did not reach {x}");
}
fn walk(w: &mut WorldState, x: f64) {
    walk_as(w, AGENT, x);
}
fn ticks(w: &mut WorldState, n: usize) {
    for _ in 0..n {
        SimulationRunner::new().tick(w, 0.5);
    }
}
fn entry<'a>(w: &'a WorldState, room: &str) -> &'a RoomMemoryEntry {
    &w.room_memory[AGENT].rooms[room]
}
fn has(w: &WorldState, kind: Evidence) -> bool {
    room_memory::evidence(w, AGENT, None, kind)
}
fn queue(w: &mut WorldState, actor: &str, command: &str, target: Option<&str>) {
    w.pending_commands.push(CommandDTO {
        command_id: command.into(),
        actor_id: actor.into(),
        target_id: target.map(str::to_owned),
        effects: vec![],
    });
}
fn command(w: &mut WorldState, command: &str, target: Option<&str>) -> bool {
    let before = w
        .progress
        .command_counts
        .get(command)
        .copied()
        .unwrap_or_default();
    queue(w, AGENT, command, target);
    ticks(w, 1);
    w.progress
        .command_counts
        .get(command)
        .copied()
        .unwrap_or_default()
        > before
}
fn forgotten_revisit(w: &mut WorldState) {
    walk(w, 820.0);
    walk(w, 780.0);
    ticks(w, 6);
    walk(w, 820.0);
    assert!(has(w, Evidence::ForgottenRevisit));
}

#[test]
fn authored_positions_items_and_initial_memory_do_not_fabricate_visits() {
    let w = world();
    assert_eq!(w.characters[AGENT].position.x, 300.0);
    assert_eq!(w.characters["bystander"].position.x, 500.0);
    assert!(w.characters.values().all(|c| c.position.y == 300.0));
    assert!(w.items.values().all(|i| i.position.y < 280.0));
    assert!(w.room_memory[AGENT].rooms.is_empty());
    assert!(!w.characters[AGENT]
        .mind_graph
        .nodes
        .contains_key("agent-memory-of-location"));
    assert!(w.scene.room_memory.is_some());
}

#[test]
fn leave_fade_forget_and_revisit_change_real_identity_and_observation_not_topology() {
    let mut w = world();
    let topology = serde_json::to_value(&w.scene).unwrap();
    let items = serde_json::to_value(&w.items).unwrap();
    walk(&mut w, 820.0);
    let original = entry(&w, "archive").variant_id.clone();
    assert_eq!(entry(&w, "archive").phase, Phase::Visible);
    let old_about = w.characters[AGENT].mind_graph.nodes["agent-memory-of-location"]
        .observation
        .as_ref()
        .unwrap()
        .about
        .clone();
    walk(&mut w, 780.0);
    ticks(&mut w, 2);
    assert_eq!(entry(&w, "archive").phase, Phase::Remembered);
    ticks(&mut w, 1);
    assert_eq!(entry(&w, "archive").phase, Phase::Fading);
    ticks(&mut w, 3);
    assert_eq!(entry(&w, "archive").phase, Phase::Forgotten);
    assert!(!w.characters[AGENT]
        .mind_graph
        .nodes
        .contains_key("agent-memory-of-location"));
    assert!(!has(&w, Evidence::ForgottenRevisit));
    walk(&mut w, 820.0);
    assert_ne!(entry(&w, "archive").variant_id, original);
    assert_ne!(
        w.characters[AGENT].mind_graph.nodes["agent-memory-of-location"]
            .observation
            .as_ref()
            .unwrap()
            .about,
        old_about
    );
    assert!(has(&w, Evidence::ForgottenRevisit));
    assert_eq!(serde_json::to_value(&w.scene).unwrap(), topology);
    assert_eq!(serde_json::to_value(&w.items).unwrap(), items);
}

#[test]
fn current_room_never_fades_and_paused_ticks_never_age_departed_memory() {
    let mut w = world();
    walk(&mut w, 820.0);
    ticks(&mut w, 12);
    assert_eq!(entry(&w, "archive").phase, Phase::Visible);
    walk(&mut w, 780.0);
    let before = serde_json::to_value(&w.room_memory).unwrap();
    let tick = w.tick;
    w.paused = true;
    ticks(&mut w, 50);
    room_memory::tick(&mut w);
    assert_eq!(w.tick, tick);
    assert_eq!(serde_json::to_value(&w.room_memory).unwrap(), before);
    w.paused = false;
    ticks(&mut w, 6);
    assert_eq!(entry(&w, "archive").phase, Phase::Forgotten);
}

#[test]
fn failed_or_in_room_movement_and_boundary_clamps_never_create_memory_visits() {
    let mut w = world();
    walk(&mut w, 780.0);
    let mut blocker = w.items["memory-drug"].clone();
    blocker.id = "solid-blocker".into();
    blocker.position.x = 820.0;
    blocker.position.y = 300.0;
    w.items.insert(blocker.id.clone(), blocker);
    w.item_rooms
        .insert("solid-blocker".into(), "archive".into());
    let before = serde_json::to_value(&w).unwrap();
    assert!(movement::move_character(&mut w, AGENT, 40.0, 0.0).is_err());
    assert_eq!(serde_json::to_value(&w).unwrap(), before);
    w.items.remove("solid-blocker");
    w.scene.portals.clear();
    movement::move_character(&mut w, AGENT, 40.0, 0.0).unwrap();
    assert_eq!(w.characters[AGENT].position.x, 800.0);
    assert!(w.room_memory[AGENT].rooms.is_empty());
}

#[test]
fn direct_and_in_tick_command_movement_share_exact_memory_transition() {
    let mut direct = world();
    walk(&mut direct, 780.0);
    let mut in_tick = direct.clone();
    movement::move_character(&mut direct, AGENT, 40.0, 0.0).unwrap();
    in_tick.command_defs.push(CommandDef {
        command_id: "test-walk".into(),
        label: "test-walk".into(),
        hotkey: None,
        targeting: TargetingMode::NoTarget,
        preconditions: vec![],
        effect_templates: vec![CommandEffect::MoveCharacter {
            delta_x: 40.0,
            delta_y: 0.0,
            target_character_id: None,
        }],
    });
    queue(&mut in_tick, AGENT, "test-walk", None);
    CommandSystem.run(&mut in_tick, 0.5);
    assert_eq!(
        direct.characters[AGENT].position.x,
        in_tick.characters[AGENT].position.x
    );
    assert_eq!(
        serde_json::to_value(&direct.room_memory).unwrap(),
        serde_json::to_value(&in_tick.room_memory).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&direct.characters[AGENT].mind_graph).unwrap(),
        serde_json::to_value(&in_tick.characters[AGENT].mind_graph).unwrap()
    );
}

#[test]
fn a_later_effect_failure_rolls_back_crossing_memory_and_its_feedback() {
    let mut w = world();
    walk(&mut w, 780.0);
    w.command_defs.push(CommandDef {
        command_id: "test-rollback".into(),
        label: "test-rollback".into(),
        hotkey: None,
        targeting: TargetingMode::NoTarget,
        preconditions: vec![],
        effect_templates: vec![
            CommandEffect::MoveCharacter {
                delta_x: 40.0,
                delta_y: 0.0,
                target_character_id: None,
            },
            CommandEffect::DeleteNode {
                schema_id: "test:missing".into(),
                target_character_id: Some("missing-recipient".into()),
            },
        ],
    });
    let memory = serde_json::to_value(&w.room_memory).unwrap();
    let graph = serde_json::to_value(&w.characters[AGENT].mind_graph).unwrap();
    queue(&mut w, AGENT, "test-rollback", None);
    CommandSystem.run(&mut w, 0.5);
    assert_eq!(w.characters[AGENT].position.x, 780.0);
    assert_eq!(w.entity_room(AGENT), Some("reception"));
    assert_eq!(serde_json::to_value(&w.room_memory).unwrap(), memory);
    assert_eq!(
        serde_json::to_value(&w.characters[AGENT].mind_graph).unwrap(),
        graph
    );
    assert!(!w
        .pending_events
        .iter()
        .any(|e| matches!(e, WorldEvent::RoomMemoryChanged { .. })));
}

#[test]
fn drug_alone_and_drugless_or_expired_remember_never_anchor() {
    let mut w = world();
    assert!(!command(&mut w, "remember-this-place", None));
    walk(&mut w, 820.0);
    assert!(!command(&mut w, "remember-this-place", None));
    walk(&mut w, 780.0);
    assert!(command(&mut w, "take-memory-drug", Some("bystander")));
    assert!(w.room_memory[AGENT].drug_until_tick.is_some());
    assert!(!w.room_memory.contains_key("bystander"));
    assert!(!command(&mut w, "take-memory-drug", None));
    assert!(!command(&mut w, "remember-this-place", None)); // Reception is not a visited affected room.
    walk(&mut w, 820.0);
    ticks(&mut w, 40);
    assert!(!command(&mut w, "remember-this-place", None));
    assert!(entry(&w, "archive").anchored_at_tick.is_none());
    walk(&mut w, 780.0);
    ticks(&mut w, 6);
    assert_eq!(entry(&w, "archive").phase, Phase::Forgotten);
    assert!(!has(&w, Evidence::AnchoredRevisit));
}

#[test]
fn drug_deadline_is_exclusive_and_queued_anchor_rechecks_actual_execution_tick() {
    let mut before_deadline = world();
    assert!(command(&mut before_deadline, "take-memory-drug", None));
    let until = before_deadline.room_memory[AGENT].drug_until_tick.unwrap();
    walk(&mut before_deadline, 820.0);
    ticks(&mut before_deadline, 38);
    assert_eq!(before_deadline.tick, until - 2);
    let mut at_deadline = before_deadline.clone();
    assert!(command(&mut before_deadline, "remember-this-place", None));
    assert_eq!(
        entry(&before_deadline, "archive").anchored_at_tick,
        Some(until - 1)
    );
    ticks(&mut at_deadline, 1);
    assert!(!command(&mut at_deadline, "remember-this-place", None));
    assert_eq!(at_deadline.tick, until);
    assert!(entry(&at_deadline, "archive").anchored_at_tick.is_none());
}

#[test]
fn active_drug_does_not_protect_unanchored_room_and_anchor_is_single_room_only() {
    let mut w = world();
    assert!(command(&mut w, "take-memory-drug", None));
    walk(&mut w, 820.0);
    assert!(command(&mut w, "investigate-area", None));
    assert!(entry(&w, "archive").anchored_at_tick.is_none());
    walk(&mut w, 780.0);
    ticks(&mut w, 6);
    assert_eq!(entry(&w, "archive").phase, Phase::Forgotten);
    walk(&mut w, 820.0);
    assert!(command(&mut w, "remember-this-place", Some("bystander")));
    let identity = entry(&w, "archive").variant_id.clone();
    assert!(!command(&mut w, "remember-this-place", None));
    assert!(!has(&w, Evidence::AnchoredRevisit)); // An anchor without leaving is not success.
    walk(&mut w, 1620.0);
    walk(&mut w, 1580.0);
    ticks(&mut w, 6);
    assert_eq!(entry(&w, "conservatory").phase, Phase::Forgotten);
    walk(&mut w, 780.0);
    ticks(&mut w, 45);
    assert_eq!(entry(&w, "archive").phase, Phase::Anchored);
    assert!(w.characters[AGENT]
        .mind_graph
        .nodes
        .contains_key("agent-memory-of-location"));
    walk(&mut w, 820.0);
    assert_eq!(entry(&w, "archive").variant_id, identity);
    assert!(has(&w, Evidence::AnchoredRevisit));
}

#[test]
fn witness_requires_actual_forgotten_revisit_same_room_and_correct_observer() {
    let mut w = world();
    assert!(!command(&mut w, "ask-bystander", Some("bystander")));
    forgotten_revisit(&mut w);
    assert!(!command(&mut w, "ask-bystander", Some("bystander")));
    assert!(!has(&w, Evidence::WitnessRecall));
    let def = w
        .command_defs
        .iter()
        .find(|d| d.command_id == "take-memory-drug")
        .unwrap();
    assert!(!command_available(def, "bystander", None, &w));
    assert!(room_memory::apply_drug(&mut w, "bystander").is_err());
    assert!(room_memory::anchor(&mut w, "bystander").is_err());
    assert!(room_memory::recall(&mut w, "bystander", Some(AGENT)).is_err());
    walk(&mut w, 780.0);
    assert!(!command(&mut w, "ask-bystander", Some(AGENT)));
    assert!(command(&mut w, "ask-bystander", Some("bystander")));
    assert!(has(&w, Evidence::WitnessRecall));
    assert!(!command(&mut w, "ask-bystander", Some("bystander")));
}

#[test]
fn command_spam_counts_and_other_character_crossings_cannot_satisfy_objectives() {
    let mut w = world();
    for _ in 0..5 {
        command(&mut w, "remember-this-place", None);
        command(&mut w, "investigate-area", None);
        command(&mut w, "ask-bystander", Some("bystander"));
    }
    walk_as(&mut w, "bystander", 820.0);
    walk_as(&mut w, "bystander", 780.0);
    ticks(&mut w, 6);
    for id in ["take-memory-drug", "remember-this-place", "ask-bystander"] {
        w.progress.command_counts.insert(id.into(), 999);
    }
    ticks(&mut w, 1);
    assert!(w.progress.objectives.iter().all(|o| !o.completed));
    assert_eq!(w.progress.status, LevelStatus::InProgress);
    assert!(w.room_memory[AGENT].rooms.is_empty());
}

#[test]
fn real_win_requires_forget_revisit_witness_drug_anchor_and_long_absence_return() {
    let mut w = world();
    forgotten_revisit(&mut w);
    walk(&mut w, 780.0);
    assert!(command(&mut w, "ask-bystander", Some("bystander")));
    assert!(command(&mut w, "take-memory-drug", None));
    walk(&mut w, 820.0);
    assert!(command(&mut w, "remember-this-place", None));
    ticks(&mut w, 10);
    assert_eq!(w.progress.status, LevelStatus::InProgress);
    walk(&mut w, 780.0);
    ticks(&mut w, 5);
    walk(&mut w, 820.0);
    assert!(!has(&w, Evidence::AnchoredRevisit));
    walk(&mut w, 780.0);
    ticks(&mut w, 6);
    walk(&mut w, 820.0);
    ticks(&mut w, 1);
    assert_eq!(w.progress.status, LevelStatus::Won);
    assert!(w.progress.objectives.iter().all(|o| o.completed));
    let receipt = &entry(&w, "archive").anchored_revisits[0];
    assert!(
        receipt.drug_used_at_tick <= receipt.anchored_at_tick
            && receipt.anchored_at_tick < receipt.drug_until_tick
    );
    assert!(w.event_log.iter().any(|e| matches!(e, WorldEvent::RoomMemoryChanged { kind, .. } if kind == "witness_you_forgot_this_place")));
}

#[test]
fn snapshot_preserves_fading_drug_anchor_receipts_and_deterministic_future_variants() {
    let mut original = world();
    walk(&mut original, 820.0);
    walk(&mut original, 780.0);
    ticks(&mut original, 3);
    let mut restored: WorldState =
        serde_json::from_value(serde_json::to_value(&original).unwrap()).unwrap();
    for w in [&mut original, &mut restored] {
        ticks(w, 3);
        walk(w, 820.0);
        walk(w, 780.0);
        assert!(command(w, "ask-bystander", Some("bystander")));
        assert!(command(w, "take-memory-drug", None));
        walk(w, 820.0);
        assert!(command(w, "remember-this-place", None));
        walk(w, 780.0);
        ticks(w, 3);
    }
    assert_eq!(
        serde_json::to_value(&original.room_memory).unwrap(),
        serde_json::to_value(&restored.room_memory).unwrap()
    );
    let mut anchored: WorldState =
        serde_json::from_value(serde_json::to_value(&restored).unwrap()).unwrap();
    ticks(&mut anchored, 3);
    walk(&mut anchored, 820.0);
    ticks(&mut anchored, 1);
    assert_eq!(anchored.progress.status, LevelStatus::Won);
    assert!(has(&anchored, Evidence::AnchoredRevisit));
}

#[test]
fn missing_snapshot_fields_and_nonconfigured_levels_disable_mechanism() {
    let legacy = load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/smart-cat"),
    )
    .unwrap();
    let mut value = serde_json::to_value(legacy).unwrap();
    value.as_object_mut().unwrap().remove("room_memory");
    value["scene"]
        .as_object_mut()
        .unwrap()
        .remove("room_memory");
    let mut restored: WorldState = serde_json::from_value(value).unwrap();
    ticks(&mut restored, 10);
    assert!(restored.room_memory.is_empty());
    assert!(room_memory::apply_drug(&mut restored, "trainer").is_err());
    assert!(room_memory::anchor(&mut restored, "trainer").is_err());

    let mut configured = world();
    walk(&mut configured, 820.0);
    let mut snapshot = serde_json::to_value(configured).unwrap();
    snapshot.as_object_mut().unwrap().remove("room_memory");
    let mut migrated: WorldState = serde_json::from_value(snapshot).unwrap();
    room_memory::initialize(&mut migrated);
    assert_eq!(entry(&migrated, "archive").phase, Phase::Visible);
    assert_eq!(entry(&migrated, "archive").visit_count, 1);
    assert!(!has(&migrated, Evidence::ForgottenRevisit));
    assert!(!has(&migrated, Evidence::AnchoredRevisit));
}

#[test]
fn invalid_config_is_rejected_and_hashmap_order_cannot_affect_variant() {
    let w = world();
    for mutation in 0..3 {
        let mut invalid = w.clone();
        let c = invalid.scene.room_memory.as_mut().unwrap();
        match mutation {
            0 => c.observer_ids = vec!["missing-observer".into()],
            1 => c.witness_ids = vec!["missing-witness".into()],
            _ => c.drug_item_id = "missing-drug".into(),
        }
        assert!(room_memory::validate_world(&invalid).is_err());
    }
    for mutation in 0..7 {
        let mut scene = w.scene.clone();
        let c = scene.room_memory.as_mut().unwrap();
        match mutation {
            0 => c.forget_after_ticks = c.fade_after_ticks,
            1 => c.drug_duration_ticks = 0,
            2 => c.observer_ids.push(c.observer_ids[0].clone()),
            3 => c.rooms[0].room_id = "missing".into(),
            4 => c.rooms[0].variants.truncate(1),
            5 => c.rooms[0].variants[1].id = c.rooms[0].variants[0].id.clone(),
            _ => c
                .observation_node_ids
                .insert("missing".into(), "bad".into())
                .map(|_| ())
                .unwrap_or(()),
        }
        assert!(scene.validate().is_err(), "mutation {mutation}");
    }
    let mut a = w.clone();
    let mut b = w;
    let characters: Vec<_> = b.characters.drain().collect();
    for (id, c) in characters.into_iter().rev() {
        b.characters.insert(id, c);
    }
    forgotten_revisit(&mut a);
    forgotten_revisit(&mut b);
    assert_eq!(
        serde_json::to_value(&a.room_memory).unwrap(),
        serde_json::to_value(&b.room_memory).unwrap()
    );
}

fn causal_save() -> WorldState {
    let mut w = world();
    forgotten_revisit(&mut w);
    walk(&mut w, 780.0);
    assert!(command(&mut w, "ask-bystander", Some("bystander")));
    assert!(command(&mut w, "take-memory-drug", None));
    walk(&mut w, 820.0);
    assert!(command(&mut w, "remember-this-place", None));
    walk(&mut w, 780.0);
    ticks(&mut w, 6);
    walk(&mut w, 820.0);
    w
}

#[test]
fn shared_restore_accepts_all_real_phases_and_preserves_complete_causal_state() {
    let mut w = world();
    for step in 0..8 {
        match step {
            0 => (),
            1 => walk(&mut w, 820.0),
            2 => walk(&mut w, 780.0),
            3 | 4 => ticks(&mut w, 3),
            5 => walk(&mut w, 820.0),
            6 => w = causal_save(),
            _ => walk(&mut w, 780.0),
        }
        let memory = serde_json::to_value(&w.room_memory).unwrap();
        let restored =
            intention_tower_game_lib::save_slots::prepare_restored_world(w.clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&restored.room_memory).unwrap(),
            memory,
            "phase step {step}"
        );
    }
}

#[test]
fn shared_restore_rejects_inconsistent_runtime_memory_and_receipt_structure() {
    let valid = serde_json::to_value(causal_save()).unwrap();
    let future = valid["tick"].as_u64().unwrap() + 100;
    let paths = [
        (
            "/room_memory/antimeme-agent/rooms/archive/phase",
            serde_json::json!("forgotten"),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/variant_id",
            serde_json::json!("invented"),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/background_key",
            serde_json::json!("wrong-background"),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/generation",
            serde_json::json!(99),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/visit_count",
            serde_json::json!(0),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/revisit_count",
            serde_json::json!(999),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/forgotten_count",
            serde_json::json!(999),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/anchored_revisit_count",
            serde_json::json!(999),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/entered_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/last_seen_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/left_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/forgotten_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/anchor_drug_until_tick",
            serde_json::json!(null),
        ),
        (
            "/room_memory/antimeme-agent/drug_used_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/drug_until_tick",
            serde_json::json!(null),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/forgotten_revisits/0/generation",
            serde_json::json!(2),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/forgotten_revisits/0/previous_variant_id",
            serde_json::json!("wrong"),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/forgotten_revisits/0/revisited_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/anchored_revisits/0/returned_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/anchored_revisits/0/drug_until_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/witness_recalls/0/recalled_at_tick",
            serde_json::json!(future),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/witness_recalls/0/revisited_at_tick",
            serde_json::json!(0),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/witness_recalls/0/meeting_room_id",
            serde_json::json!("missing"),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/witness_recalls/0/witness_id",
            serde_json::json!(AGENT),
        ),
        (
            "/room_memory/antimeme-agent/rooms/archive/witness_recalls/0/generation",
            serde_json::json!(0),
        ),
    ];
    for (path, value) in paths {
        let mut corrupted = valid.clone();
        *corrupted.pointer_mut(path).unwrap() = value;
        let restored = serde_json::from_value(corrupted).unwrap();
        assert!(
            intention_tower_game_lib::save_slots::prepare_restored_world(restored).is_err(),
            "accepted corruption {path}"
        );
    }
    let mut departed = causal_save();
    walk(&mut departed, 780.0);
    let e = departed
        .room_memory
        .get_mut(AGENT)
        .unwrap()
        .rooms
        .get_mut("archive")
        .unwrap();
    e.phase = Phase::Visible;
    e.left_at_tick = None;
    assert!(intention_tower_game_lib::save_slots::prepare_restored_world(departed).is_err());
    for observer in [false, true] {
        let mut w = causal_save();
        if observer {
            let memory = w.room_memory[AGENT].clone();
            w.room_memory.insert("unconfigured-observer".into(), memory);
        } else {
            let memory = entry(&w, "archive").clone();
            w.room_memory
                .get_mut(AGENT)
                .unwrap()
                .rooms
                .insert("unconfigured-room".into(), memory);
        }
        assert!(intention_tower_game_lib::save_slots::prepare_restored_world(w).is_err());
    }
}

#[test]
fn observation_ids_and_sync_never_overwrite_or_delete_unrelated_nodes() {
    for default_id in [false, true] {
        for conflict_kind in 0..3 {
            let mut w = world();
            let config = w.scene.room_memory.as_mut().unwrap();
            let id = if default_id {
                config.observation_node_ids.remove("archive");
                "room-memory:archive"
            } else {
                "agent-memory-of-location"
            };
            let mut node = w.characters[AGENT].mind_graph.nodes["agent-investigate"].clone();
            node.instance_id = id.into();
            if conflict_kind == 0 {
                node.node_type = intention_tower_game_lib::models::mind_node::NodeType::Observation;
                node.action = None;
                node.observation = Some(Default::default());
            } else {
                node.schema_id = config.observation_schema_id.clone();
                if conflict_kind == 2 {
                    node.node_type =
                        intention_tower_game_lib::models::mind_node::NodeType::Motivation;
                    node.action = None;
                    node.motivation = Some(Default::default());
                }
            }
            let original = serde_json::to_value(&node).unwrap();
            w.characters
                .get_mut(AGENT)
                .unwrap()
                .mind_graph
                .nodes
                .insert(id.into(), node);
            assert!(room_memory::validate_world(&w).is_err());
            assert!(
                intention_tower_game_lib::save_slots::prepare_restored_world(w.clone()).is_err()
            );
            walk(&mut w, 820.0);
            w.tick += 1;
            room_memory::tick(&mut w);
            assert_eq!(
                serde_json::to_value(&w.characters[AGENT].mind_graph.nodes[id]).unwrap(),
                original
            );
            walk(&mut w, 780.0);
            for _ in 0..6 {
                w.tick += 1;
                room_memory::tick(&mut w);
            }
            assert!(w.characters[AGENT].mind_graph.nodes.contains_key(id));
        }
    }
}

#[test]
fn unconfigured_entry_cannot_supply_any_objective_evidence() {
    let mut w = causal_save();
    let receipt = entry(&w, "archive").clone();
    w.room_memory.get_mut(AGENT).unwrap().rooms.clear();
    w.room_memory
        .get_mut(AGENT)
        .unwrap()
        .rooms
        .insert("unconfigured-room".into(), receipt);
    for kind in [
        Evidence::ForgottenRevisit,
        Evidence::WitnessRecall,
        Evidence::AnchoredRevisit,
    ] {
        assert!(!has(&w, kind));
        assert!(!room_memory::evidence(
            &w,
            AGENT,
            Some("unconfigured-room"),
            kind
        ));
    }
}

#[cfg(feature = "test-server")]
#[tokio::test]
async fn actual_mcp_restore_is_atomic_rejects_bad_state_and_migrates_missing_state_only() {
    use intention_tower_game_lib::test_server::{dispatch::call_tool, state::TestServerState};
    let server = TestServerState::new();
    let w = causal_save();
    let snapshot = serde_json::to_value(&w).unwrap();
    call_tool(
        &server,
        "restore_snapshot",
        &serde_json::json!({"world":snapshot}),
    )
    .await
    .unwrap();
    let actual = call_tool(&server, "snapshot", &serde_json::json!({}))
        .await
        .unwrap();
    assert_eq!(actual["room_memory"], snapshot["room_memory"]);
    assert_eq!(
        actual["characters"][AGENT]["mind_graph"],
        snapshot["characters"][AGENT]["mind_graph"]
    );
    let mut corrupt = snapshot.clone();
    corrupt["room_memory"][AGENT]["rooms"]["archive"]["phase"] = serde_json::json!("forgotten");
    assert!(call_tool(
        &server,
        "restore_snapshot",
        &serde_json::json!({"world":corrupt})
    )
    .await
    .is_err());
    assert_eq!(
        call_tool(&server, "snapshot", &serde_json::json!({}))
            .await
            .unwrap(),
        actual
    );
    let mut legacy = snapshot;
    legacy.as_object_mut().unwrap().remove("room_memory");
    call_tool(
        &server,
        "restore_snapshot",
        &serde_json::json!({"world":legacy}),
    )
    .await
    .unwrap();
    let migrated = server.world.lock().unwrap();
    assert_eq!(entry(&migrated, "archive").phase, Phase::Visible);
    assert_eq!(entry(&migrated, "archive").generation, 0);
    assert!(entry(&migrated, "archive").forgotten_revisits.is_empty());
    assert!(entry(&migrated, "archive").anchored_revisits.is_empty());
    assert!(migrated.room_memory[AGENT].drug_until_tick.is_none());
}
