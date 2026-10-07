//! Real authored contact, resource-gated imprint and entity-position following.
//! The initial Imprinting-labelled edge is wiring, never evidence of learning.
use intention_tower_game_lib::command_rules::command_available;
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::{CommandDTO, CommandEffect};
use intention_tower_game_lib::models::mind_node::Modality;
use intention_tower_game_lib::models::progress::LevelStatus;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::runner::SimulationRunner;
use serde_json::Value;
use std::path::Path;

fn world() -> WorldState {
    load_level_from_path(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/gosling"))
        .unwrap()
}
fn command(state: &mut WorldState, id: &str) {
    let def = state
        .command_defs
        .iter()
        .find(|def| def.command_id == id)
        .unwrap();
    assert!(command_available(def, "lorenz", Some("gosling"), state));
    state.pending_commands.push(CommandDTO {
        command_id: id.into(),
        actor_id: "lorenz".into(),
        target_id: Some("gosling".into()),
        effects: def.effect_templates.clone(),
    });
}
fn ticks(state: &mut WorldState, count: usize) {
    let runner = SimulationRunner::new();
    for _ in 0..count {
        runner.tick(state, 0.5);
    }
}
fn motivation(state: &WorldState) -> Value {
    serde_json::to_value(
        state.characters["gosling"].mind_graph.nodes["gosling-imprint-target"]
            .motivation
            .as_ref()
            .unwrap(),
    )
    .unwrap()
}
fn gap(state: &WorldState) -> f64 {
    let goose = &state.characters["gosling"].position;
    let target = &state.characters["lorenz"].position;
    ((goose.x - target.x).powi(2) + (goose.y - target.y).powi(2)).sqrt()
}
fn assert_unimprinted(state: &WorldState) {
    assert!(motivation(state)["target_entity"].is_null());
    assert!(motivation(state)["imprinting_evidence"].is_null());
    assert!(!state.characters["gosling"]
        .mind_graph
        .edges
        .keys()
        .any(|id| id.starts_with("imprint_")));
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}
fn block_resource(state: &mut WorldState, schema: &str) {
    let node = state
        .characters
        .get_mut("gosling")
        .unwrap()
        .mind_graph
        .find_by_schema_mut(schema)
        .unwrap();
    node.value = 0.0;
    node.value_velocity = 0.0;
}

#[test]
fn initial_follow_wiring_and_command_counts_do_not_imply_imprinting_or_win() {
    let mut state = world();
    assert!(state.characters["gosling"]
        .mind_graph
        .edges
        .contains_key("imprint-to-follow"));
    for (id, count) in [("approach-gosling", 3), ("make-sound", 2), ("move-away", 1)] {
        for _ in 0..count {
            state.progress.record_command(id, Some("gosling"));
        }
    }
    ticks(&mut state, 1);
    assert_unimprinted(&state);
}

#[test]
fn critical_period_boundary_and_late_contact_cannot_imprint() {
    for tick in [3000, 4000] {
        let mut state = world();
        state.tick = tick;
        command(&mut state, "approach-gosling");
        ticks(&mut state, 12);
        assert_unimprinted(&state);
    }
}

#[test]
fn zero_dopamine_with_regeneration_blocked_cannot_imprint() {
    let mut state = world();
    block_resource(&mut state, "it:concept/dopamine");
    command(&mut state, "approach-gosling");
    ticks(&mut state, 12);
    assert_unimprinted(&state);
}

#[test]
fn zero_attention_with_regeneration_blocked_cannot_imprint_or_follow() {
    let mut state = world();
    block_resource(&mut state, "it:concept/attention");
    let before = state.characters["gosling"].position.clone();
    command(&mut state, "approach-gosling");
    ticks(&mut state, 12);
    assert_unimprinted(&state);
    assert_eq!(state.characters["gosling"].position.x, before.x);
    assert_eq!(state.characters["gosling"].position.y, before.y);
}

#[test]
fn unrelated_visual_observation_even_about_a_real_entity_cannot_imprint() {
    let mut state = world();
    state.pending_commands.push(CommandDTO {
        command_id: "test-unrelated-visual".into(),
        actor_id: "lorenz".into(),
        target_id: Some("gosling".into()),
        effects: vec![CommandEffect::SpawnObservation {
            schema_id: "it:concept/see-unrelated-rock".into(),
            modality: Modality::Visual,
            about: "it:entity/lorenz".into(),
            ttl: 100,
            strength: 1.0,
            target_character_id: Some("gosling".into()),
        }],
    });
    ticks(&mut state, 12);
    assert_unimprinted(&state);
}

#[test]
fn first_decoy_target_is_fixed_and_later_lorenz_contact_cannot_win() {
    let mut state = world();
    command(&mut state, "show-decoy");
    ticks(&mut state, 1);
    let evidence = motivation(&state)["imprinting_evidence"].clone();
    assert_eq!(
        motivation(&state)["target_entity"],
        "it:entity/mother-goose-decoy"
    );
    command(&mut state, "approach-gosling");
    ticks(&mut state, 1);
    command(&mut state, "move-away");
    ticks(&mut state, 12);
    assert_eq!(
        motivation(&state)["target_entity"],
        "it:entity/mother-goose-decoy"
    );
    assert_eq!(
        motivation(&state)["imprinting_evidence"]["imprinted_at"],
        evidence["imprinted_at"]
    );
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}

#[test]
fn actual_contact_spends_dopamine_binds_entity_and_following_closes_real_gap() {
    let mut state = world();
    let dopamine_before = state.characters["gosling"]
        .mind_graph
        .resource_value("it:concept/dopamine");
    command(&mut state, "approach-gosling");
    ticks(&mut state, 1);
    let dopamine_after = state.characters["gosling"]
        .mind_graph
        .resource_value("it:concept/dopamine");
    assert!(dopamine_before - dopamine_after >= 0.2 - 1e-12);
    let imprint = motivation(&state);
    assert_eq!(imprint["target_entity"], "it:entity/lorenz");
    assert_eq!(
        imprint["imprinting_evidence"]["target_entity"],
        "it:entity/lorenz"
    );
    assert!(
        (imprint["imprinting_evidence"]["dopamine_spent"]
            .as_f64()
            .unwrap()
            - 0.2)
            .abs()
            < 1e-12
    );
    assert!(state.characters["gosling"]
        .mind_graph
        .edges
        .keys()
        .any(|id| id.starts_with("imprint_")));
    assert_eq!(state.progress.status, LevelStatus::InProgress);
    let target_x = state.characters["lorenz"].position.x;
    command(&mut state, "move-away");
    ticks(&mut state, 1);
    assert!(
        state.characters["lorenz"].position.x < target_x,
        "target must really move"
    );
    let separated = gap(&state);
    let goose_x = state.characters["gosling"].position.x;
    ticks(&mut state, 12);
    let evidence = &motivation(&state)["imprinting_evidence"];
    assert!(gap(&state) < separated && gap(&state) <= 80.0);
    assert!(
        state.characters["gosling"].position.x < goose_x,
        "following must move actual entity"
    );
    assert!(evidence["followed_distance"].as_f64().unwrap() >= 80.0);
    assert!(evidence["follow_ticks"].as_u64().unwrap() >= 3);
    assert!(evidence["max_separation_distance"].as_f64().unwrap() >= 210.0);
    assert_eq!(state.progress.status, LevelStatus::Won);
}

#[test]
fn serialized_save_restore_preserves_fixed_target_evidence_positions_and_future_following() {
    let mut state = world();
    command(&mut state, "approach-gosling");
    ticks(&mut state, 1);
    command(&mut state, "move-away");
    ticks(&mut state, 1);
    let saved = serde_json::to_value(&state).unwrap();
    let mut restored: WorldState = serde_json::from_value(saved.clone()).unwrap();
    assert_eq!(serde_json::to_value(&restored).unwrap(), saved);
    assert_eq!(motivation(&restored), motivation(&state));
    let before = gap(&restored);
    ticks(&mut state, 12);
    ticks(&mut restored, 12);
    assert!(gap(&restored) < before);
    assert_eq!(restored.progress.status, LevelStatus::Won);
    assert_eq!(motivation(&restored), motivation(&state));
    assert_eq!(
        restored.characters["gosling"].position.x,
        state.characters["gosling"].position.x
    );
}
