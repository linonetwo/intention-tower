//! Observed demonstrations require later real reward; executed voluntary
//! actions earn operant credit. No command writes a fake cat button response.
use intention_tower_game_lib::command_rules::command_available;
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::CommandDTO;
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::mind_node::LearnType;
use intention_tower_game_lib::models::mind_node::{NodeType, ObservationData};
use intention_tower_game_lib::models::progress::LevelStatus;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::runner::SimulationRunner;
use std::path::Path;

fn world() -> WorldState {
    load_level_from_path(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/smart-cat"))
        .unwrap()
}
fn available(state: &WorldState, id: &str) -> bool {
    let def = state
        .command_defs
        .iter()
        .find(|def| def.command_id == id)
        .unwrap();
    command_available(def, "trainer", Some("cat-billi"), state)
}
fn command(state: &mut WorldState, id: &str) {
    assert!(available(state, id), "{id} must be genuinely available");
    let effects = state
        .command_defs
        .iter()
        .find(|def| def.command_id == id)
        .unwrap()
        .effect_templates
        .clone();
    state.pending_commands.push(CommandDTO {
        command_id: id.into(),
        actor_id: "trainer".into(),
        target_id: Some("cat-billi".into()),
        effects,
    });
}
fn ticks(state: &mut WorldState, count: usize) -> Vec<WorldEvent> {
    let runner = SimulationRunner::new();
    (0..count).flat_map(|_| runner.tick(state, 0.5)).collect()
}
fn pair(state: &mut WorldState) {
    command(state, "demonstrate-press");
    ticks(state, 1);
    command(state, "feed");
    // Reward presentation tick plus eleven ordinary ticks, matching the full
    // shipped route and its public-action cadence (not just first reward).
    ticks(state, 12);
}
fn learned_count(state: &WorldState) -> usize {
    state.characters["cat-billi"]
        .mind_graph
        .edges
        .values()
        .filter(|edge| edge.learnable)
        .count()
}

#[test]
fn unrewarded_demonstrations_never_create_learning_or_puppet_button_press() {
    let mut state = world();
    for _ in 0..10 {
        command(&mut state, "demonstrate-press");
        ticks(&mut state, 12);
        assert_eq!(learned_count(&state), 0);
        let action = &state.characters["cat-billi"].mind_graph.nodes["cat-press-button"];
        assert!(!action.active && !action.action.as_ref().unwrap().selected);
        assert_eq!(action.value, 0.0);
        assert!(!available(&state, "feed-after-press"));
    }
}

#[test]
fn food_alone_and_backward_food_then_demonstration_do_not_train_button_press() {
    let mut state = world();
    for _ in 0..8 {
        command(&mut state, "feed");
        ticks(&mut state, 1);
        command(&mut state, "demonstrate-press");
        ticks(&mut state, 12);
    }
    assert_eq!(learned_count(&state), 0);
    assert!(!available(&state, "feed-after-press"));
}

#[test]
fn demonstration_requires_actual_following_reward_and_builds_a_new_predictor() {
    let mut state = world();
    command(&mut state, "demonstrate-press");
    ticks(&mut state, 1);
    assert_eq!(learned_count(&state), 0);
    assert!(!state.characters["cat-billi"].mind_graph.nodes["cat-press-button"].active);
    command(&mut state, "feed");
    let events = ticks(&mut state, 1);
    let graph = &state.characters["cat-billi"].mind_graph;
    let edge = graph.edges.values().find(|edge| edge.learnable).unwrap();
    assert_eq!(edge.source_instance_id, "obs_it_concept_hear-button-sound");
    assert_eq!(edge.target_instance_id, "cat-press-button");
    assert!((edge.weight - 0.2).abs() < 1e-12);
    assert!(events.iter().any(|event| matches!(event, WorldEvent::LearningUpdated {
        phase, reward, dopamine_spent, .. } if phase == "created" && *reward > 0.0 && *dopamine_spent > 0.0)));
    assert!(
        graph
            .edges
            .values()
            .all(|edge| edge.learn_type != LearnType::Operant),
        "seeing another actor demonstrate is not executing our own action"
    );
}

#[test]
fn learned_cue_causes_a_real_selected_press_and_later_reward_creates_operant_credit() {
    let mut state = world();
    for _ in 0..3 {
        pair(&mut state);
    }
    assert!(
        !available(&state, "feed-after-press"),
        "expired cue must not leave a stuck fake press"
    );
    command(&mut state, "demonstrate-press");
    ticks(&mut state, 1);
    assert!(
        !available(&state, "feed-after-press"),
        "eligible value is not yet actual selection"
    );
    ticks(&mut state, 1);
    let action = &state.characters["cat-billi"].mind_graph.nodes["cat-press-button"];
    assert!(action.active && action.attended && action.action.as_ref().unwrap().selected);
    assert!(available(&state, "feed-after-press"));
    command(&mut state, "feed-after-press");
    let events = ticks(&mut state, 1);
    let graph = &state.characters["cat-billi"].mind_graph;
    assert!(graph
        .edges
        .values()
        .any(|edge| edge.learn_type == LearnType::Operant
            && edge.learnable
            && edge.target_instance_id == "cat-press-button"
            && edge.weight > 0.0));
    assert!(
        graph.nodes["cat-press-button"]
            .action
            .as_ref()
            .unwrap()
            .proficiency_level
            > 0.0
    );
    assert!(events.iter().any(
        |event| matches!(event, WorldEvent::LearningUpdated { edge_id, .. }
        if edge_id.starts_with("operant_"))
    ));
}

#[test]
fn an_eligible_but_unselected_action_cannot_unlock_contingent_food() {
    let mut state = world();
    let action = state
        .characters
        .get_mut("cat-billi")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("cat-press-button")
        .unwrap();
    action.value = 1.0;
    action.active = true;
    action.attended = true;
    action.action.as_mut().unwrap().selected = false;
    assert!(!available(&state, "feed-after-press"));
}

#[test]
fn attention_and_dopamine_are_required_for_rewarded_demonstration_learning() {
    for schema in ["it:concept/attention", "it:concept/dopamine"] {
        let mut state = world();
        let resource = state
            .characters
            .get_mut("cat-billi")
            .unwrap()
            .mind_graph
            .find_by_schema_mut(schema)
            .unwrap();
        resource.value = 0.0;
        resource.value_velocity = 0.0;
        for _ in 0..4 {
            pair(&mut state);
        }
        assert_eq!(learned_count(&state), 0, "no learning without {schema}");
    }
}

#[test]
fn unrewarded_real_presses_do_not_create_operant_credit() {
    let mut state = world();
    for _ in 0..3 {
        pair(&mut state);
    }
    command(&mut state, "demonstrate-press");
    ticks(&mut state, 3);
    assert!(
        state.characters["cat-billi"].mind_graph.nodes["cat-press-button"]
            .action
            .as_ref()
            .unwrap()
            .selected
    );
    ticks(&mut state, 9);
    assert!(state.characters["cat-billi"]
        .mind_graph
        .edges
        .values()
        .all(|edge| edge.learn_type != LearnType::Operant));
}

#[test]
fn selected_action_gate_is_typed_and_cannot_be_shadowed_or_satisfied_by_an_observation() {
    let mut state = world();
    let graph = &mut state.characters.get_mut("cat-billi").unwrap().mind_graph;
    let action = graph.nodes.get_mut("cat-press-button").unwrap();
    action.value = 0.4;
    action.active = true;
    action.attended = true;
    action.action.as_mut().unwrap().selected = true;
    let mut echo = action.clone();
    echo.instance_id = "obs_it_concept_press-button".into();
    echo.node_type = NodeType::Observation;
    echo.value = 1.0;
    echo.action = None;
    echo.observation = Some(ObservationData::default());
    graph.add_node(echo);
    assert!(
        available(&state, "feed-after-press"),
        "same-schema observation must not shadow the real selected action"
    );
    state
        .characters
        .get_mut("cat-billi")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("cat-press-button")
        .unwrap()
        .action
        .as_mut()
        .unwrap()
        .selected = false;
    assert!(
        !available(&state, "feed-after-press"),
        "active same-schema observation cannot impersonate an executed action"
    );
}

#[test]
fn full_three_contingent_reward_route_stays_valid_with_public_action_feedback() {
    let mut state = world();
    command(&mut state, "show-button");
    ticks(&mut state, 1);
    for _ in 0..3 {
        pair(&mut state);
    }
    assert_eq!(state.tick, 40);
    for trial in 1..=3 {
        command(&mut state, "demonstrate-press");
        ticks(&mut state, 2);
        let graph = &state.characters["cat-billi"].mind_graph;
        let action = &graph.nodes["cat-press-button"];
        assert!(
            action.active
                && action.attended
                && action.action.as_ref().unwrap().selected
                && action.value >= 0.3,
            "trial {trial} tick {}: actual press {:?}, attention {}",
            state.tick,
            action,
            graph.nodes["cat-attention"].value
        );
        assert!(
            available(&state, "feed-after-press"),
            "trial {trial} tick {}: typed selected action gate rejected actual execution",
            state.tick
        );
        if trial == 2 {
            // At tick45 the real action is visible as a same-schema public
            // observation. This was the shipped-route-only regression.
            assert_eq!(state.tick, 45);
            assert_eq!(
                graph.nodes["obs_it_concept_press-button"].node_type,
                NodeType::Observation
            );
        }
        command(&mut state, "feed-after-press");
        ticks(&mut state, 1);
        if trial < 3 {
            assert_eq!(state.progress.status, LevelStatus::InProgress);
        }
    }
    assert_eq!(state.progress.status, LevelStatus::Won);
    assert_eq!(state.progress.command_counts["feed-after-press"], 3);
    assert!(state.characters["cat-billi"]
        .mind_graph
        .edges
        .values()
        .any(|edge| edge.learnable && edge.learn_type == LearnType::Operant && edge.weight > 0.0));
}
