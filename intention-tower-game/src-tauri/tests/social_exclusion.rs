//! Exclusion is a paid, cue-bound motor effect on an actual outsider.
use intention_tower_game_lib::{
    level_loader::load_level_from_path,
    models::{
        commands::CommandDTO,
        mind_graph::ActionPhysicalOutcome,
        mind_node::{Evidence, LearnType, NodeType},
        progress::LevelCondition,
        world_state::WorldState,
    },
    systems::{
        action_execution::ActionExecutionSystem, action_selection::ActionSelectionSystem,
        command_system::CommandSystem, runner::SimulationRunner, System,
    },
};
use std::path::Path;

const ACTION: &str = "tim-exclude-outsider";
const IDENTITY: &str = "meme_it_concept_group-identity";
fn queue(w: &mut WorldState, command: &str, actor: &str, target: Option<&str>) {
    w.pending_commands.push(CommandDTO {
        command_id: command.into(),
        actor_id: actor.into(),
        target_id: target.map(str::to_owned),
        effects: vec![],
    });
}
fn command(w: &mut WorldState, name: &str, actor: &str, target: Option<&str>) {
    w.tick += 1;
    queue(w, name, actor, target);
    CommandSystem.run(w, 0.0);
}
fn world() -> WorldState {
    load_level_from_path(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/the-wave"))
        .unwrap()
}
fn train(w: &mut WorldState, actor: &str, dopamine: f64) {
    command(w, "introduce-uniform", "teacher-wenger", Some(actor));
    command(w, "teach-gesture", "teacher-wenger", Some(actor));
    queue(w, "request-sit", "teacher-wenger", Some(actor));
    let runner = SimulationRunner::new();
    for _ in 0..3 {
        runner.tick(w, 0.5);
    }
    assert!(w.characters[actor]
        .mind_graph
        .action_episodes
        .iter()
        .any(|e| matches!(
            e.physical_outcome,
            Some(ActionPhysicalOutcome::ActorPosture { .. })
        )));
    for schema in ["it:concept/loneliness", "it:concept/value-deficit"] {
        w.characters
            .get_mut(actor)
            .unwrap()
            .mind_graph
            .find_by_schema_mut(schema)
            .unwrap()
            .value = 0.8;
    }
    w.characters
        .get_mut(actor)
        .unwrap()
        .mind_graph
        .find_by_schema_mut("it:concept/dopamine")
        .unwrap()
        .value = dopamine;
    queue(w, "give-approval", "teacher-wenger", Some(actor));
    runner.tick(w, 0.0);
}
fn paid_world() -> WorldState {
    let mut w = world();
    train(&mut w, "tim", 1.0);
    assert!(w.characters["tim"]
        .mind_graph
        .edges
        .values()
        .any(|e| e.learn_type == LearnType::Social && e.evidence.social_dopamine_spent > 0.0));
    w
}
fn dissent(w: &mut WorldState) {
    command(w, "voice-dissent", "outsider", None);
}
fn motor(w: &mut WorldState) {
    for node in w
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .values_mut()
    {
        node.attended = true;
    }
    ActionSelectionSystem.run(w, 0.0);
    ActionExecutionSystem.run(w, 0.0);
}
fn count(w: &WorldState) -> usize {
    w.characters["tim"]
        .mind_graph
        .action_episodes
        .iter()
        .filter(|e| {
            e.action_id == ACTION
                && matches!(
                    e.physical_outcome,
                    Some(ActionPhysicalOutcome::SocialExclusion { .. })
                )
        })
        .count()
}
fn need(w: &WorldState) -> f64 {
    w.characters["outsider"].mind_graph.nodes["outsider-loneliness"].value
}

#[test]
fn real_runner_paid_identity_then_dissent_changes_actual_target() {
    let mut w = paid_world();
    let before = need(&w);
    queue(&mut w, "voice-dissent", "outsider", None);
    for _ in 0..3 {
        SimulationRunner::new().tick(&mut w, 0.0);
    }
    assert!(count(&w) > 0);
    assert!(need(&w) > before);
    let e = w.characters["tim"]
        .mind_graph
        .action_episodes
        .iter()
        .find(|e| e.action_id == ACTION)
        .unwrap();
    assert!(!e.autonomous);
    assert_eq!(
        e.stimulus.as_ref().unwrap().emitter_id.as_deref(),
        Some("outsider")
    );
    match e.physical_outcome.as_ref().unwrap() {
        ActionPhysicalOutcome::SocialExclusion {
            target_character_id,
            from,
            to,
            social_dopamine_spent,
            ..
        } => {
            assert_eq!(target_character_id, "outsider");
            assert!(*to > *from);
            assert!(*social_dopamine_spent > 0.0);
        }
        _ => panic!("not exclusion"),
    }
}

#[test]
fn no_paid_learning_zero_resource_or_legacy_counts_cannot_exclude() {
    for case in ["untrained", "zero", "legacy"] {
        let mut w = if case == "legacy" {
            paid_world()
        } else {
            world()
        };
        if case == "zero" {
            train(&mut w, "tim", 0.0);
        }
        if case == "legacy" {
            for e in w
                .characters
                .get_mut("tim")
                .unwrap()
                .mind_graph
                .edges
                .values_mut()
            {
                e.evidence.social_dopamine_spent = 0.0;
                e.evidence.co_occurrence_count = 999;
            }
        }
        let before = need(&w);
        dissent(&mut w);
        motor(&mut w);
        assert_eq!(count(&w), 0, "{case}");
        assert_eq!(need(&w), before, "{case}");
    }
    let evidence: Evidence = serde_json::from_value(
        serde_json::json!({"co_occurrence_count":999,"last_co_occurred_at":1,"window_sec":10.0}),
    )
    .unwrap();
    assert_eq!(evidence.social_dopamine_spent, 0.0);
}

#[test]
fn live_identity_need_and_actual_target_are_required() {
    for case in [
        "inactive",
        "suppressed",
        "low",
        "wrong-source-need-type",
        "wrong-target-need-type",
        "saturated",
        "missing",
        "ingroup",
        "self",
        "wrong",
    ] {
        let mut w = paid_world();
        dissent(&mut w);
        match case {
            "inactive" => {
                w.characters
                    .get_mut("tim")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .get_mut(IDENTITY)
                    .unwrap()
                    .active = false
            }
            "suppressed" => {
                w.characters
                    .get_mut("tim")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .get_mut(IDENTITY)
                    .unwrap()
                    .suppression = 1.0
            }
            "low" => {
                for s in ["it:concept/loneliness", "it:concept/value-deficit"] {
                    w.characters
                        .get_mut("tim")
                        .unwrap()
                        .mind_graph
                        .find_by_schema_mut(s)
                        .unwrap()
                        .value = 0.0;
                }
            }
            "wrong-source-need-type" => {
                for s in ["it:concept/loneliness", "it:concept/value-deficit"] {
                    let n = w
                        .characters
                        .get_mut("tim")
                        .unwrap()
                        .mind_graph
                        .find_by_schema_mut(s)
                        .unwrap();
                    assert!(n.prior_instinct.is_some());
                    n.node_type = NodeType::Meme;
                }
            }
            "wrong-target-need-type" => {
                let n = w
                    .characters
                    .get_mut("outsider")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .get_mut("outsider-loneliness")
                    .unwrap();
                assert!(n.prior_instinct.is_some());
                n.node_type = NodeType::Meme;
            }
            "saturated" => {
                w.characters
                    .get_mut("outsider")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .get_mut("outsider-loneliness")
                    .unwrap()
                    .value = 1.0
            }
            "missing" => {
                w.characters.remove("outsider");
            }
            "ingroup" => {
                let n = w.characters["tim"].mind_graph.nodes[IDENTITY].clone();
                w.characters
                    .get_mut("outsider")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .insert(n.instance_id.clone(), n);
            }
            "self" | "wrong" => {
                for n in w
                    .characters
                    .get_mut("tim")
                    .unwrap()
                    .mind_graph
                    .nodes
                    .values_mut()
                {
                    if let Some(o) = n.observation.as_mut() {
                        if n.schema_id == "it:concept/group-dissent" {
                            o.emitter_id =
                                Some(if case == "self" { "tim" } else { "unknown" }.into());
                        }
                    }
                }
            }
            _ => unreachable!(),
        }
        let before = w.characters.get("outsider").map(|_| need(&w));
        if case == "wrong-source-need-type" {
            let graph = &w.characters["tim"].mind_graph;
            let effect = graph.nodes[ACTION]
                .action
                .as_ref()
                .unwrap()
                .physical_effect
                .as_ref()
                .unwrap();
            assert_eq!(
                intention_tower_game_lib::models::social::exclusion_drive(graph, effect),
                0.0
            );
        }
        motor(&mut w);
        assert_eq!(count(&w), 0, "{case}");
        if let Some(before) = before {
            assert_eq!(need(&w), before, "{case}");
        }
    }
}

#[test]
fn exact_presentation_is_consumed_across_save_and_requires_new_dissent() {
    let mut w = paid_world();
    dissent(&mut w);
    motor(&mut w);
    assert_eq!(count(&w), 1);
    let mut restored: WorldState =
        serde_json::from_str(&serde_json::to_string(&w).unwrap()).unwrap();
    motor(&mut restored);
    assert_eq!(count(&restored), 1);
    dissent(&mut restored);
    motor(&mut restored);
    assert_eq!(count(&restored), 2);
}

#[test]
fn preselected_flag_and_quiet_learned_action_never_create_exclusion() {
    let mut w = paid_world();
    let n = w
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut(ACTION)
        .unwrap();
    n.active = true;
    n.attended = true;
    n.action.as_mut().unwrap().selected = true;
    ActionExecutionSystem.run(&mut w, 0.0);
    assert_eq!(count(&w), 0);
    motor(&mut w);
    assert_eq!(count(&w), 0);
}

#[test]
fn outcome_filter_checks_actual_target_increase_and_goal_requires_both_actors() {
    let mut w = paid_world();
    dissent(&mut w);
    motor(&mut w);
    let condition = |target: &str, min: f64| -> LevelCondition {
        serde_json::from_value(serde_json::json!({"type":"actionEpisodes","characterId":"tim","actionSchemaId":"it:concept/exclude-outsider","minCount":1,"socialExclusion":{"targetCharacterId":target,"minIncrease":min,"requirePaidIdentityLearning":true}})).unwrap()
    };
    assert!(condition("outsider", 0.1).evaluate(&w));
    assert!(!condition("teacher-wenger", 0.1).evaluate(&w));
    assert!(!condition("outsider", 0.5).evaluate(&w));
    let objective = w
        .progress
        .objectives
        .iter()
        .find(|o| o.objective_id == "produce-exclusion")
        .unwrap();
    assert!(
        !objective.condition.evaluate(&w),
        "one actor must not satisfy the authored two-actor goal"
    );
}

#[test]
fn two_separately_paid_actors_satisfy_authored_exclusion_goal() {
    let mut w = paid_world();
    train(&mut w, "student-b", 1.0);
    queue(&mut w, "voice-dissent", "outsider", None);
    for _ in 0..3 {
        SimulationRunner::new().tick(&mut w, 0.0);
    }
    assert!(w
        .progress
        .objectives
        .iter()
        .find(|o| o.objective_id == "produce-exclusion")
        .unwrap()
        .condition
        .evaluate(&w));
}

#[test]
fn stronger_competing_action_prevents_exclusion() {
    let mut w = paid_world();
    dissent(&mut w);
    let graph = &mut w.characters.get_mut("tim").unwrap().mind_graph;
    let mut competitor = graph.nodes[ACTION].clone();
    competitor.instance_id = "test-competitor".into();
    competitor.schema_id = "test:competitor".into();
    competitor.active = true;
    competitor.attended = true;
    competitor.strength = 10.0;
    competitor.action.as_mut().unwrap().physical_effect = None;
    competitor.action.as_mut().unwrap().instruction_cue = None;
    graph
        .nodes
        .insert(competitor.instance_id.clone(), competitor);
    motor(&mut w);
    assert_eq!(count(&w), 0);
}

#[test]
fn strict_loader_rejects_invalid_exclusion_effects_and_filters() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/the-wave");
    let temp =
        Path::new("/home/user/workspace").join(format!("exclusion-test-{}", std::process::id()));
    std::fs::create_dir_all(&temp).unwrap();
    for entry in std::fs::read_dir(&source).unwrap() {
        let entry = entry.unwrap();
        if entry.path().is_file() {
            std::fs::copy(entry.path(), temp.join(entry.file_name())).unwrap();
        }
    }
    let original_mind: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(source.join("tim-mind.jsonld")).unwrap())
            .unwrap();
    for (field, value) in [
        ("groupId", serde_json::json!(" ")),
        ("aggravation", serde_json::json!(-0.2)),
        ("minimumSocialWeight", serde_json::json!(1.1)),
        ("target", serde_json::json!("ChosenCharacter")),
    ] {
        let mut mind = original_mind.clone();
        mind["nodes"][0]["it:action"]["physicalEffect"][field] = value;
        std::fs::write(
            temp.join("tim-mind.jsonld"),
            serde_json::to_vec(&mind).unwrap(),
        )
        .unwrap();
        assert!(
            load_level_from_path(&temp).is_err(),
            "accepted invalid effect {field}"
        );
    }
    std::fs::write(
        temp.join("tim-mind.jsonld"),
        serde_json::to_vec(&original_mind).unwrap(),
    )
    .unwrap();
    let original_level: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(source.join("level.jsonld")).unwrap())
            .unwrap();
    for (field, value) in [
        ("minIncrease", serde_json::json!(-0.1)),
        ("minIncrease", serde_json::json!(1.1)),
        ("targetCharacterId", serde_json::json!(" ")),
    ] {
        let mut level = original_level.clone();
        let rules = level["objectiveRules"].as_array_mut().unwrap();
        let rule = rules
            .iter_mut()
            .find(|r| r["objectiveId"] == "produce-exclusion")
            .unwrap();
        rule["condition"]["conditions"][0]["socialExclusion"][field] = value;
        std::fs::write(
            temp.join("level.jsonld"),
            serde_json::to_vec(&level).unwrap(),
        )
        .unwrap();
        assert!(
            load_level_from_path(&temp).is_err(),
            "accepted invalid filter {field}"
        );
    }
    std::fs::remove_dir_all(&temp).unwrap();
}
