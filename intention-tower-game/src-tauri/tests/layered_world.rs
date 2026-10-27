use intention_tower_game_lib::{
    layered_world as layers,
    level_loader::load_level_from_path,
    models::{
        commands::{CommandDTO, CommandEffect},
        events::WorldEvent,
        progress::LevelStatus,
        world_state::WorldState,
    },
    movement,
    save_slots::prepare_restored_world,
    systems::{
        command_system::CommandSystem, level_progress::LevelProgressSystem,
        perception::PerceptionSystem, System,
    },
};

fn world() -> WorldState {
    load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/cyber-dream"),
    )
    .unwrap()
}
fn walk(w: &mut WorldState, x: f64) {
    for _ in 0..150 {
        let dx = x - w.characters["player"].position.x;
        if dx.abs() < 0.001 {
            return;
        }
        movement::move_character(w, "player", dx.clamp(-40.0, 40.0), 0.0).unwrap();
    }
    panic!("cannot reach {x}")
}
fn cmd(w: &mut WorldState, id: &str) -> bool {
    let n = w.progress.command_counts.get(id).copied().unwrap_or(0);
    w.pending_commands.push(CommandDTO {
        command_id: id.into(),
        actor_id: "player".into(),
        target_id: None,
        effects: vec![],
    });
    CommandSystem.run(w, 0.0);
    w.progress.command_counts.get(id).copied().unwrap_or(0) > n
}
fn enter_two(w: &mut WorldState) {
    walk(w, 1100.0);
    assert!(cmd(w, "examine-reality"));
    walk(w, 200.0);
    assert!(cmd(w, "enter-vr"));
    walk(w, 2600.0);
    assert!(cmd(w, "examine-reality"));
    walk(w, 3000.0);
    assert!(cmd(w, "enter-vr"));
    walk(w, 4300.0);
    assert!(cmd(w, "examine-reality"));
}
fn unwind(w: &mut WorldState) {
    walk(w, 3400.0);
    assert!(cmd(w, "exit-vr"));
    assert_eq!(w.characters["player"].position.x, 3000.0);
    assert_eq!(w.entity_room("player"), Some("outer-exchange"));
    walk(w, 1800.0);
    assert!(cmd(w, "exit-vr"));
    assert_eq!(w.characters["player"].position.x, 200.0);
    assert_eq!(w.entity_room("player"), Some("reality-workshop"));
}
#[test]
fn causal_route_requires_three_local_notes_two_entries_comparison_unwind_and_food() {
    let mut w = world();
    enter_two(&mut w);
    assert!(cmd(&mut w, "compare-layers"));
    assert!(layers::evidence(&w, "player", false));
    assert!(!layers::evidence(&w, "player", true));
    for (id, o) in &w.layered_world["player"].observations {
        let node = &w.characters["player"].mind_graph.nodes[&o.id];
        assert_eq!(node.reality_layer, o.depth);
        assert_eq!(node.is_virtual, id != "reality");
    }
    let hunger = w.characters["player"].mind_graph.nodes["player-hunger"].value;
    assert!(cmd(&mut w, "earn-virtual-reward"));
    assert!(!cmd(&mut w, "earn-virtual-reward"));
    assert_eq!(
        w.characters["player"].mind_graph.nodes["player-hunger"].value,
        hunger
    );
    unwind(&mut w);
    LevelProgressSystem.run(&mut w, 0.0);
    assert_eq!(w.progress.status, LevelStatus::InProgress);
    walk(&mut w, 1300.0);
    assert!(cmd(&mut w, "satisfy-real-need"));
    assert_eq!(w.items["real-meal"].quantity, 0.0);
    assert!(layers::evidence(&w, "player", true));
    assert!(
        w.layered_world["player"]
            .need_receipt
            .as_ref()
            .unwrap()
            .before
            - w.layered_world["player"]
                .need_receipt
                .as_ref()
                .unwrap()
                .after
            >= 0.5
    );
    LevelProgressSystem.run(&mut w, 0.0);
    assert_eq!(w.progress.status, LevelStatus::Won);
    assert!(prepare_restored_world(w).is_ok());
}
#[test]
fn invalid_commands_are_atomic_and_old_counter_spam_cannot_win() {
    let mut w = world();
    for id in [
        "enter-vr",
        "exit-vr",
        "examine-reality",
        "compare-layers",
        "satisfy-real-need",
        "earn-virtual-reward",
    ] {
        let before = serde_json::to_value(&w.layered_world).unwrap();
        assert!(!cmd(&mut w, id));
        assert_eq!(before, serde_json::to_value(&w.layered_world).unwrap());
    }
    for id in ["enter-vr", "exit-vr", "examine-reality", "compare-layers"] {
        w.progress.command_counts.insert(id.into(), 100);
    }
    LevelProgressSystem.run(&mut w, 0.0);
    assert_eq!(w.progress.status, LevelStatus::InProgress);
    assert!(layers::apply(&mut w, "missing", None, &CommandEffect::EnterLayer).is_err());
    assert!(layers::apply(&mut w, "player", Some("wrong"), &CommandEffect::EnterLayer).is_err());
    enter_two(&mut w);
    let before = serde_json::to_value(&w.layered_world).unwrap();
    assert!(!cmd(&mut w, "enter-vr"));
    assert!(!cmd(&mut w, "exit-vr"));
    assert!(!cmd(&mut w, "satisfy-real-need"));
    assert_eq!(before, serde_json::to_value(&w.layered_world).unwrap());
}
#[test]
fn room_crossings_cannot_walk_between_layers_and_notes_remain_isolated() {
    let mut w = world();
    walk(&mut w, 1590.0);
    movement::move_character(&mut w, "player", 40.0, 0.0).unwrap();
    assert_eq!(w.characters["player"].position.x, 1600.0);
    assert_eq!(w.entity_room("player"), Some("reality-garden"));
    assert!(!cmd(&mut w, "enter-vr"));
    walk(&mut w, 1100.0);
    assert!(cmd(&mut w, "examine-reality"));
    walk(&mut w, 200.0);
    assert!(cmd(&mut w, "enter-vr"));
    assert_eq!(w.entity_room("player"), Some("outer-arrival"));
    assert!(!w.same_room("player", "reality-cue"));
    assert!(!cmd(&mut w, "examine-reality"));
    assert_eq!(w.layered_world["player"].observations.len(), 1);
    let root_note = w.layered_world["player"].observations["reality"].id.clone();
    assert_eq!(
        w.characters["player"].mind_graph.nodes[&root_note].reality_layer,
        0
    );
}
#[test]
fn save_restore_preserves_layer_stack_notes_and_return_coordinates() {
    let mut w = world();
    enter_two(&mut w);
    assert!(cmd(&mut w, "compare-layers"));
    let json = serde_json::to_string(&w).unwrap();
    let mut restored = prepare_restored_world(serde_json::from_str(&json).unwrap()).unwrap();
    assert_eq!(restored.layered_world["player"].stack.len(), 2);
    assert_eq!(restored.layered_world["player"].observations.len(), 3);
    unwind(&mut restored);
    assert!(layers::evidence(&restored, "player", false));
    for mutation in 0..6 {
        let mut bad = w.clone();
        let s = bad.layered_world.get_mut("player").unwrap();
        match mutation {
            0 => s.context_id = "reality".into(),
            1 => s.stack[0].room_id = "inner-archive".into(),
            2 => s.stack[1].entered_at_tick = bad.tick + 1,
            3 => s.comparison.as_mut().unwrap().observation_ids[0] = "invented".into(),
            4 => s.observations.get_mut("inner").unwrap().observed_at_tick = bad.tick + 1,
            _ => {
                bad.character_rooms
                    .insert("player".into(), "reality-workshop".into());
            }
        }
        assert!(prepare_restored_world(bad).is_err(), "mutation {mutation}");
    }
}
#[test]
fn actor_local_context_stamps_perception_not_default_actor_global_flags() {
    let mut w = world();
    let mut npc = w.characters["player"].clone();
    npc.id = "witness".into();
    npc.position.x = 500.0;
    w.characters.insert("witness".into(), npc);
    w.character_rooms
        .insert("witness".into(), "reality-workshop".into());
    walk(&mut w, 200.0);
    assert!(cmd(&mut w, "enter-vr"));
    w.pending_events.push(WorldEvent::SoundEmitted {
        source_entity_id: "witness".into(),
        about: "it:concept/real-sound".into(),
        modality: "Auditory".into(),
    });
    PerceptionSystem.run(&mut w, 0.0);
    let n = w.characters["witness"]
        .mind_graph
        .find_by_schema("it:concept/real-sound")
        .unwrap();
    assert_eq!(n.reality_layer, 0);
    assert!(!n.is_virtual);
    assert!(w.characters["player"]
        .mind_graph
        .find_by_schema("it:concept/real-sound")
        .is_none());
}
#[test]
fn legacy_flags_are_archived_without_inventing_layer_evidence() {
    let mut w = world();
    w.layered_world.clear();
    w.progress.status = LevelStatus::Won;
    for objective in &mut w.progress.objectives {
        objective.completed = true;
        objective.completed_at_tick = Some(0);
    }
    w.in_virtual_context = true;
    w.virtual_context_stack = vec!["old-dream".into(), "old-inner".into()];
    let restored = prepare_restored_world(w).unwrap();
    let s = &restored.layered_world["player"];
    assert_eq!(s.context_id, "reality");
    assert_eq!(s.max_depth, 0);
    assert!(s.observations.is_empty());
    assert!(s.comparison.is_none());
    assert_eq!(s.legacy_virtual_context_stack.len(), 2);
    assert!(!restored.in_virtual_context);
    assert_eq!(restored.progress.status, LevelStatus::InProgress);
    assert!(restored.progress.objectives.iter().all(|o| !o.completed));
}

#[test]
fn configured_actors_have_independent_visits_and_cannot_borrow_progress() {
    let mut w = world();
    let mut other = w.characters["player"].clone();
    other.id = "other".into();
    other.position.x = 100.0;
    w.characters.insert("other".into(), other);
    w.character_rooms
        .insert("other".into(), "reality-workshop".into());
    w.scene
        .layered_world
        .as_mut()
        .unwrap()
        .actor_ids
        .push("other".into());
    layers::initialize(&mut w);
    enter_two(&mut w);
    assert!(cmd(&mut w, "compare-layers"));
    assert!(layers::evidence(&w, "player", false));
    assert!(!layers::evidence(&w, "other", false));
    assert_eq!(w.layered_world["other"].context_id, "reality");
    assert!(w.layered_world["other"].observations.is_empty());
    assert!(prepare_restored_world(w).is_ok());
}

#[test]
fn a_failed_compound_command_rolls_back_teleport_history_and_events() {
    let mut w = world();
    walk(&mut w, 200.0);
    let def = w
        .command_defs
        .iter_mut()
        .find(|d| d.command_id == "enter-vr")
        .unwrap();
    def.effect_templates.push(CommandEffect::ConsumeResource {
        resource_schema_id: "it:concept/missing".into(),
        amount: 1.0,
        target_character_id: None,
    });
    let before = serde_json::to_value(&w.layered_world).unwrap();
    let events = w.pending_events.len();
    assert!(!cmd(&mut w, "enter-vr"));
    assert_eq!(w.characters["player"].position.x, 200.0);
    assert_eq!(before, serde_json::to_value(&w.layered_world).unwrap());
    assert!(!w.pending_events[events..]
        .iter()
        .any(|e| matches!(e, WorldEvent::LayeredWorldChanged { .. })));
}

#[test]
fn proximity_boundary_and_historical_event_payload_are_authoritative() {
    let mut w = world();
    walk(&mut w, 260.0);
    assert!(cmd(&mut w, "enter-vr"));
    let event = w
        .pending_events
        .iter()
        .find_map(|e| match e {
            WorldEvent::LayeredWorldChanged { kind, fact, .. } if kind == "entered" => fact.clone(),
            _ => None,
        })
        .unwrap();
    walk(&mut w, 2600.0);
    assert_eq!(event["from_position"]["x"], 260.0);
    assert_eq!(event["to_position"]["x"], 1800.0);
    let mut bad = w.clone();
    bad.characters.get_mut("player").unwrap().position.x = 200.0;
    assert!(prepare_restored_world(bad).is_err());
    let mut far = world();
    walk(&mut far, 261.0);
    assert!(!cmd(&mut far, "enter-vr"));
}

fn old_single_map(depth: usize, completed: bool) -> WorldState {
    let mut w = world();
    w.scene = Default::default();
    w.character_rooms.clear();
    w.item_rooms.clear();
    w.layered_world.clear();
    w.layered_world_migration = None;
    w.items.retain(|id, _| id == "vr-terminal-l1");
    w.characters
        .get_mut("player")
        .unwrap()
        .mind_graph
        .nodes
        .remove("player-hunger");
    w.tick = 20;
    w.in_virtual_context = depth > 0;
    w.virtual_context_stack = (1..=depth).map(|n| format!("virtual-layer-{n}")).collect();
    w.progress
        .command_counts
        .insert("enter-vr".into(), depth as u32);
    w.progress
        .command_counts
        .insert("compare-layers".into(), 100);
    for definition in &mut w.command_defs {
        if definition.command_id == "enter-vr" {
            definition.effect_templates = vec![CommandEffect::SetVirtualContext { value: true }];
        }
        if definition.command_id == "exit-vr" {
            definition.effect_templates = vec![CommandEffect::SetVirtualContext { value: false }];
        }
    }
    for objective in &mut w.progress.objectives {
        objective.condition =
            intention_tower_game_lib::models::progress::LevelCondition::CommandUsed {
                command_id: "compare-layers".into(),
                min_count: 1,
                distinct_targets: 0,
            };
    }
    if completed {
        w.progress.status = LevelStatus::Won;
        w.progress.completed_at_tick = Some(10);
        for objective in &mut w.progress.objectives {
            objective.completed = true;
            objective.completed_at_tick = Some(10);
        }
    }
    w
}

#[test]
fn desktop_and_mcp_shared_authoring_boundary_migrates_legacy_depths_without_credit() {
    use intention_tower_game_lib::save_slots::prepare_restored_world_with_authoring;
    for depth in 0..=2 {
        for completed in [false, true] {
            let old = old_single_map(depth, completed);
            let original = serde_json::to_value(&old).unwrap();
            let before_mind = old.characters["player"].mind_graph.clone();
            let migrated =
                prepare_restored_world_with_authoring(old.clone(), Some(world())).unwrap();
            assert_eq!(
                serde_json::to_value(&old).unwrap(),
                original,
                "read-only source snapshot"
            );
            assert_eq!(migrated.progress.status, LevelStatus::InProgress);
            assert!(migrated.progress.command_counts.is_empty());
            assert_eq!(migrated.characters["player"].position.x, 300.0);
            assert_eq!(migrated.entity_room("player"), Some("reality-workshop"));
            assert_eq!(migrated.items["real-meal"].quantity, 1.0);
            assert_eq!(
                migrated.characters["player"].mind_graph.nodes["player-hunger"].value,
                0.75
            );
            for (id, node) in before_mind.nodes {
                assert_eq!(
                    serde_json::to_value(node).unwrap(),
                    serde_json::to_value(&migrated.characters["player"].mind_graph.nodes[&id])
                        .unwrap()
                );
            }
            let state = &migrated.layered_world["player"];
            assert!(state.stack.is_empty());
            assert!(state.observations.is_empty());
            assert!(state.transitions.is_empty());
            assert_eq!(state.max_depth, 0);
            assert!(!layers::evidence(&migrated, "player", false));
            let receipt = migrated.layered_world_migration.as_ref().unwrap();
            assert_eq!(receipt.legacy_virtual_context_stack.len(), depth);
            assert_eq!(
                receipt.legacy_progress.status,
                if completed {
                    LevelStatus::Won
                } else {
                    LevelStatus::InProgress
                }
            );
            assert_eq!(
                receipt.legacy_progress.command_counts["compare-layers"],
                100
            );
            assert!(migrated.event_log.iter().any(|e|matches!(e,WorldEvent::LayeredWorldChanged {kind,depth:0,..} if kind=="migrated")));
            let again =
                prepare_restored_world_with_authoring(migrated.clone(), Some(world())).unwrap();
            assert_eq!(
                serde_json::to_value(again).unwrap(),
                serde_json::to_value(migrated).unwrap()
            );
        }
    }
    let unrelated = load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/pavlov"),
    )
    .unwrap();
    let unchanged =
        prepare_restored_world_with_authoring(unrelated.clone(), Some(unrelated.clone())).unwrap();
    assert_eq!(
        serde_json::to_value(unchanged).unwrap(),
        serde_json::to_value(unrelated).unwrap()
    );
    let mut corrupt = old_single_map(2, true);
    corrupt.tick = 0;
    assert!(prepare_restored_world_with_authoring(corrupt, Some(world())).is_err());
    for mutation in 0..3 {
        let mut malformed = old_single_map(2, true);
        match mutation {
            0 => malformed.scene.platforms.clear(),
            1 => {
                malformed
                    .character_rooms
                    .insert("player".into(), "invented-room".into());
            }
            _ => {
                malformed.characters.remove("player");
            }
        }
        assert!(
            prepare_restored_world_with_authoring(malformed, Some(world())).is_err(),
            "malformed legacy case {mutation}"
        );
    }
    let mut traversal = old_single_map(1, false);
    traversal.level_id = "../cyber-dream".into();
    assert!(prepare_restored_world_with_authoring(traversal, Some(world())).is_err());
    let mut wrong = world();
    wrong.level_id = "other".into();
    assert!(prepare_restored_world_with_authoring(old_single_map(1, false), Some(wrong)).is_err());
}

#[cfg(feature = "test-server")]
#[tokio::test]
async fn actual_mcp_legacy_restore_migrates_and_corrupt_restore_is_atomic() {
    use intention_tower_game_lib::test_server::{dispatch::call_tool, state::TestServerState};
    let server = TestServerState::new();
    for depth in 0..=2 {
        let source = serde_json::to_value(old_single_map(depth, true)).unwrap();
        call_tool(
            &server,
            "restore_snapshot",
            &serde_json::json!({"world":source}),
        )
        .await
        .unwrap();
        let actual = call_tool(&server, "snapshot", &serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(actual["layered_world"]["player"]["context_id"], "reality");
        assert_eq!(
            actual["layered_world_migration"]["legacy_virtual_context_stack"]
                .as_array()
                .unwrap()
                .len(),
            depth
        );
        assert_eq!(actual["progress"]["status"], "InProgress");
        let mut corrupt = source.clone();
        corrupt["progress"]["completed_at_tick"] = serde_json::json!(999);
        assert!(call_tool(
            &server,
            "restore_snapshot",
            &serde_json::json!({"world":corrupt})
        )
        .await
        .is_err());
        let mut traversal = source;
        traversal["level_id"] = serde_json::json!("../cyber-dream");
        assert!(call_tool(
            &server,
            "restore_snapshot",
            &serde_json::json!({"world":traversal})
        )
        .await
        .is_err());
        assert_eq!(
            actual,
            call_tool(&server, "snapshot", &serde_json::json!({}))
                .await
                .unwrap()
        );
    }
}

fn completed_receipts_at_distinct_ticks() -> WorldState {
    let mut w = world();
    w.tick = 10;
    walk(&mut w, 1100.0);
    assert!(cmd(&mut w, "examine-reality"));
    w.tick = 20;
    walk(&mut w, 200.0);
    assert!(cmd(&mut w, "enter-vr"));
    w.tick = 30;
    walk(&mut w, 2600.0);
    assert!(cmd(&mut w, "examine-reality"));
    w.tick = 40;
    walk(&mut w, 3000.0);
    assert!(cmd(&mut w, "enter-vr"));
    w.tick = 50;
    walk(&mut w, 4300.0);
    assert!(cmd(&mut w, "examine-reality"));
    w.tick = 60;
    assert!(cmd(&mut w, "compare-layers"));
    w.tick = 70;
    walk(&mut w, 3400.0);
    assert!(cmd(&mut w, "exit-vr"));
    w.tick = 80;
    walk(&mut w, 1800.0);
    assert!(cmd(&mut w, "exit-vr"));
    w.tick = 90;
    walk(&mut w, 1300.0);
    assert!(cmd(&mut w, "satisfy-real-need"));
    w.tick = 100;
    w
}

#[test]
fn restore_replays_context_at_each_past_receipt_not_just_any_earlier_entry() {
    let w = completed_receipts_at_distinct_ticks();
    assert!(prepare_restored_world(w.clone()).is_ok());
    for case in 0..6 {
        let mut bad = w.clone();
        let state = bad.layered_world.get_mut("player").unwrap();
        match case {
            0 => {
                let note = state.observations.get_mut("inner").unwrap();
                note.observed_at_tick = 85;
                bad.characters
                    .get_mut("player")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .get_mut(&note.id)
                    .unwrap()
                    .created_at = 85;
                state.comparison.as_mut().unwrap().compared_at_tick = 86;
            }
            1 => {
                let note = state.observations.get_mut("reality").unwrap();
                note.observed_at_tick = 45;
                bad.characters
                    .get_mut("player")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .get_mut(&note.id)
                    .unwrap()
                    .created_at = 45;
            }
            2 => state.need_receipt.as_mut().unwrap().satisfied_at_tick = 65,
            3 => {
                state.observations.get_mut("inner").unwrap().sequence =
                    state.observations["outer"].sequence
            }
            4 => state.transitions.swap(0, 1),
            _ => state.next_sequence += 1,
        }
        assert!(
            prepare_restored_world(bad).is_err(),
            "impossible past receipt case {case}"
        );
    }
}

#[test]
fn same_tick_sequence_distinguishes_legal_route_from_wrong_context_receipts() {
    let mut w = world();
    enter_two(&mut w);
    assert!(cmd(&mut w, "compare-layers"));
    unwind(&mut w);
    walk(&mut w, 1300.0);
    assert!(cmd(&mut w, "satisfy-real-need"));
    assert!(
        prepare_restored_world(w.clone()).is_ok(),
        "same-tick legal commands must restore"
    );
    let mut meal_before_returns = w.clone();
    let state = meal_before_returns.layered_world.get_mut("player").unwrap();
    state.need_receipt.as_mut().unwrap().sequence = 7;
    state.transitions[2].sequence = 8;
    state.transitions[3].sequence = 9;
    assert!(
        prepare_restored_world(meal_before_returns).is_err(),
        "meal cannot precede unwind even with identical ticks"
    );
    let mut inner_after_return = w.clone();
    let state = inner_after_return.layered_world.get_mut("player").unwrap();
    state.observations.get_mut("inner").unwrap().sequence = 8;
    state.transitions[2].sequence = 5;
    state.transitions[3].sequence = 6;
    state.comparison.as_mut().unwrap().sequence = 7;
    assert!(prepare_restored_world(inner_after_return).is_err());
    let mut real_while_inner = w;
    let state = real_while_inner.layered_world.get_mut("player").unwrap();
    state.observations.get_mut("reality").unwrap().sequence = 5;
    state.observations.get_mut("inner").unwrap().sequence = 1;
    assert!(prepare_restored_world(real_while_inner).is_err());
}

#[test]
fn compound_layer_availability_uses_the_exact_sequential_staged_effects() {
    use intention_tower_game_lib::{
        command_rules::command_available,
        models::commands::{CommandDef, TargetingMode},
    };
    let mut w = world();
    // Movement makes entry possible; checking EnterLayer against the original
    // world would incorrectly hide this valid compound command.
    let definition = CommandDef {
        command_id: "walk-enter".into(),
        label: "test".into(),
        hotkey: None,
        targeting: TargetingMode::NoTarget,
        preconditions: vec![],
        effect_templates: vec![
            CommandEffect::MoveCharacter {
                delta_x: -40.0,
                delta_y: 0.0,
                target_character_id: None,
            },
            CommandEffect::EnterLayer,
        ],
    };
    assert!(command_available(&definition, "player", None, &w));
    w.command_defs.push(definition);
    assert!(cmd(&mut w, "walk-enter"));
    assert_eq!(w.layered_world["player"].context_id, "outer");
    assert_eq!(w.layered_world["player"].stack[0].position.x, 260.0);
    // Two individually available observations must not be offered as a batch:
    // the first receipt makes the second a rejected duplicate.
    walk(&mut w, 2600.0);
    let duplicate = CommandDef {
        command_id: "duplicate-note".into(),
        label: "test".into(),
        hotkey: None,
        targeting: TargetingMode::NoTarget,
        preconditions: vec![],
        effect_templates: vec![CommandEffect::ObserveLayer, CommandEffect::ObserveLayer],
    };
    assert!(!command_available(&duplicate, "player", None, &w));
    w.command_defs.push(duplicate);
    assert!(!cmd(&mut w, "duplicate-note"));
    assert!(w.layered_world["player"].observations.is_empty());
}

#[test]
fn virtual_meme_provenance_is_authored_and_new_injection_is_actor_local() {
    use intention_tower_game_lib::models::{
        commands::{CommandDef, TargetingMode},
        mind_node::MemeData,
    };
    let mut w = world();
    assert_eq!(
        w.characters["player"].mind_graph.nodes["player-virtual-achievement-l1"].reality_layer,
        1
    );
    assert!(w.characters["player"].mind_graph.nodes["player-virtual-achievement-l1"].is_virtual);
    assert_eq!(
        w.characters["player"].mind_graph.nodes["player-virtual-achievement-l2"].reality_layer,
        2
    );
    walk(&mut w, 200.0);
    assert!(cmd(&mut w, "enter-vr"));
    let existing = w.characters["player"].mind_graph.nodes["player-virtual-achievement-l2"].clone();
    w.command_defs.push(CommandDef {
        command_id: "inject-test".into(),
        label: "test".into(),
        hotkey: None,
        targeting: TargetingMode::NoTarget,
        preconditions: vec![],
        effect_templates: vec![
            CommandEffect::InjectMeme {
                meme_schema_id: "test:new-meme".into(),
                target_character_id: None,
                meme: MemeData::default(),
            },
            CommandEffect::InjectMeme {
                meme_schema_id: existing.schema_id.clone(),
                target_character_id: None,
                meme: MemeData::default(),
            },
        ],
    });
    assert!(cmd(&mut w, "inject-test"));
    let new = w.characters["player"]
        .mind_graph
        .find_by_schema("test:new-meme")
        .unwrap();
    assert_eq!(new.reality_layer, 1);
    assert!(new.is_virtual);
    let old = &w.characters["player"].mind_graph.nodes[&existing.instance_id];
    assert_eq!(old.reality_layer, existing.reality_layer);
    assert_eq!(old.is_virtual, existing.is_virtual);
}
