//! Social approval rewards one pinned, real teacher-cued motor response.
use std::path::Path;

use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::CommandDTO;
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::mind_graph::ActionPhysicalOutcome;
use intention_tower_game_lib::models::mind_node::LearnType;
use intention_tower_game_lib::models::scene::CharacterPosture;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::action_selection::ActionSelectionSystem;
use intention_tower_game_lib::systems::command_system::CommandSystem;
use intention_tower_game_lib::systems::runner::SimulationRunner;
use intention_tower_game_lib::systems::social_signal::SocialSignalSystem;
use intention_tower_game_lib::systems::System;

const ACTION: &str = "tim-sit-on-command";
const NEEDS: [&str; 2] = ["it:concept/loneliness", "it:concept/value-deficit"];

fn queue(state: &mut WorldState, id: &str, actor: &str, target: &str) {
    state.pending_commands.push(CommandDTO {
        command_id: id.into(),
        actor_id: actor.into(),
        target_id: Some(target.into()),
        effects: vec![],
    });
}

fn command(state: &mut WorldState, id: &str) {
    state.tick += 1;
    state.pending_events.clear();
    queue(state, id, "teacher-wenger", "tim");
    CommandSystem.run(state, 0.0);
}

fn world() -> WorldState {
    let mut state = load_level_from_path(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/the-wave"),
    )
    .unwrap();
    command(&mut state, "introduce-uniform");
    command(&mut state, "teach-gesture");
    state.pending_events.clear();
    state
}

fn execute_sit(state: &mut WorldState) {
    queue(state, "request-sit", "teacher-wenger", "tim");
    let runner = SimulationRunner::new();
    for _ in 0..3 {
        runner.tick(state, 0.5);
        if state.characters["tim"]
            .mind_graph
            .action_episodes
            .iter()
            .any(|episode| episode.action_id == ACTION && episode.physical_outcome.is_some())
        {
            break;
        }
    }
    let episode = state.characters["tim"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap();
    assert_eq!(episode.action_id, ACTION);
    assert!(matches!(
        episode.physical_outcome,
        Some(ActionPhysicalOutcome::ActorPosture {
            from: CharacterPosture::Standing,
            to: CharacterPosture::Sitting
        })
    ));
    assert_eq!(
        episode.stimulus.as_ref().unwrap().emitter_id.as_deref(),
        Some("teacher-wenger")
    );
    state.pending_events.clear();
}

fn value(state: &WorldState, schema: &str) -> f64 {
    state.characters["tim"]
        .mind_graph
        .find_by_schema(schema)
        .unwrap()
        .value
}

fn set(state: &mut WorldState, schema: &str, value: f64) {
    state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .find_by_schema_mut(schema)
        .unwrap()
        .value = value;
}

fn needs(state: &WorldState) -> [f64; 2] {
    NEEDS.map(|schema| value(state, schema))
}

fn deliver(state: &mut WorldState) {
    // Direct effect tests isolate causal matching from attention allocation.
    for node in state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .values_mut()
    {
        if node.schema_id == "it:concept/social-approval" {
            node.attended = true;
        }
    }
    SocialSignalSystem.run(state, 0.0);
}

fn paid(state: &WorldState) -> usize {
    let graph = &state.characters["tim"].mind_graph;
    state.pending_events.iter().filter(|event| matches!(event,
        WorldEvent::LearningUpdated { edge_id, dopamine_spent, .. }
            if *dopamine_spent > 0.0 && graph.edges.get(edge_id).is_some_and(|edge|
                edge.learn_type == LearnType::Operant
                && [ACTION, "tim-stand-on-command"].contains(&edge.target_instance_id.as_str()))
    )).count()
}

fn expose_effect(state: &mut WorldState) {
    // Effect matching must remain safe even in a custom command without UI gates.
    state
        .command_defs
        .iter_mut()
        .find(|definition| definition.command_id == "give-approval")
        .unwrap()
        .preconditions
        .clear();
}

fn expected_response() -> WorldState {
    let mut state = world();
    execute_sit(&mut state);
    for schema in NEEDS {
        set(&mut state, schema, 0.8);
    }
    set(&mut state, "it:concept/dopamine", 1.0);
    command(&mut state, "give-approval");
    deliver(&mut state);
    queue(&mut state, "request-stand", "teacher-wenger", "tim");
    for _ in 0..3 {
        SimulationRunner::new().tick(&mut state, 0.0);
    }
    for schema in NEEDS {
        set(&mut state, schema, 0.8);
    }
    set(&mut state, "it:concept/dopamine", 1.0);
    execute_sit(&mut state);
    assert!(expectation(&state).prediction > 0.0);
    state
}

fn expectation(
    state: &WorldState,
) -> &intention_tower_game_lib::models::mind_graph::SocialRewardExpectation {
    state.characters["tim"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap()
        .social_reward_expectation
        .as_ref()
        .unwrap()
}

fn action_weights(state: &WorldState) -> Vec<f64> {
    state.characters["tim"]
        .mind_graph
        .edges
        .values()
        .filter(|edge| edge.target_instance_id == ACTION && edge.learn_type == LearnType::Operant)
        .map(|edge| edge.weight)
        .collect()
}

fn restore(state: &WorldState) -> WorldState {
    serde_json::from_str(&serde_json::to_string(state).unwrap()).unwrap()
}

#[test]
fn authored_weak_approval_relief_pays_negative_prediction_error() {
    let mut state = expected_response();
    let before = needs(&state);
    let weights = action_weights(&state);
    command(&mut state, "give-weak-approval");
    deliver(&mut state);
    for (old, new) in before.into_iter().zip(needs(&state)) {
        assert!(new < old && old - new < 0.05);
    }
    assert_eq!(expectation(&state).outcome.as_deref(), Some("delivered"));
    assert!(expectation(&state).extinction_dopamine_spent > 0.0);
    assert!(action_weights(&state)
        .iter()
        .zip(weights)
        .all(|(new, old)| *new < old));
    assert!(state.pending_events.iter().any(|event| matches!(event,
        WorldEvent::LearningUpdated { reward, prediction_error, dopamine_spent, .. }
        if *reward > 0.0 && *prediction_error < 0.0 && *dopamine_spent > 0.0)));
}

#[test]
fn deadline_is_inclusive_and_omission_is_once_across_save_restore() {
    let original = expected_response();
    let mut delivered = restore(&original);
    delivered.tick = expectation(&delivered).deadline - 1;
    command(&mut delivered, "give-approval");
    deliver(&mut delivered);
    assert_eq!(
        expectation(&delivered).outcome.as_deref(),
        Some("delivered")
    );
    let mut omitted = restore(&original);
    omitted.tick = expectation(&omitted).deadline;
    deliver(&mut omitted);
    assert!(expectation(&omitted).settled_at.is_none());
    omitted.tick += 1;
    deliver(&mut omitted);
    assert_eq!(expectation(&omitted).outcome.as_deref(), Some("omitted"));
    assert_eq!(expectation(&omitted).reward, Some(0.0));
    assert!(expectation(&omitted).extinction_dopamine_spent > 0.0);
    let weights = action_weights(&omitted);
    let dopamine = value(&omitted, "it:concept/dopamine");
    let mut omitted = restore(&omitted);
    omitted.pending_events.clear();
    for _ in 0..3 {
        omitted.tick += 1;
        deliver(&mut omitted);
    }
    assert_eq!(action_weights(&omitted), weights);
    assert_eq!(value(&omitted, "it:concept/dopamine"), dopamine);
    assert_eq!(paid(&omitted), 0);
}

#[test]
fn reserved_unattended_reward_expires_without_late_relief_or_recharge_backpay() {
    for unfunded in [false, true] {
        let mut state = expected_response();
        if unfunded {
            set(&mut state, "it:concept/dopamine", 0.0);
        }
        command(&mut state, "give-approval");
        let mut state = restore(&state);
        let before = needs(&state);
        for node in state
            .characters
            .get_mut("tim")
            .unwrap()
            .mind_graph
            .nodes
            .values_mut()
        {
            if node.schema_id == "it:concept/social-approval" {
                node.attended = false;
            }
        }
        state.tick = expectation(&state).deadline + 1;
        SocialSignalSystem.run(&mut state, 0.0);
        assert_eq!(expectation(&state).outcome.as_deref(), Some("omitted"));
        if unfunded {
            assert_eq!(expectation(&state).extinction_dopamine_spent, 0.0);
        }
        let weights = action_weights(&state);
        set(&mut state, "it:concept/dopamine", 1.0);
        state.pending_events.clear();
        deliver(&mut state);
        assert_eq!(needs(&state), before);
        assert_eq!(action_weights(&state), weights);
        assert_eq!(value(&state, "it:concept/dopamine"), 1.0);
        assert_eq!(paid(&state), 0);
    }
}

#[test]
fn zero_scale_or_saturated_need_settles_zero_reward_without_repeat() {
    for saturated in [false, true] {
        let mut state = expected_response();
        if saturated {
            for schema in NEEDS {
                set(&mut state, schema, 0.0);
            }
        } else {
            let command = state
                .command_defs
                .iter_mut()
                .find(|c| c.command_id == "give-approval")
                .unwrap();
            for effect in &mut command.effect_templates {
                if let intention_tower_game_lib::models::commands::CommandEffect::SpawnObservation { social_reward_scale, .. } = effect { *social_reward_scale = 0.0; }
            }
        }
        let before = needs(&state);
        command(&mut state, "give-approval");
        deliver(&mut state);
        assert_eq!(needs(&state), before);
        assert_eq!(expectation(&state).reward, Some(0.0));
        assert_eq!(expectation(&state).outcome.as_deref(), Some("delivered"));
        let weights = action_weights(&state);
        let spent = expectation(&state).extinction_dopamine_spent;
        assert!(spent > 0.0);
        let mut state = restore(&state);
        state.tick = expectation(&state).deadline + 1;
        deliver(&mut state);
        assert_eq!(action_weights(&state), weights);
        assert_eq!(expectation(&state).extinction_dopamine_spent, spent);
    }
}

#[test]
fn legacy_or_invalid_sources_never_decay_unrelated_edges() {
    for case in 0..4 {
        let mut state = expected_response();
        let deadline = expectation(&state).deadline;
        let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
        match case {
            0 => {
                graph
                    .action_episodes
                    .last_mut()
                    .unwrap()
                    .social_reward_expectation = None
            }
            1 => {
                for edge in graph
                    .edges
                    .values_mut()
                    .filter(|e| e.target_instance_id == ACTION)
                {
                    edge.learnable = false;
                }
            }
            2 => {
                let e = graph
                    .action_episodes
                    .last_mut()
                    .unwrap()
                    .social_reward_expectation
                    .as_mut()
                    .unwrap();
                for source in &mut e.sources {
                    source.instance_id = "missing-source".into();
                }
            }
            3 => {
                let e = graph
                    .action_episodes
                    .last_mut()
                    .unwrap()
                    .social_reward_expectation
                    .as_mut()
                    .unwrap();
                for source in &mut e.sources {
                    source.schema_id = "it:concept/unrelated".into();
                }
            }
            _ => unreachable!(),
        }
        let weights = action_weights(&state);
        state.tick = deadline + 1;
        state.pending_events.clear();
        deliver(&mut state);
        assert_eq!(action_weights(&state), weights, "case {case}");
        assert_eq!(paid(&state), 0, "case {case}");
    }
}

#[test]
fn no_response_cannot_create_extinction_and_zero_dopamine_never_backpays() {
    let mut empty = world();
    let weights = action_weights(&empty);
    empty.tick += 1001;
    deliver(&mut empty);
    assert_eq!(action_weights(&empty), weights);
    assert!(empty.characters["tim"]
        .mind_graph
        .action_episodes
        .is_empty());
    let mut state = expected_response();
    set(&mut state, "it:concept/dopamine", 0.0);
    let weights = action_weights(&state);
    state.tick = expectation(&state).deadline + 1;
    deliver(&mut state);
    assert_eq!(expectation(&state).outcome.as_deref(), Some("omitted"));
    assert_eq!(expectation(&state).extinction_dopamine_spent, 0.0);
    set(&mut state, "it:concept/dopamine", 1.0);
    state.tick += 1;
    deliver(&mut state);
    assert_eq!(action_weights(&state), weights);
    assert_eq!(value(&state, "it:concept/dopamine"), 1.0);
}

#[test]
fn real_runner_action_receives_real_relief_and_paid_edges_to_exact_action() {
    let mut state = world();
    execute_sit(&mut state);
    for schema in NEEDS {
        set(&mut state, schema, 0.8);
    }
    set(&mut state, "it:concept/dopamine", 1.0);
    let before = needs(&state);
    queue(&mut state, "give-approval", "teacher-wenger", "tim");
    let events = SimulationRunner::new().tick(&mut state, 0.0);
    assert!(events.iter().any(|event| matches!(event, WorldEvent::CommandExecuted { command_id, .. } if command_id == "give-approval")));
    for (schema, old) in NEEDS.into_iter().zip(before) {
        assert!(
            value(&state, schema) < old,
            "{schema} did not receive real relief"
        );
        let graph = &state.characters["tim"].mind_graph;
        let source = &graph.find_by_schema(schema).unwrap().instance_id;
        let edge = graph
            .edges
            .values()
            .find(|edge| {
                edge.source_instance_id == *source
                    && edge.target_instance_id == ACTION
                    && edge.learn_type == LearnType::Operant
            })
            .unwrap();
        assert!(edge.weight > 0.0 && edge.learnable);
        assert!(events.iter().any(|event| matches!(event, WorldEvent::LearningUpdated { edge_id, reward, prediction_error, dopamine_spent, .. } if edge_id == &edge.edge_id && *reward > 0.0 && *prediction_error > 0.0 && *dopamine_spent > 0.0)));
    }
    assert!(value(&state, "it:concept/dopamine") < 1.0);
    let episode = state.characters["tim"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap();
    assert!(episode.reward_consumed_at.is_some());
    assert!((episode.reinforcement_dopamine_spent - 0.012).abs() < 1e-12);
    let expectation = episode.social_reward_expectation.as_ref().unwrap();
    assert!((expectation.reward.unwrap() - 0.4).abs() < 1e-12);
    assert_eq!(expectation.extinction_dopamine_spent, 0.0);
}

#[test]
fn no_action_selection_and_manual_pose_cannot_receive_approval() {
    for case in 0..3 {
        let mut state = world();
        expose_effect(&mut state);
        if case > 0 {
            command(&mut state, "request-sit");
            state
                .characters
                .get_mut("tim")
                .unwrap()
                .mind_graph
                .nodes
                .get_mut(ACTION)
                .unwrap()
                .attended = true;
            ActionSelectionSystem.run(&mut state, 0.0);
            state
                .characters
                .get_mut("tim")
                .unwrap()
                .mind_graph
                .pending_action_request = None;
        }
        if case == 2 {
            state
                .character_postures
                .insert("tim".into(), CharacterPosture::Sitting);
        }
        let before = needs(&state);
        command(&mut state, "give-approval");
        deliver(&mut state);
        assert_eq!(needs(&state), before, "case {case}");
        assert_eq!(paid(&state), 0);
    }
}

#[test]
fn authored_stand_pair_can_receive_its_own_paid_social_credit() {
    let mut state = world();
    execute_sit(&mut state);
    command(&mut state, "give-approval");
    deliver(&mut state);
    queue(&mut state, "request-stand", "teacher-wenger", "tim");
    let runner = SimulationRunner::new();
    for _ in 0..3 {
        runner.tick(&mut state, 0.0);
        if state.character_postures.get("tim") == Some(&CharacterPosture::Standing) {
            break;
        }
    }
    assert_eq!(
        state.character_postures.get("tim"),
        Some(&CharacterPosture::Standing)
    );
    for schema in NEEDS {
        set(&mut state, schema, 0.8);
    }
    set(&mut state, "it:concept/dopamine", 1.0);
    command(&mut state, "give-approval");
    deliver(&mut state);
    for schema in NEEDS {
        assert!(value(&state, schema) < 0.8);
        let graph = &state.characters["tim"].mind_graph;
        let source = &graph.find_by_schema(schema).unwrap().instance_id;
        let edge = graph
            .edges
            .values()
            .find(|edge| {
                edge.source_instance_id == *source
                    && edge.target_instance_id == "tim-stand-on-command"
                    && edge.learn_type == LearnType::Operant
                    && edge.weight > 0.0
            })
            .unwrap();
        assert!(edge.learnable);
        assert!(state.pending_events.iter().any(|event| matches!(event,
            WorldEvent::LearningUpdated { edge_id, reward, prediction_error, dopamine_spent, .. }
                if edge_id == &edge.edge_id && *reward > 0.0 && *prediction_error > 0.0 && *dopamine_spent > 0.0
        )));
    }
    assert!(paid(&state) >= 2);
}

#[test]
fn duplicate_of_latest_consumed_response_never_falls_back_to_older_response() {
    let mut state = world();
    execute_sit(&mut state);
    queue(&mut state, "request-stand", "teacher-wenger", "tim");
    let runner = SimulationRunner::new();
    for _ in 0..3 {
        runner.tick(&mut state, 0.0);
        if state.character_postures.get("tim") == Some(&CharacterPosture::Standing) {
            break;
        }
    }
    let graph = &state.characters["tim"].mind_graph;
    assert_eq!(graph.action_episodes.len(), 2);
    assert!(graph.action_episodes[0].reward_consumed_at.is_none());
    assert_eq!(graph.action_episodes[1].action_id, "tim-stand-on-command");
    expose_effect(&mut state);
    command(&mut state, "give-approval");
    deliver(&mut state);
    let before = needs(&state);
    let dopamine = value(&state, "it:concept/dopamine");
    command(&mut state, "give-approval");
    deliver(&mut state);
    assert_eq!(needs(&state), before);
    assert_eq!(value(&state, "it:concept/dopamine"), dopamine);
    assert_eq!(paid(&state), 0);
    assert!(state.characters["tim"].mind_graph.action_episodes[0]
        .reward_consumed_at
        .is_none());
}

#[test]
fn mismatched_and_future_or_expired_motor_evidence_never_credits() {
    for case in 0..8 {
        let mut state = world();
        execute_sit(&mut state);
        expose_effect(&mut state);
        let now = state.tick;
        let episode = state
            .characters
            .get_mut("tim")
            .unwrap()
            .mind_graph
            .action_episodes
            .last_mut()
            .unwrap();
        match case {
            0 => episode.stimulus.as_mut().unwrap().emitter_id = Some("student-a".into()),
            1 => episode.stimulus.as_mut().unwrap().group_context = Some("other-group".into()),
            2 => {
                episode.stimulus.as_mut().unwrap().observation_schema_id =
                    "it:concept/instruction-stand".into()
            }
            3 => episode.physical_outcome = None,
            4 => {
                episode.physical_outcome = Some(ActionPhysicalOutcome::ActorPosture {
                    from: CharacterPosture::Sitting,
                    to: CharacterPosture::Sitting,
                })
            }
            5 => episode.executed_at = now + 100,
            6 => episode.action_schema_id = "it:concept/stand-on-command".into(),
            7 => state.tick += 1001,
            _ => unreachable!(),
        }
        let before = needs(&state);
        command(&mut state, "give-approval");
        deliver(&mut state);
        assert_eq!(needs(&state), before, "case {case}");
        assert_eq!(paid(&state), 0, "case {case}");
    }
}

#[test]
fn wrong_reward_actor_or_target_cannot_borrow_tims_episode() {
    for (actor, target) in [("student-a", "tim"), ("teacher-wenger", "student-a")] {
        let mut state = world();
        execute_sit(&mut state);
        expose_effect(&mut state);
        let before = needs(&state);
        state.tick += 1;
        queue(&mut state, "give-approval", actor, target);
        CommandSystem.run(&mut state, 0.0);
        deliver(&mut state);
        assert_eq!(needs(&state), before);
        assert_eq!(paid(&state), 0);
        assert!(state.characters["tim"]
            .mind_graph
            .action_episodes
            .last()
            .unwrap()
            .reward_consumed_at
            .is_none());
    }
}

#[test]
fn one_episode_is_consumed_once_for_queued_same_tick_cross_tick_and_save_restore() {
    let mut state = world();
    execute_sit(&mut state);
    expose_effect(&mut state);
    set(&mut state, "it:concept/dopamine", 1.0);
    state.tick += 1;
    queue(&mut state, "give-approval", "teacher-wenger", "tim");
    queue(&mut state, "give-approval", "teacher-wenger", "tim");
    CommandSystem.run(&mut state, 0.0);
    deliver(&mut state);
    assert!(paid(&state) > 0);
    let before = needs(&state);
    let dopamine = value(&state, "it:concept/dopamine");
    state.pending_events.clear();
    queue(&mut state, "give-approval", "teacher-wenger", "tim");
    CommandSystem.run(&mut state, 0.0);
    deliver(&mut state);
    assert_eq!(needs(&state), before);
    assert_eq!(value(&state, "it:concept/dopamine"), dopamine);
    let encoded = serde_json::to_string(&state).unwrap();
    let mut restored: WorldState = serde_json::from_str(&encoded).unwrap();
    command(&mut restored, "give-approval");
    deliver(&mut restored);
    assert_eq!(needs(&restored), before);
    assert_eq!(value(&restored, "it:concept/dopamine"), dopamine);
    assert_eq!(paid(&restored), 0);
}

#[test]
fn saved_pending_pin_stays_bound_to_sit_even_after_a_real_stand_response() {
    let mut state = world();
    execute_sit(&mut state);
    command(&mut state, "give-approval");
    let encoded = serde_json::to_string(&state).unwrap();
    let mut state: WorldState = serde_json::from_str(&encoded).unwrap();
    let approval_id = state.characters["tim"]
        .mind_graph
        .nodes
        .values()
        .find(|node| node.schema_id == "it:concept/social-approval")
        .unwrap()
        .instance_id
        .clone();
    state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut(&approval_id)
        .unwrap()
        .active = false;
    queue(&mut state, "request-stand", "teacher-wenger", "tim");
    let runner = SimulationRunner::new();
    for _ in 0..3 {
        runner.tick(&mut state, 0.0);
        if state.character_postures.get("tim") == Some(&CharacterPosture::Standing) {
            break;
        }
    }
    assert_eq!(
        state.character_postures.get("tim"),
        Some(&CharacterPosture::Standing)
    );
    let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
    assert_eq!(
        graph.action_episodes.last().unwrap().action_id,
        "tim-stand-on-command"
    );
    assert!(graph
        .action_episodes
        .last()
        .unwrap()
        .reward_consumed_at
        .is_none());
    // Corrupt the original receipt: a delivery must fail closed, not seek the
    // newly available, otherwise perfectly eligible stand action.
    graph.action_episodes[0].physical_outcome = None;
    let approval = graph.nodes.get_mut(&approval_id).unwrap();
    approval.active = true;
    approval.attended = true;
    approval.created_at = state.tick;
    let before = needs(&state);
    state.pending_events.clear();
    deliver(&mut state);
    assert_eq!(needs(&state), before);
    assert_eq!(paid(&state), 0);
    assert!(state.characters["tim"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap()
        .reward_consumed_at
        .is_none());
}

#[test]
fn save_between_command_and_delivery_preserves_exact_pin_and_one_delivery() {
    let mut state = world();
    execute_sit(&mut state);
    for schema in NEEDS {
        set(&mut state, schema, 0.8);
    }
    set(&mut state, "it:concept/dopamine", 1.0);
    command(&mut state, "give-approval");
    assert!(state.characters["tim"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap()
        .reward_consumed_at
        .is_some());
    let encoded = serde_json::to_string(&state).unwrap();
    let mut restored: WorldState = serde_json::from_str(&encoded).unwrap();
    deliver(&mut restored);
    assert!(paid(&restored) >= 2);
    assert_eq!(
        restored.characters["tim"]
            .mind_graph
            .action_episodes
            .last()
            .unwrap()
            .social_reward_delivered_at,
        Some(restored.tick)
    );
    let after = needs(&restored);
    let dopamine = value(&restored, "it:concept/dopamine");
    restored.pending_events.clear();
    // Even an observation refresh cannot manufacture another receipt delivery.
    restored.tick += 1;
    for node in restored
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .values_mut()
    {
        if node.schema_id == "it:concept/social-approval" {
            node.created_at = restored.tick;
            node.observation.as_mut().unwrap().social_consumed_at = None;
        }
    }
    deliver(&mut restored);
    assert_eq!(needs(&restored), after);
    assert_eq!(value(&restored, "it:concept/dopamine"), dopamine);
    assert_eq!(paid(&restored), 0);
}

#[test]
fn zero_relief_or_zero_dopamine_still_irrevocably_consumes_action_reward() {
    for unfunded in [false, true] {
        let mut state = world();
        execute_sit(&mut state);
        expose_effect(&mut state);
        for schema in NEEDS {
            set(&mut state, schema, if unfunded { 0.8 } else { 0.0 });
        }
        set(
            &mut state,
            "it:concept/dopamine",
            if unfunded { 0.0 } else { 1.0 },
        );
        let before = needs(&state);
        command(&mut state, "give-approval");
        deliver(&mut state);
        assert_eq!(paid(&state), 0);
        assert!(state.characters["tim"]
            .mind_graph
            .action_episodes
            .last()
            .unwrap()
            .reward_consumed_at
            .is_some());
        assert_eq!(
            state.characters["tim"]
                .mind_graph
                .action_episodes
                .last()
                .unwrap()
                .social_reward_delivered_at,
            Some(state.tick)
        );
        if unfunded {
            assert!(needs(&state)[0] < before[0]);
        }
        for schema in NEEDS {
            set(&mut state, schema, 0.8);
        }
        set(&mut state, "it:concept/dopamine", 1.0);
        command(&mut state, "give-approval");
        deliver(&mut state);
        assert_eq!(needs(&state), [0.8, 0.8]);
        assert_eq!(value(&state, "it:concept/dopamine"), 1.0);
        assert_eq!(paid(&state), 0);
    }
}
