use intention_tower_game_lib::command_rules::{command_available, normalized_target_id};
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::{CommandDef, Precondition, TargetingMode};
use serde_json::{json, Value};
use std::path::PathBuf;

#[cfg(feature = "test-server")]
mod dispatch_contract {
    use super::*;
    use intention_tower_game_lib::models::commands::CommandEffect;
    use intention_tower_game_lib::models::events::WorldEvent;
    use intention_tower_game_lib::models::mind_node::Modality;
    use intention_tower_game_lib::test_server::{dispatch::call_tool, state::TestServerState};

    fn state(paused: bool, effects: Vec<CommandEffect>) -> TestServerState {
        let state = TestServerState::new();
        let mut world = load_level_from_path(&levels().join("smart-cat")).unwrap();
        world.paused = paused;
        world.progress.objectives.clear();
        world.progress.failure_rules.clear();
        world.command_defs.push(CommandDef {
            command_id: "dispatch-contract".into(),
            label: "test".into(),
            hotkey: None,
            targeting: TargetingMode::NoTarget,
            preconditions: vec![],
            effect_templates: effects,
        });
        *state.world.lock().unwrap() = world;
        state
    }

    fn args() -> Value {
        // NoTarget must ignore this nonexistent supplied target in response matching too.
        json!({"command_id": "dispatch-contract", "actor_id": "trainer", "target_id": "not-a-character"})
    }

    fn observation() -> CommandEffect {
        CommandEffect::SpawnObservation {
            schema_id: "test:dispatch-cue".into(),
            modality: Modality::Auditory,
            about: "test".into(),
            ttl: 12,
            strength: 1.0,
            target_character_id: None,
        }
    }

    #[tokio::test]
    async fn immediate_dispatch_reports_domain_rejections_and_does_not_count_them() {
        for scenario in ["collision", "noop", "insufficient_resource"] {
            let state = state(false, vec![]);
            let expected_reason;
            {
                let mut world = state.world.lock().unwrap();
                let effects = match scenario {
                    "collision" => {
                        let position = world.characters["trainer"].position.clone();
                        let target = world.characters.get_mut("cat-billi").unwrap();
                        target.position.x = position.x + 10.0;
                        target.position.y = position.y;
                        expected_reason = "movement_rejected";
                        vec![CommandEffect::MoveCharacter {
                            delta_x: 10.0,
                            delta_y: 0.0,
                            target_character_id: None,
                        }]
                    }
                    "insufficient_resource" => {
                        let resource = world
                            .characters
                            .get_mut("trainer")
                            .unwrap()
                            .mind_graph
                            .nodes
                            .values_mut()
                            .find(|node| node.is_resource())
                            .unwrap();
                        resource.value = 0.0;
                        let schema = resource.schema_id.clone();
                        expected_reason = "insufficient_resource";
                        vec![
                            observation(),
                            CommandEffect::ConsumeResource {
                                resource_schema_id: schema,
                                amount: 0.5,
                                target_character_id: None,
                            },
                        ]
                    }
                    _ => {
                        expected_reason = "no_effect_applied";
                        vec![CommandEffect::DeleteNode {
                            schema_id: "test:absent".into(),
                            target_character_id: None,
                        }]
                    }
                };
                world.command_defs.last_mut().unwrap().effect_templates = effects;
                // An older matching success cannot override this invocation's later rejection.
                world.pending_events.push(WorldEvent::CommandExecuted {
                    command_id: "dispatch-contract".into(),
                    actor_id: "trainer".into(),
                    target_id: None,
                });
            }
            let response = call_tool(&state, "execute_command", &args()).await.unwrap();
            assert_eq!(response["success"], false, "{}", scenario);
            assert_eq!(response["queued"], false);
            assert_eq!(response["executed"], false);
            let events: Vec<WorldEvent> =
                serde_json::from_value(response["events"].clone()).unwrap();
            assert!(events.iter().any(|event| matches!(event, WorldEvent::CommandRejected { command_id, actor_id, target_id, reason } if command_id == "dispatch-contract" && actor_id == "trainer" && target_id.is_none() && reason == expected_reason)));
            let world = state.world.lock().unwrap();
            assert!(!world
                .progress
                .command_counts
                .contains_key("dispatch-contract"));
            assert!(!world
                .progress
                .command_targets
                .contains_key("dispatch-contract"));
        }
    }

    #[tokio::test]
    async fn accepted_queue_is_not_reported_as_executed() {
        let state = state(true, vec![observation()]);
        let response = call_tool(&state, "execute_command", &args()).await.unwrap();
        assert_eq!(response["success"], true);
        assert_eq!(response["queued"], true);
        assert_eq!(response["executed"], false);
        assert_eq!(response["events"], json!([]));
        let world = state.world.lock().unwrap();
        assert_eq!(world.pending_commands.len(), 1);
        assert_eq!(world.pending_commands[0].target_id, None);
        assert!(!world
            .progress
            .command_counts
            .contains_key("dispatch-contract"));
    }

    #[tokio::test]
    async fn immediate_success_uses_last_matching_normalized_outcome() {
        let state = state(false, vec![observation()]);
        state
            .world
            .lock()
            .unwrap()
            .pending_events
            .push(WorldEvent::CommandRejected {
                command_id: "dispatch-contract".into(),
                actor_id: "trainer".into(),
                target_id: None,
                reason: "older-outcome".into(),
            });
        let response = call_tool(&state, "execute_command", &args()).await.unwrap();
        assert_eq!(response["success"], true);
        assert_eq!(response["queued"], false);
        assert_eq!(response["executed"], true);
        assert_eq!(
            state.world.lock().unwrap().progress.command_counts["dispatch-contract"],
            1
        );
    }
}

fn levels() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels")
}

#[test]
fn all_twenty_one_bundled_levels_load() {
    let mut count = 0;
    for entry in std::fs::read_dir(levels()).unwrap() {
        let path = entry.unwrap().path();
        if path.join("level.jsonld").exists() {
            load_level_from_path(&path)
                .unwrap_or_else(|error| panic!("{}: {}", path.display(), error));
            count += 1;
        }
    }
    assert_eq!(count, 21);
}

#[test]
fn declared_roles_reject_other_actors_targets_and_self_targeting() {
    let world = load_level_from_path(&levels().join("pavlov")).unwrap();
    let mut command = world.command_defs[0].clone();
    command.preconditions = vec![
        Precondition::ActorIs {
            character_ids: vec!["pavlov".into()],
        },
        Precondition::TargetIs {
            character_ids: vec!["dog".into()],
        },
        Precondition::TargetIsNotActor,
    ];
    assert!(command_available(&command, "pavlov", Some("dog"), &world));
    assert!(!command_available(&command, "dog", Some("pavlov"), &world));
    assert!(!command_available(
        &command,
        "pavlov",
        Some("pavlov"),
        &world
    ));
    command.preconditions = vec![Precondition::TargetIsNotActor];
    assert!(!command_available(&command, "dog", Some("dog"), &world));
}

#[test]
fn authored_roles_are_loaded_and_enforced_by_the_shared_api_rules() {
    for (level, actor, targets) in [
        ("pavlov", "pavlov", vec!["dog"]),
        ("smart-cat", "trainer", vec!["cat-billi"]),
        ("gosling", "lorenz", vec!["gosling"]),
        (
            "the-wave",
            "teacher-wenger",
            vec!["tim", "student-a", "student-b"],
        ),
    ] {
        let mut world = load_level_from_path(&levels().join(level)).unwrap();
        assert_eq!(world.default_actor_id.as_deref(), Some(actor));
        let default_target = world.default_target_id.clone().unwrap();
        assert!(targets.contains(&default_target.as_str()));
        assert!(
            command_available(&world.command_defs[0], actor, Some(&default_target), &world),
            "{} default pair",
            level
        );
        for target in &targets {
            assert!(
                world.characters.contains_key(*target),
                "{} local target ID {}",
                level,
                target
            );
        }
        // A real, existing character outside the authored cohort must not qualify.
        let mut outsider = world.characters[actor].clone();
        outsider.id = "outside-cohort".into();
        world.characters.insert(outsider.id.clone(), outsider);
        for command in &world.command_defs {
            assert!(command.preconditions.iter().any(|pre| matches!(pre, Precondition::ActorIs { character_ids } if character_ids == &vec![actor.to_owned()])));
            assert!(command.preconditions.iter().any(|pre| matches!(pre, Precondition::TargetIs { character_ids } if character_ids == &targets.iter().map(|id| (*id).to_owned()).collect::<Vec<_>>())));
            assert!(command
                .preconditions
                .iter()
                .any(|pre| matches!(pre, Precondition::TargetIsNotActor)));
            // Existing scenario-specific predicates still gate the correct pair
            // (e.g. smart-cat reward requires an executed motor response).
            let mut ungated_roles = command.clone();
            ungated_roles.preconditions.retain(|pre| {
                !matches!(
                    pre,
                    Precondition::ActorIs { .. }
                        | Precondition::TargetIs { .. }
                        | Precondition::TargetIsNotActor
                )
            });
            for target in &targets {
                assert_eq!(
                    command_available(command, actor, Some(target), &world),
                    command_available(&ungated_roles, actor, Some(target), &world)
                );
                assert!(!command_available(command, target, Some(target), &world));
                assert!(!command_available(
                    command,
                    "outside-cohort",
                    Some(target),
                    &world
                ));
            }
            assert!(!command_available(command, actor, Some(actor), &world));
            assert!(!command_available(
                command,
                actor,
                Some("outside-cohort"),
                &world
            ));
        }
    }
}

#[test]
fn no_target_checks_the_actor_and_ignores_supplied_target() {
    let world = load_level_from_path(&levels().join("pavlov")).unwrap();
    let command = CommandDef {
        targeting: TargetingMode::NoTarget,
        preconditions: vec![Precondition::TargetIs {
            character_ids: vec!["pavlov".into()],
        }],
        ..world.command_defs[0].clone()
    };
    for target in [None, Some("dog"), Some("does-not-exist")] {
        assert!(command_available(&command, "pavlov", target, &world));
        assert_eq!(normalized_target_id(command.targeting, target), None);
        assert!(!command_available(&command, "dog", target, &world));
    }
}

fn invalid_command_error(command: Value) -> String {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let path = std::env::temp_dir().join(format!(
        "intention-command-validation-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    std::fs::create_dir(&path).unwrap();
    for entry in std::fs::read_dir(levels().join("pavlov")).unwrap() {
        let entry = entry.unwrap();
        std::fs::copy(entry.path(), path.join(entry.file_name())).unwrap();
    }
    let commands = if command.is_array() {
        command
    } else {
        json!([command])
    };
    std::fs::write(
        path.join("commands.jsonld"),
        serde_json::to_vec(&json!({ "commands": commands })).unwrap(),
    )
    .unwrap();
    let error = load_level_from_path(&path).unwrap_err().to_string();
    std::fs::remove_dir_all(&path).unwrap();
    error
}

#[test]
fn malformed_declarations_fail_closed_with_command_context() {
    let base = json!({"commandId": "unsafe-command", "targeting": "NoTarget", "preconditions": [], "effects": [{"type": "ModifyNodeValue", "schemaId": "it:concept/hunger", "delta": 0.1}]});
    let bad_conditions = [
        json!({"type": "ActorIs", "characterIds": []}),
        json!({"type": "TargetIs"}),
        json!({"type": "TargetIsNotActorr"}),
        json!({"type": "TargetHasNode"}),
        json!({"type": "TargetNodeValue", "schemaId": "it:concept/hunger", "op": "GTEE", "threshold": 1}),
        json!({"type": "ActorResource", "resourceSchemaId": "energy", "op": "GTE"}),
        json!({"type": "IsVirtualContext"}),
        json!({"schemaId": "it:concept/hunger"}),
    ];
    for condition in bad_conditions {
        let mut command = base.clone();
        command["preconditions"] = json!([condition]);
        assert!(invalid_command_error(command).contains("unsafe-command"));
    }
    for effect in [
        json!({"type": "ModifyNodeValue", "schemaId": "it:concept/hunger"}),
        json!({"type": "ModifyNodeValu", "delta": 1}),
        json!({"delta": 1}),
    ] {
        let mut command = base.clone();
        command["effects"] = json!([effect]);
        assert!(invalid_command_error(command).contains("unsafe-command"));
    }
    let mut command = base.clone();
    command["targeting"] = json!("NoTargte");
    assert!(invalid_command_error(command).contains("unsafe-command"));
    assert!(invalid_command_error(json!([base.clone(), base.clone()])).contains("duplicate"));
    let mut command = base.clone();
    command.as_object_mut().unwrap().remove("effects");
    assert!(invalid_command_error(command).contains("unsafe-command"));
    let mut command = base;
    command["effects"] = json!([]);
    assert!(invalid_command_error(command).contains("unsafe-command"));
}
