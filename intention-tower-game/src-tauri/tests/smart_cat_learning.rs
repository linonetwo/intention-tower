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

fn hungry_response(state: &mut WorldState) {
    for _ in 0..300 {
        let graph = &state.characters["cat-billi"].mind_graph;
        if graph.nodes["cat-hunger"].value >= 0.65
            && !graph.nodes["cat-press-button"]
                .action
                .as_ref()
                .unwrap()
                .selected
        {
            break;
        }
        ticks(state, 1);
    }
    let graph = &state.characters["cat-billi"].mind_graph;
    assert!(graph.nodes["cat-hunger"].value >= 0.65);
    assert!(
        !graph.nodes["cat-press-button"]
            .action
            .as_ref()
            .unwrap()
            .selected,
        "a response must reset before a new independently rewarded episode"
    );
    let before = graph.action_episodes.len();
    command(state, "demonstrate-press");
    for _ in 0..6 {
        ticks(state, 1);
        if state.characters["cat-billi"]
            .mind_graph
            .action_episodes
            .len()
            > before
        {
            break;
        }
    }
    assert_eq!(
        state.characters["cat-billi"]
            .mind_graph
            .action_episodes
            .len(),
        before + 1,
        "a demonstration must elicit exactly one new actual motor episode"
    );
    assert!(available(state, "feed-after-press"));
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
    let before: Vec<_> = state.characters["cat-billi"]
        .mind_graph
        .edges
        .values()
        .filter(|edge| edge.learn_type == LearnType::Operant)
        .map(|edge| {
            (
                edge.edge_id.clone(),
                edge.weight,
                edge.evidence.co_occurrence_count,
            )
        })
        .collect();
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
    let after = &state.characters["cat-billi"].mind_graph;
    assert_eq!(
        after
            .edges
            .values()
            .filter(|edge| edge.learn_type == LearnType::Operant)
            .count(),
        before.len()
    );
    for (id, weight, count) in before {
        assert_eq!(after.edges[&id].weight, weight);
        assert_eq!(after.edges[&id].evidence.co_occurrence_count, count);
    }
    assert!(after.action_episodes.last().unwrap().rewarded_at.is_none());
}

#[test]
fn executed_action_gate_cannot_be_shadowed_or_satisfied_by_selection_or_observation() {
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
        !available(&state, "feed-after-press"),
        "selected flags and same-schema observations cannot impersonate a completed motor episode"
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
fn executed_action_gate_requires_a_recent_unconsumed_episode_and_survives_restore() {
    let mut state = world();
    for _ in 0..3 {
        pair(&mut state);
    }
    ticks(&mut state, 100);
    command(&mut state, "demonstrate-press");
    ticks(&mut state, 3);
    assert!(available(&state, "feed-after-press"));
    let executed_at = state.characters["cat-billi"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap()
        .executed_at;
    // Execution remains rewardable even after the transient selection fades.
    let action = state
        .characters
        .get_mut("cat-billi")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("cat-press-button")
        .unwrap();
    action.value = 0.0;
    action.active = false;
    action.attended = false;
    action.action.as_mut().unwrap().selected = false;
    assert!(available(&state, "feed-after-press"));
    let saved = serde_json::to_value(&state).unwrap();
    let restored: WorldState = serde_json::from_value(saved.clone()).unwrap();
    assert_eq!(serde_json::to_value(&restored).unwrap(), saved);
    assert!(available(&restored, "feed-after-press"));

    let mut expired = restored.clone();
    expired.tick = executed_at + 10;
    assert!(!available(&expired, "feed-after-press"));
    let mut future = restored.clone();
    future
        .characters
        .get_mut("cat-billi")
        .unwrap()
        .mind_graph
        .action_episodes
        .last_mut()
        .unwrap()
        .executed_at = future.tick + 1;
    assert!(!available(&future, "feed-after-press"));
    let mut consumed = restored.clone();
    consumed
        .characters
        .get_mut("cat-billi")
        .unwrap()
        .mind_graph
        .action_episodes
        .last_mut()
        .unwrap()
        .reward_consumed_at = Some(consumed.tick);
    assert!(!available(&consumed, "feed-after-press"));
    let mut rewarded = restored;
    rewarded
        .characters
        .get_mut("cat-billi")
        .unwrap()
        .mind_graph
        .action_episodes
        .last_mut()
        .unwrap()
        .rewarded_at = Some(rewarded.tick);
    assert!(!available(&rewarded, "feed-after-press"));
}

#[test]
fn independent_contingent_rewards_consume_actual_hungry_motor_episodes_once() {
    let mut state = world();
    command(&mut state, "show-button");
    ticks(&mut state, 1);
    for _ in 0..3 {
        pair(&mut state);
    }
    for trial in 1..=2 {
        hungry_response(&mut state);
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
            "trial {trial} tick {}: executed action gate rejected actual execution",
            state.tick
        );
        assert!(graph
            .action_episodes
            .last()
            .is_some_and(|episode| !episode.autonomous && episode.rewarded_at.is_none()));
        command(&mut state, "feed-after-press");
        ticks(&mut state, 1);
        let episode = state.characters["cat-billi"]
            .mind_graph
            .action_episodes
            .last()
            .unwrap();
        assert!(episode.reward_consumed_at.is_some());
        assert!(episode.rewarded_at.is_some());
        assert!(episode.reinforcement_dopamine_spent > 0.0);
        assert!(
            !available(&state, "feed-after-press"),
            "one response cannot earn repeated food rewards"
        );
        ticks(&mut state, 12);
    }
    assert_eq!(
        state.progress.status,
        LevelStatus::InProgress,
        "two prompted rewards are not autonomous food seeking"
    );
    assert_eq!(state.progress.command_counts["feed-after-press"], 2);
    assert!(state.characters["cat-billi"]
        .mind_graph
        .edges
        .values()
        .any(|edge| edge.learnable && edge.learn_type == LearnType::Operant && edge.weight > 0.0));
}

fn autonomous(state: &WorldState) -> bool {
    state.characters["cat-billi"]
        .mind_graph
        .action_episodes
        .iter()
        .any(|episode| episode.autonomous)
}

fn train_to_autonomy(state: &mut WorldState) {
    for _ in 0..3 {
        pair(state);
    }
    for trial in 0..80 {
        for _ in 0..300 {
            let graph = &state.characters["cat-billi"].mind_graph;
            if autonomous(state) {
                return;
            }
            if graph.nodes["cat-hunger"].value >= 0.65
                && !graph.nodes["cat-press-button"]
                    .action
                    .as_ref()
                    .unwrap()
                    .selected
            {
                break;
            }
            ticks(state, 1);
        }
        if autonomous(state) {
            return;
        }
        let graph = &state.characters["cat-billi"].mind_graph;
        assert!(
            graph.nodes["cat-hunger"].value >= 0.65
                && !graph.nodes["cat-press-button"]
                    .action
                    .as_ref()
                    .unwrap()
                    .selected,
            "trial {trial}: hungry response failed to reset within 300 ticks"
        );
        let before = state.characters["cat-billi"]
            .mind_graph
            .action_episodes
            .len();
        command(state, "demonstrate-press");
        for _ in 0..6 {
            ticks(state, 1);
            if state.characters["cat-billi"]
                .mind_graph
                .action_episodes
                .len()
                > before
            {
                break;
            }
        }
        assert!(
            state.characters["cat-billi"]
                .mind_graph
                .action_episodes
                .len()
                > before,
            "trial {trial}: demonstration must elicit a NEW actual motor episode"
        );
        if state.progress.status == LevelStatus::Won {
            return;
        }
        command(state, "feed-after-press");
        ticks(state, 1);
        assert!(
            state.characters["cat-billi"]
                .mind_graph
                .action_episodes
                .last()
                .unwrap()
                .rewarded_at
                .is_some(),
            "trial {trial}: subsequent real food must credit the completed response"
        );
        assert!(
            state.characters["cat-billi"]
                .mind_graph
                .action_episodes
                .last()
                .unwrap()
                .reinforcement_dopamine_spent
                > 0.0
        );
        ticks(state, 12);
    }
    ticks(state, 300);
    assert!(
        autonomous(state),
        "80 real hungry-response/reward trials must yield unprompted food seeking"
    );
}

#[test]
fn hungry_cat_eventually_executes_an_unprompted_motor_episode_and_wins() {
    let mut state = world();
    train_to_autonomy(&mut state);
    let graph = &state.characters["cat-billi"].mind_graph;
    let episode = graph
        .action_episodes
        .iter()
        .find(|episode| episode.autonomous)
        .unwrap();
    assert_eq!(episode.action_id, "cat-press-button");
    assert!(episode
        .contexts
        .iter()
        .any(|context| context.schema_id == "it:concept/hunger" && context.value >= 0.6));
    assert!(graph
        .edges
        .values()
        .any(|edge| edge.learn_type == LearnType::Operant
            && edge.source_instance_id == "cat-hunger"
            && edge.target_instance_id == "cat-press-button"
            && edge.weight > 0.0
            && edge.evidence.co_occurrence_count > 0));
    assert_eq!(state.progress.status, LevelStatus::Won);
}

#[test]
fn food_without_dopamine_or_captured_context_cannot_count_as_reinforcement() {
    for empty_context in [false, true] {
        let mut state = world();
        for _ in 0..3 {
            pair(&mut state);
        }
        ticks(&mut state, 100);
        command(&mut state, "demonstrate-press");
        ticks(&mut state, 3);
        assert!(available(&state, "feed-after-press"));
        let graph = &mut state.characters.get_mut("cat-billi").unwrap().mind_graph;
        if empty_context {
            graph.action_episodes.last_mut().unwrap().contexts.clear();
        } else {
            let dopamine = graph.find_by_schema_mut("it:concept/dopamine").unwrap();
            dopamine.value = 0.0;
            dopamine.value_velocity = 0.0;
        }
        command(&mut state, "feed-after-press");
        ticks(&mut state, 1);
        let episode = state.characters["cat-billi"]
            .mind_graph
            .action_episodes
            .last()
            .unwrap();
        assert!(episode.reward_consumed_at.is_some());
        assert!(episode.rewarded_at.is_none());
        assert_eq!(episode.reinforcement_dopamine_spent, 0.0);
        assert!(
            !available(&state, "feed-after-press"),
            "even failed learning consumes this one reward opportunity"
        );
        assert_eq!(state.progress.status, LevelStatus::InProgress);
    }
}

#[test]
fn command_counts_or_forged_selected_flags_cannot_replace_real_motor_evidence() {
    let mut state = world();
    for _ in 0..100 {
        state
            .progress
            .record_command("feed-after-press", Some("cat-billi"));
    }
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
    action.action.as_mut().unwrap().selected = true;
    ticks(&mut state, 1);
    assert!(state.characters["cat-billi"]
        .mind_graph
        .action_episodes
        .is_empty());
    assert_eq!(state.progress.status, LevelStatus::InProgress);
}

#[test]
fn complete_snapshot_restore_preserves_motor_episodes_and_deterministic_future_learning() {
    let mut state = world();
    for _ in 0..3 {
        pair(&mut state);
    }
    ticks(&mut state, 100);
    command(&mut state, "demonstrate-press");
    ticks(&mut state, 3);
    assert!(!state.characters["cat-billi"]
        .mind_graph
        .action_episodes
        .is_empty());
    let saved = serde_json::to_value(&state).unwrap();
    let mut restored: WorldState = serde_json::from_value(saved.clone()).unwrap();
    assert_eq!(serde_json::to_value(&restored).unwrap(), saved);
    command(&mut state, "feed-after-press");
    command(&mut restored, "feed-after-press");
    ticks(&mut state, 1);
    ticks(&mut restored, 1);
    assert_eq!(
        serde_json::to_value(&restored.characters["cat-billi"].mind_graph.action_episodes).unwrap(),
        serde_json::to_value(&state.characters["cat-billi"].mind_graph.action_episodes).unwrap()
    );
    assert!(restored.characters["cat-billi"]
        .mind_graph
        .action_episodes
        .last()
        .unwrap()
        .rewarded_at
        .is_some());
    train_to_autonomy(&mut state);
    train_to_autonomy(&mut restored);
    assert_eq!(state.progress.status, restored.progress.status);
    assert_eq!(
        serde_json::to_value(&restored.characters["cat-billi"].mind_graph.action_episodes).unwrap(),
        serde_json::to_value(&state.characters["cat-billi"].mind_graph.action_episodes).unwrap()
    );
}
