//! Social relief is a consumed presentation; association updates spend real dopamine.
use std::path::Path;

use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::CommandDTO;
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::mind_node::{
    LearnType, Modality, SignalType, SocialNeedBinding,
};
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::command_system::CommandSystem;
use intention_tower_game_lib::systems::runner::SimulationRunner;
use intention_tower_game_lib::systems::social_dynamics::SocialDynamicsSystem;
use intention_tower_game_lib::systems::social_signal::SocialSignalSystem;
use intention_tower_game_lib::systems::System;

const NEED: &str = "tim-loneliness";
const IDENTITY: &str = "meme_it_concept_group-identity";
const SIGNAL: &str = "obs_it_concept_social-approval";
const EDGE: &str = "social_tim-loneliness_meme_it_concept_group-identity";

fn close(actual: f64, expected: f64) {
    assert!((actual - expected).abs() < 1e-12, "{actual} != {expected}");
}

fn queue(state: &mut WorldState, command_id: &str, target: &str) {
    let definition = state
        .command_defs
        .iter()
        .find(|d| d.command_id == command_id)
        .unwrap();
    assert!(!definition.effect_templates.is_empty());
    state.pending_commands.push(CommandDTO {
        command_id: command_id.into(),
        actor_id: "teacher-wenger".into(),
        target_id: Some(target.into()),
        // Production must execute the real definition, not this untrusted payload.
        effects: vec![],
    });
}

fn execute(state: &mut WorldState, command_id: &str, target: &str) {
    queue(state, command_id, target);
    CommandSystem.run(state, 0.0);
    assert!(state.pending_events.iter().any(|event| matches!(event,
        WorldEvent::CommandExecuted { command_id: id, .. } if id == command_id)));
}

fn world() -> WorldState {
    let mut state = load_level_from_path(
        &Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/the-wave"),
    )
    .unwrap();
    state.tick = 10;
    execute(&mut state, "introduce-uniform", "tim");
    let identity = &state.characters["tim"].mind_graph.nodes[IDENTITY];
    let binding = &identity.meme.as_ref().unwrap().social_need_bindings[0];
    assert_eq!(binding.need_schema_id, "it:concept/loneliness");
    close(binding.relief, 0.2);
    state.pending_events.clear();
    state
}

fn value(state: &WorldState, id: &str) -> f64 {
    state.characters["tim"].mind_graph.nodes[id].value
}

fn set_value(state: &mut WorldState, id: &str, value: f64) {
    state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut(id)
        .unwrap()
        .value = value;
}

fn dopamine(state: &WorldState) -> f64 {
    state.characters["tim"]
        .mind_graph
        .resource_value("it:concept/dopamine")
}

fn set_dopamine(state: &mut WorldState, value: f64) {
    state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .find_by_schema_mut("it:concept/dopamine")
        .unwrap()
        .value = value;
}

fn present(state: &mut WorldState, command_id: &str) {
    state.tick += 1;
    state.pending_events.clear();
    execute(state, command_id, "tim");
}

fn learnings(state: &WorldState) -> Vec<(f64, f64, f64, f64, f64)> {
    state
        .pending_events
        .iter()
        .filter_map(|event| match event {
            WorldEvent::LearningUpdated {
                edge_id,
                reward,
                prediction,
                prediction_error,
                dopamine_spent,
                new_weight,
                ..
            } if edge_id.starts_with("social_") => Some((
                *reward,
                *prediction,
                *prediction_error,
                *dopamine_spent,
                *new_weight,
            )),
            _ => None,
        })
        .collect()
}

#[test]
fn real_wave_approval_relief_has_exact_paid_prediction_error_learning() {
    let mut state = world();
    let before = dopamine(&state);
    present(&mut state, "give-approval");
    let observation = state.characters["tim"].mind_graph.nodes[SIGNAL]
        .observation
        .as_ref()
        .unwrap();
    assert_eq!(observation.signal_type, Some(SignalType::Approval));
    assert_eq!(observation.group_context.as_deref(), Some("the-wave"));
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.6);
    close(dopamine(&state), before - 0.05);
    assert_eq!(learnings(&state).len(), 1);
    let (reward, prediction, error, cost, weight) = learnings(&state)[0];
    for (actual, expected) in [
        (reward, 1.0),
        (prediction, 0.0),
        (error, 1.0),
        (cost, 0.05),
        (weight, 0.2),
    ] {
        close(actual, expected);
    }
    let edge = &state.characters["tim"].mind_graph.edges[EDGE];
    assert_eq!(edge.learn_type, LearnType::Social);
    assert!(edge.learnable);
    assert_eq!(edge.source_instance_id, NEED);
    assert_eq!(edge.target_instance_id, IDENTITY);
    assert!(state.pending_events.iter().any(|event| matches!(event,
        WorldEvent::ResourceConsumed { resource_schema_id, amount, .. }
        if resource_schema_id == "it:concept/dopamine" && (*amount - 0.05).abs() < 1e-12)));
}

#[test]
fn long_ttl_and_repeated_system_runs_do_not_repeat_a_presentation() {
    let mut state = world();
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    let before = serde_json::to_value(&state.characters["tim"].mind_graph).unwrap();
    let consumed_at = state.tick;
    state.pending_events.clear();
    for _ in 0..100 {
        SocialSignalSystem.run(&mut state, 100.0);
        state.tick += 1;
    }
    assert_eq!(
        serde_json::to_value(&state.characters["tim"].mind_graph).unwrap(),
        before
    );
    assert!(learnings(&state).is_empty());
    assert_eq!(
        state.characters["tim"].mind_graph.nodes[SIGNAL]
            .observation
            .as_ref()
            .unwrap()
            .social_consumed_at,
        Some(consumed_at)
    );
}

#[test]
fn real_runner_and_serialized_restore_cannot_redeem_the_same_signal_again() {
    let mut state = world();
    let runner = SimulationRunner::new();
    queue(&mut state, "give-approval", "tim");
    let events = runner.tick(&mut state, 0.5);
    assert!(events.iter().any(|event| matches!(event,
        WorldEvent::CommandExecuted { command_id, .. } if command_id == "give-approval")));
    assert!(events.iter().any(|event| matches!(event,
        WorldEvent::LearningUpdated { edge_id, .. } if edge_id == EDGE)));
    let consumed_at = state.tick;
    let encoded = serde_json::to_string(&state).unwrap();
    let mut restored: WorldState = serde_json::from_str(&encoded).unwrap();
    assert_eq!(
        restored.characters["tim"].mind_graph.nodes[SIGNAL]
            .observation
            .as_ref()
            .unwrap()
            .social_consumed_at,
        Some(consumed_at)
    );
    let before = dopamine(&restored);
    SocialSignalSystem.run(&mut restored, 0.0);
    close(dopamine(&restored), before);
    assert!(learnings(&restored).is_empty());
    for _ in 0..20 {
        let events = runner.tick(&mut restored, 0.5);
        assert!(!events.iter().any(|event| matches!(event,
            WorldEvent::LearningUpdated { edge_id, .. } if edge_id.starts_with("social_"))));
    }
}

#[test]
fn unfunded_relief_is_real_but_refilling_dopamine_does_not_backpay_learning() {
    let mut state = world();
    set_dopamine(&mut state, 0.0);
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.6);
    assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
    assert!(learnings(&state).is_empty());
    assert_eq!(
        state.characters["tim"].mind_graph.nodes[SIGNAL]
            .observation
            .as_ref()
            .unwrap()
            .social_consumed_at,
        Some(state.tick)
    );
    set_dopamine(&mut state, 1.0);
    SocialSignalSystem.run(&mut state, 0.0);
    state.tick += 1;
    SocialSignalSystem.run(&mut state, 0.0);
    close(dopamine(&state), 1.0);
    close(value(&state, NEED), 0.6);
    assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
    assert!(learnings(&state).is_empty());
}

#[test]
fn same_tick_refresh_cannot_double_spend_but_a_new_presentation_can_learn() {
    let mut state = world();
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    let before = dopamine(&state);
    state.pending_events.clear();
    execute(&mut state, "give-approval", "tim");
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.6);
    close(dopamine(&state), before);
    assert!(learnings(&state).is_empty());
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.4);
    close(dopamine(&state), before - 0.04);
    close(state.characters["tim"].mind_graph.edges[EDGE].weight, 0.36);
    assert_eq!(learnings(&state).len(), 1);
}

#[test]
fn eligibility_requires_current_attended_social_signal_and_matching_active_identity() {
    for case in 0..8 {
        let mut state = world();
        present(&mut state, "give-approval");
        let tick = state.tick;
        let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
        match case {
            0 => {
                graph
                    .nodes
                    .get_mut(SIGNAL)
                    .unwrap()
                    .observation
                    .as_mut()
                    .unwrap()
                    .group_context = Some("another-group".into())
            }
            1 => {
                graph
                    .nodes
                    .get_mut(SIGNAL)
                    .unwrap()
                    .observation
                    .as_mut()
                    .unwrap()
                    .modality = Some(Modality::Visual)
            }
            2 => graph.nodes.get_mut(SIGNAL).unwrap().attended = false,
            3 => graph.nodes.get_mut(SIGNAL).unwrap().created_at = tick - 1,
            4 => {
                graph
                    .nodes
                    .get_mut(SIGNAL)
                    .unwrap()
                    .observation
                    .as_mut()
                    .unwrap()
                    .is_signal = false
            }
            5 => {
                graph
                    .nodes
                    .get_mut(SIGNAL)
                    .unwrap()
                    .observation
                    .as_mut()
                    .unwrap()
                    .group_context = None
            }
            6 => graph.nodes.get_mut(IDENTITY).unwrap().active = false,
            7 => {
                graph
                    .nodes
                    .get_mut(IDENTITY)
                    .unwrap()
                    .meme
                    .as_mut()
                    .unwrap()
                    .is_identity = false
            }
            _ => unreachable!(),
        }
        let before = dopamine(&state);
        SocialSignalSystem.run(&mut state, 0.0);
        close(value(&state, NEED), 0.8);
        close(dopamine(&state), before);
        assert!(learnings(&state).is_empty(), "case {case}");
        assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
        if [0, 5, 6, 7].contains(&case) {
            assert_eq!(
                state.characters["tim"].mind_graph.nodes[SIGNAL]
                    .observation
                    .as_ref()
                    .unwrap()
                    .social_consumed_at,
                Some(tick)
            );
        }
    }
}

#[test]
fn invalid_bindings_and_missing_or_resource_needs_are_safe_and_consumed() {
    for case in 0..7 {
        let mut state = world();
        let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
        let binding = &mut graph
            .nodes
            .get_mut(IDENTITY)
            .unwrap()
            .meme
            .as_mut()
            .unwrap()
            .social_need_bindings[0];
        match case {
            0 => binding.relief = 0.0,
            1 => binding.relief = -0.2,
            2 => binding.relief = 1.1,
            3 => binding.relief = f64::NAN,
            4 => binding.relief = f64::INFINITY,
            5 => binding.need_schema_id = "test:missing-need".into(),
            6 => binding.need_schema_id = "it:concept/dopamine".into(),
            _ => unreachable!(),
        }
        present(&mut state, "give-approval");
        let before = dopamine(&state);
        SocialSignalSystem.run(&mut state, 0.0);
        close(value(&state, NEED), 0.8);
        close(dopamine(&state), before);
        assert!(learnings(&state).is_empty(), "case {case}");
        assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
        assert_eq!(
            state.characters["tim"].mind_graph.nodes[SIGNAL]
                .observation
                .as_ref()
                .unwrap()
                .social_consumed_at,
            Some(state.tick)
        );
    }
}

#[test]
fn absent_nonresource_or_insufficient_dopamine_cannot_pay_for_an_edge() {
    for case in 0..3 {
        let mut state = world();
        let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
        let id = graph
            .find_by_schema("it:concept/dopamine")
            .unwrap()
            .instance_id
            .clone();
        if case == 0 {
            graph.nodes.remove(&id);
        } else if case == 1 {
            graph
                .nodes
                .get_mut(&id)
                .unwrap()
                .prior_instinct
                .as_mut()
                .unwrap()
                .is_resource = false;
        } else {
            graph.nodes.get_mut(&id).unwrap().value = 0.049;
        }
        present(&mut state, "give-approval");
        SocialSignalSystem.run(&mut state, 0.0);
        close(value(&state, NEED), 0.6);
        assert!(learnings(&state).is_empty());
        assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
        if case == 2 {
            close(dopamine(&state), 0.049);
        }
    }
}

#[test]
fn only_realized_relief_learns_and_duplicate_bindings_do_not_multiply_it() {
    let mut state = world();
    set_value(&mut state, NEED, 0.0);
    present(&mut state, "give-approval");
    let before = dopamine(&state);
    SocialSignalSystem.run(&mut state, 0.0);
    close(dopamine(&state), before);
    assert!(learnings(&state).is_empty());
    assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
    set_value(&mut state, NEED, 0.1);
    state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut(IDENTITY)
        .unwrap()
        .meme
        .as_mut()
        .unwrap()
        .social_need_bindings
        .push(SocialNeedBinding {
            need_schema_id: "it:concept/loneliness".into(),
            relief: 0.2,
        });
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.0);
    close(dopamine(&state), before - 0.025);
    assert_eq!(learnings(&state).len(), 1);
    let (reward, _, error, cost, weight) = learnings(&state)[0];
    for (actual, expected) in [(reward, 0.5), (error, 0.5), (cost, 0.025), (weight, 0.1)] {
        close(actual, expected);
    }
}

#[test]
fn rejection_aggravates_need_and_pays_to_weaken_but_never_creates_a_negative_edge() {
    let mut state = world();
    present(&mut state, "reject-outsider");
    let before = dopamine(&state);
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 1.0);
    close(dopamine(&state), before);
    assert!(learnings(&state).is_empty());
    assert!(!state.characters["tim"].mind_graph.edges.contains_key(EDGE));
    set_value(&mut state, NEED, 0.8);
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    present(&mut state, "give-approval");
    SocialSignalSystem.run(&mut state, 0.0);
    let before = dopamine(&state);
    present(&mut state, "reject-outsider");
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.6);
    close(state.characters["tim"].mind_graph.edges[EDGE].weight, 0.088);
    close(dopamine(&state), before - 0.068);
    assert_eq!(learnings(&state).len(), 1);
    let (reward, prediction, error, cost, weight) = learnings(&state)[0];
    for (actual, expected) in [
        (reward, -1.0),
        (prediction, 0.36),
        (error, -1.36),
        (cost, 0.068),
        (weight, 0.088),
    ] {
        close(actual, expected);
    }
}

#[test]
fn generic_authored_schemas_support_belonging_and_threat_without_wave_hardcoding() {
    let mut state = world();
    let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
    graph.nodes.get_mut(NEED).unwrap().schema_id = "test:need-a7f91".into();
    let identity = graph.nodes.get_mut(IDENTITY).unwrap();
    identity.schema_id = "test:identity-b8e42".into();
    let meme = identity.meme.as_mut().unwrap();
    meme.group_id = Some("test:group-c9146".into());
    meme.social_need_bindings[0].need_schema_id = "test:need-a7f91".into();
    present(&mut state, "give-approval");
    let observation = state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut(SIGNAL)
        .unwrap()
        .observation
        .as_mut()
        .unwrap();
    observation.group_context = Some("test:group-c9146".into());
    observation.signal_type = Some(SignalType::Belonging);
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.6);
    close(state.characters["tim"].mind_graph.edges[EDGE].weight, 0.2);
    present(&mut state, "give-approval");
    let observation = state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut(SIGNAL)
        .unwrap()
        .observation
        .as_mut()
        .unwrap();
    observation.group_context = Some("test:group-c9146".into());
    observation.signal_type = Some(SignalType::Threat);
    SocialSignalSystem.run(&mut state, 0.0);
    close(value(&state, NEED), 0.8);
    close(state.characters["tim"].mind_graph.edges[EDGE].weight, 0.0);
    assert_eq!(learnings(&state).len(), 1);
    close(learnings(&state)[0].0, -1.0);
}

#[test]
fn group_size_and_time_only_aggregate_and_never_supply_free_identity_strength() {
    let mut state = world();
    for target in ["student-a", "student-b"] {
        execute(&mut state, "introduce-uniform", target);
    }
    state.pending_events.clear();
    let before = serde_json::to_value(&state.characters).unwrap();
    for _ in 0..100 {
        state.tick += 1;
        SocialDynamicsSystem.run(&mut state, 100.0);
    }
    assert_eq!(state.social_groups["the-wave"].members.len(), 3);
    assert_eq!(serde_json::to_value(&state.characters).unwrap(), before);
    assert!(learnings(&state).is_empty());
    assert!(!state.pending_events.iter().any(|event| matches!(
        event,
        WorldEvent::ResourceConsumed { .. } | WorldEvent::NodeValueChanged { .. }
    )));
}
