//! Real JSON-LD, real command effects, all systems: no fabricated learned edge.
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::{CommandDTO, CommandEffect};
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::mind_node::Modality;
use intention_tower_game_lib::models::progress::LevelStatus;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::runner::SimulationRunner;
use std::path::Path;

mod support;

const EDGE: &str = "learned_obs_it_concept_hear-metronome_dog-salivate";
fn world() -> WorldState {
    load_level_from_path(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/pavlov"))
        .unwrap()
}
fn command(state: &mut WorldState, id: &str) {
    let effects = state
        .command_defs
        .iter()
        .find(|def| def.command_id == id)
        .unwrap()
        .effect_templates
        .clone();
    state.pending_commands.push(CommandDTO {
        command_id: id.into(),
        actor_id: "pavlov".into(),
        target_id: Some("dog".into()),
        effects,
    });
}
fn ticks(state: &mut WorldState, count: usize) -> Vec<WorldEvent> {
    let runner = SimulationRunner::new();
    (0..count).flat_map(|_| runner.tick(state, 1.0)).collect()
}
fn pair(state: &mut WorldState) -> Vec<WorldEvent> {
    command(state, "ring-bell");
    let mut events = ticks(state, 1);
    command(state, "feed");
    events.extend(ticks(state, 11));
    events
}
fn weight(state: &WorldState) -> f64 {
    state.characters["dog"]
        .mind_graph
        .edges
        .get(EDGE)
        .map_or(0.0, |edge| edge.weight)
}

#[test]
fn hungry_untrained_bell_does_not_learn_or_salivate_or_win() {
    let mut state = world();
    ticks(&mut state, 100);
    for _ in 0..8 {
        command(&mut state, "ring-bell");
        ticks(&mut state, 3);
        assert!(!state.characters["dog"].mind_graph.nodes["dog-salivate"].active);
        ticks(&mut state, 9);
    }
    assert_eq!(weight(&state), 0.0);
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}

#[test]
fn food_alone_and_backward_pairing_do_not_condition_bell() {
    let mut state = world();
    for _ in 0..5 {
        command(&mut state, "feed");
        ticks(&mut state, 1);
        assert!(state.characters["dog"].mind_graph.nodes["dog-salivate"].active);
        command(&mut state, "ring-bell");
        ticks(&mut state, 12);
    }
    assert_eq!(weight(&state), 0.0);
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}

#[test]
fn forward_pairing_uses_diminishing_prediction_error_and_exact_dopamine_cost() {
    let mut state = world();
    for index in 1..=5 {
        let events = pair(&mut state);
        let updates: Vec<_> = events
            .iter()
            .filter_map(|event| match event {
                WorldEvent::LearningUpdated {
                    reward,
                    prediction,
                    prediction_error,
                    dopamine_spent,
                    old_weight,
                    new_weight,
                    ..
                } => Some((
                    *reward,
                    *prediction,
                    *prediction_error,
                    *dopamine_spent,
                    *old_weight,
                    *new_weight,
                )),
                _ => None,
            })
            .collect();
        assert_eq!(
            updates.len(),
            1,
            "one update per presentation, not per active tick"
        );
        let (reward, prediction, error, cost, old, new) = updates[0];
        assert_eq!(reward, 1.0);
        assert!((error - (reward - prediction)).abs() < 1e-12);
        assert!((new - old - 0.2 * error).abs() < 1e-12);
        assert!((cost - (new - old).abs() * 0.25).abs() < 1e-12);
        assert!((weight(&state) - (1.0 - 0.8_f64.powi(index))).abs() < 1e-12);
        assert_eq!(
            state.progress.status,
            LevelStatus::InProgress,
            "training is not an independent test"
        );
    }
    assert_eq!(
        state.characters["dog"].mind_graph.conditioning_stats[EDGE].paired_trials,
        5
    );
    let graph = &state.characters["dog"].mind_graph;
    assert!(
        graph
            .edges
            .values()
            .filter(|edge| edge.learnable)
            .all(|edge| edge.source_instance_id != "obs_it_concept_salivate"),
        "public feedback about the dog's own response must not become a self-predicting cue"
    );
    assert!(graph
        .conditioning_trials
        .iter()
        .all(|trial| trial.source_id != "obs_it_concept_salivate"));
}

#[test]
fn independent_bell_response_is_required_and_settles_only_after_reward_window() {
    let mut state = world();
    for _ in 0..3 {
        pair(&mut state);
    }
    assert_eq!(state.progress.status, LevelStatus::InProgress);
    command(&mut state, "ring-bell");
    ticks(&mut state, 2);
    assert!(state.characters["dog"].mind_graph.nodes["dog-salivate"].active);
    assert!(!state.characters["dog"].mind_graph.nodes["obs_it_concept_see-food"].active);
    assert_eq!(state.progress.status, LevelStatus::InProgress);
    ticks(&mut state, 10);
    assert_eq!(state.progress.status, LevelStatus::Won);
    assert_eq!(
        state.characters["dog"].mind_graph.conditioning_stats[EDGE].independent_responses,
        1
    );
}

#[test]
fn omission_extinguishes_real_response_and_survives_ttl_cleanup() {
    let mut state = world();
    // Mechanism sandbox: independent responses must not finish the authored level
    // and prevent the subsequent real omission commands from executing.
    state.progress.objectives.clear();
    state.progress.failure_rules.clear();
    for _ in 0..5 {
        pair(&mut state);
    }
    let trained = weight(&state);
    ticks(&mut state, 500);
    assert_eq!(
        weight(&state),
        trained,
        "elapsed time alone is not reward omission"
    );
    for index in 1..=8 {
        command(&mut state, "ring-bell");
        let events = ticks(&mut state, 12);
        assert!(events.iter().any(|event| matches!(event,
            WorldEvent::CommandExecuted { command_id, .. } if command_id == "ring-bell")));
        assert!((weight(&state) - trained * 0.8_f64.powi(index)).abs() < 1e-12);
        assert!(events.iter().any(|event| matches!(event,
            WorldEvent::LearningUpdated { prediction_error, phase, .. }
            if *prediction_error < 0.0 && phase == "extinguished")));
    }
    command(&mut state, "ring-bell");
    let events = ticks(&mut state, 3);
    assert!(events.iter().any(|event| matches!(event,
        WorldEvent::CommandExecuted { command_id, .. } if command_id == "ring-bell")));
    assert!(!state.characters["dog"].mind_graph.nodes["dog-salivate"].active);
    assert!(state.characters["dog"].mind_graph.edges.contains_key(EDGE));
    let mut removed = false;
    for _ in 0..30 {
        command(&mut state, "ring-bell");
        let events = ticks(&mut state, 12);
        assert!(events.iter().any(|event| matches!(event,
            WorldEvent::CommandExecuted { command_id, .. } if command_id == "ring-bell")));
        removed |= events.iter().any(
            |event| matches!(event, WorldEvent::EdgeRemoved { edge_id, .. } if edge_id == EDGE),
        );
    }
    assert!(
        removed,
        "continued omission eventually forgets the association"
    );
    assert_eq!(weight(&state), 0.0);
}

#[test]
fn dopamine_is_required_and_no_stale_reward_is_reused() {
    let mut state = world();
    let dopamine = state
        .characters
        .get_mut("dog")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("dog-dopamine")
        .unwrap();
    dopamine.value = 0.0;
    dopamine.value_velocity = 0.0;
    let events = pair(&mut state);
    assert_eq!(weight(&state), 0.0);
    assert!(!events
        .iter()
        .any(|event| matches!(event, WorldEvent::LearningUpdated { .. })));
    state
        .characters
        .get_mut("dog")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("dog-dopamine")
        .unwrap()
        .value = 1.0;
    command(&mut state, "ring-bell");
    ticks(&mut state, 12);
    assert_eq!(
        weight(&state),
        0.0,
        "old food cannot reward a new presentation"
    );
}

#[test]
fn attention_is_causal_not_bypassed_by_command_spawn() {
    let mut state = world();
    let attention = state
        .characters
        .get_mut("dog")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("dog-attention")
        .unwrap();
    attention.value = 0.0;
    attention.value_velocity = 0.0;
    for _ in 0..4 {
        pair(&mut state);
    }
    assert_eq!(weight(&state), 0.0);
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}

#[test]
fn food_outside_eligibility_window_does_not_count_as_pair() {
    let mut state = world();
    command(&mut state, "ring-bell");
    ticks(&mut state, 12);
    command(&mut state, "feed");
    ticks(&mut state, 12);
    assert_eq!(weight(&state), 0.0);
}

#[test]
fn cue_identity_is_generic_and_conditioning_does_not_spread_to_other_cues() {
    let mut state = world();
    for _ in 0..3 {
        pair(&mut state);
    }
    support::queue_fixture_command(
        &mut state,
        CommandDTO {
            command_id: "test-other-cue".into(),
            actor_id: "pavlov".into(),
            target_id: Some("dog".into()),
            effects: vec![CommandEffect::SpawnObservation {
                schema_id: "test:slow-metronome".into(),
                modality: Modality::Auditory,
                about: "test:slow-sound".into(),
                signal_type: None,
                group_context: None,
                ttl: 10,
                strength: 0.8,
                target_character_id: None,
            }],
        },
    );
    ticks(&mut state, 3);
    assert!(
        state.characters["dog"]
            .mind_graph
            .find_by_schema("test:slow-metronome")
            .is_some(),
        "the unrelated cue must actually be presented"
    );
    assert!(!state.characters["dog"].mind_graph.nodes["dog-salivate"].active);
    ticks(&mut state, 9);
    assert_eq!(state.progress.status, LevelStatus::InProgress);
    assert!(state.characters["dog"]
        .mind_graph
        .edges
        .values()
        .filter(|edge| edge.learnable)
        .all(|edge| edge.source_instance_id == "obs_it_concept_hear-metronome"));
}

#[test]
fn save_roundtrip_preserves_pending_trial_and_learned_memory() {
    let mut state = world();
    command(&mut state, "ring-bell");
    ticks(&mut state, 1);
    state = serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
    command(&mut state, "feed");
    ticks(&mut state, 11);
    assert!((weight(&state) - 0.2).abs() < 1e-12);
}

#[test]
fn reward_feedback_is_immediate_but_persistent_food_does_not_reinforce_again() {
    let mut state = world();
    command(&mut state, "ring-bell");
    ticks(&mut state, 1);
    command(&mut state, "feed");
    let events = ticks(&mut state, 1);
    assert!((weight(&state) - 0.2).abs() < 1e-12);
    assert!(events.iter().any(
        |event| matches!(event, WorldEvent::LearningUpdated { phase, .. } if phase == "created")
    ));
    let events = ticks(&mut state, 8);
    assert!(!events
        .iter()
        .any(|event| matches!(event, WorldEvent::LearningUpdated { .. })));
    assert!((weight(&state) - 0.2).abs() < 1e-12);
}

#[test]
fn compound_cues_share_prediction_and_do_not_each_learn_full_reward() {
    let mut state = world();
    for index in 1..=8 {
        command(&mut state, "ring-bell");
        support::queue_fixture_command(
            &mut state,
            CommandDTO {
                command_id: format!("test-light-{index}"),
                actor_id: "pavlov".into(),
                target_id: Some("dog".into()),
                effects: vec![CommandEffect::SpawnObservation {
                    schema_id: "test:light".into(),
                    modality: Modality::Visual,
                    about: "test:light".into(),
                    signal_type: None,
                    group_context: None,
                    ttl: 10,
                    strength: 0.8,
                    target_character_id: None,
                }],
            },
        );
        ticks(&mut state, 1);
        command(&mut state, "feed");
        ticks(&mut state, 11);
        let graph = &state.characters["dog"].mind_graph;
        let total: f64 = graph
            .edges
            .values()
            .filter(|edge| edge.learnable)
            .map(|edge| edge.weight)
            .sum();
        assert!((total - (1.0 - 0.6_f64.powi(index))).abs() < 1e-12);
        assert!(total <= 1.0);
        assert!((weight(&state) - total / 2.0).abs() < 1e-12);
    }
}

#[test]
fn repeated_cue_refreshes_during_one_window_cannot_farm_learning() {
    let mut state = world();
    for _ in 0..6 {
        command(&mut state, "ring-bell");
        ticks(&mut state, 1);
    }
    command(&mut state, "feed");
    ticks(&mut state, 12);
    assert!((weight(&state) - 0.2).abs() < 1e-12);
    assert_eq!(
        state.characters["dog"].mind_graph.conditioning_stats[EDGE].paired_trials,
        1
    );
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}
