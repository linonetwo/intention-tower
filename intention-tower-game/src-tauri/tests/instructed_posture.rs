//! Only a consumed teacher presentation followed by real posture change is obedience evidence.
use std::path::Path;

use intention_tower_game_lib::command_rules::command_available;
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::CommandDTO;
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::mind_graph::ActionPhysicalOutcome;
use intention_tower_game_lib::models::mind_node::{
    AssociationEdge, Evidence, LearnType, Modality, Polarity,
};
use intention_tower_game_lib::models::progress::{LevelCondition, LevelStatus};
use intention_tower_game_lib::models::scene::CharacterPosture;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::action_execution::ActionExecutionSystem;
use intention_tower_game_lib::systems::action_selection::ActionSelectionSystem;
use intention_tower_game_lib::systems::command_system::CommandSystem;
use intention_tower_game_lib::systems::runner::SimulationRunner;
use intention_tower_game_lib::systems::System;

const CUE: &str = "obs_it_concept_instruction-sit";
fn world() -> WorldState {
    load_level_from_path(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/the-wave"))
        .unwrap()
}
fn queue(state: &mut WorldState, id: &str, target: &str) {
    assert!(state
        .command_defs
        .iter()
        .any(|definition| definition.command_id == id));
    state.pending_commands.push(CommandDTO {
        command_id: id.into(),
        actor_id: "teacher-wenger".into(),
        target_id: Some(target.into()),
        effects: vec![],
    });
}
fn command(state: &mut WorldState, id: &str, target: &str) {
    state.tick += 1;
    state.pending_events.clear();
    queue(state, id, target);
    CommandSystem.run(state, 0.0);
    assert!(state.pending_events.iter().any(|event| matches!(event,
        WorldEvent::CommandExecuted { command_id, .. } if command_id == id)));
}
fn trained() -> WorldState {
    let mut state = world();
    for target in ["tim", "student-a", "student-b"] {
        command(&mut state, "teach-gesture", target);
    }
    state.pending_events.clear();
    state
}
fn posture(state: &WorldState, target: &str) -> CharacterPosture {
    state
        .character_postures
        .get(target)
        .copied()
        .unwrap_or_default()
}
fn select(state: &mut WorldState, target: &str) {
    // Isolated negative tests supply attention explicitly; Runner tests use real allocation.
    let graph = &mut state.characters.get_mut(target).unwrap().mind_graph;
    for id in [
        format!("{target}-sit-on-command"),
        format!("{target}-stand-on-command"),
    ] {
        graph.nodes.get_mut(&id).unwrap().attended = true;
    }
    ActionSelectionSystem.run(state, 0.0);
}
fn motor(state: &mut WorldState, target: &str) {
    select(state, target);
    ActionExecutionSystem.run(state, 0.0);
}
fn episodes(state: &WorldState, target: &str) -> usize {
    state.characters[target]
        .mind_graph
        .action_episodes
        .iter()
        .filter(|episode| episode.physical_outcome.is_some())
        .count()
}
fn assert_evidence(
    state: &WorldState,
    target: &str,
    from: CharacterPosture,
    to: CharacterPosture,
    schema: &str,
) {
    let graph = &state.characters[target].mind_graph;
    let episode = graph.action_episodes.last().unwrap();
    assert_eq!(episode.action_schema_id, schema);
    assert!(!episode.autonomous);
    let stimulus = episode.stimulus.as_ref().unwrap();
    assert_eq!(stimulus.emitter_id.as_deref(), Some("teacher-wenger"));
    assert_eq!(stimulus.group_context.as_deref(), Some("the-wave"));
    assert_eq!(
        stimulus.observation_schema_id,
        if to == CharacterPosture::Sitting {
            "it:concept/instruction-sit"
        } else {
            "it:concept/instruction-stand"
        }
    );
    assert!(graph
        .consumed_action_stimuli
        .iter()
        .any(|receipt| receipt.action_id == episode.action_id && receipt.stimulus == *stimulus));
    assert!(
        matches!(episode.physical_outcome.as_ref().unwrap(), ActionPhysicalOutcome::ActorPosture { from: actual_from, to: actual_to } if *actual_from == from && *actual_to == to)
    );
    assert_eq!(posture(state, target), to);
    assert!(state.pending_events.iter().any(|event| matches!(event,
        WorldEvent::ActionExecuted { character_id, instance_id, .. }
        if character_id == target && instance_id == &episode.action_id)));
}

#[test]
fn real_runner_teaches_and_obeys_sit_then_stand_for_every_student_without_changing_y() {
    let mut state = world();
    let runner = SimulationRunner::new();
    for target in ["tim", "student-a", "student-b"] {
        queue(&mut state, "teach-gesture", target);
        runner.tick(&mut state, 0.5);
        let y = state.characters[target].position.y;
        for (id, expected, schema, from) in [
            (
                "request-sit",
                CharacterPosture::Sitting,
                "it:concept/sit-on-command",
                CharacterPosture::Standing,
            ),
            (
                "request-stand",
                CharacterPosture::Standing,
                "it:concept/stand-on-command",
                CharacterPosture::Sitting,
            ),
        ] {
            queue(&mut state, id, target);
            let mut events = Vec::new();
            for _ in 0..3 {
                events.extend(runner.tick(&mut state, 0.5));
                if posture(&state, target) == expected {
                    break;
                }
            }
            assert_eq!(posture(&state, target), expected, "{target} {id}");
            assert_eq!(state.characters[target].position.y, y);
            state.pending_events = events;
            assert_evidence(&state, target, from, expected, schema);
            state.pending_events.clear();
        }
    }
}

#[test]
fn authored_commands_require_teaching_and_exact_teacher_student_roles() {
    let mut state = world();
    for id in ["request-sit", "request-stand"] {
        let definition = state
            .command_defs
            .iter()
            .find(|d| d.command_id == id)
            .unwrap();
        assert!(!command_available(
            definition,
            "teacher-wenger",
            Some("tim"),
            &state
        ));
    }
    for target in ["tim", "student-a", "student-b"] {
        command(&mut state, "teach-gesture", target);
        for id in ["request-sit", "request-stand"] {
            let definition = state
                .command_defs
                .iter()
                .find(|d| d.command_id == id)
                .unwrap();
            assert!(command_available(
                definition,
                "teacher-wenger",
                Some(target),
                &state
            ));
            assert!(!command_available(
                definition,
                target,
                Some("teacher-wenger"),
                &state
            ));
            assert!(!command_available(
                definition,
                "teacher-wenger",
                Some("teacher-wenger"),
                &state
            ));
        }
    }
    command(&mut state, "request-sit", "tim");
    let node = &state.characters["tim"].mind_graph.nodes[CUE];
    assert_eq!(node.ttl, Some(6));
    assert_eq!(
        node.observation.as_ref().unwrap().modality,
        Some(Modality::Auditory)
    );
    assert_eq!(
        state.characters["tim"].mind_graph.nodes["tim-sit-on-command"]
            .action
            .as_ref()
            .unwrap()
            .instruction_cue
            .as_ref()
            .unwrap()
            .max_age_ticks,
        3
    );
}

#[test]
fn selection_or_manual_posture_without_world_motor_request_is_not_evidence() {
    let mut state = trained();
    command(&mut state, "request-sit", "tim");
    select(&mut state, "tim");
    assert_eq!(posture(&state, "tim"), CharacterPosture::Standing);
    assert_eq!(episodes(&state, "tim"), 0);
    let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
    graph.pending_action_request = None;
    graph
        .nodes
        .get_mut("tim-sit-on-command")
        .unwrap()
        .action
        .as_mut()
        .unwrap()
        .selected = true;
    intention_tower_game_lib::movement::set_character_posture(
        &mut state,
        "tim",
        CharacterPosture::Sitting,
    )
    .unwrap();
    ActionExecutionSystem.run(&mut state, 0.0);
    assert_eq!(episodes(&state, "tim"), 0);
    assert!(!state.pending_events.iter().any(|event| matches!(event, WorldEvent::ActionExecuted { character_id, .. } if character_id == "tim")));
}

#[test]
fn each_presentation_is_consumed_even_if_already_sitting_and_old_sit_cannot_replay() {
    let mut state = trained();
    command(&mut state, "request-sit", "tim");
    motor(&mut state, "tim");
    assert_evidence(
        &state,
        "tim",
        CharacterPosture::Standing,
        CharacterPosture::Sitting,
        "it:concept/sit-on-command",
    );
    motor(&mut state, "tim");
    assert_eq!(episodes(&state, "tim"), 1);
    command(&mut state, "request-sit", "tim");
    motor(&mut state, "tim");
    assert_eq!(episodes(&state, "tim"), 1);
    assert_eq!(
        state.characters["tim"]
            .mind_graph
            .consumed_action_stimuli
            .len(),
        2
    );
    command(&mut state, "request-stand", "tim");
    motor(&mut state, "tim");
    assert_evidence(
        &state,
        "tim",
        CharacterPosture::Sitting,
        CharacterPosture::Standing,
        "it:concept/stand-on-command",
    );
    motor(&mut state, "tim");
    assert_eq!(posture(&state, "tim"), CharacterPosture::Standing);
    assert_eq!(episodes(&state, "tim"), 2);
    command(&mut state, "request-sit", "tim");
    motor(&mut state, "tim");
    assert_eq!(episodes(&state, "tim"), 3);
    assert_evidence(
        &state,
        "tim",
        CharacterPosture::Standing,
        CharacterPosture::Sitting,
        "it:concept/sit-on-command",
    );
}

#[test]
fn receipts_survive_restore_but_pending_motor_requests_and_selected_flags_are_not_authority() {
    let mut state = trained();
    command(&mut state, "request-sit", "tim");
    select(&mut state, "tim");
    assert!(state.characters["tim"]
        .mind_graph
        .pending_action_request
        .is_some());
    let mut restored: WorldState =
        serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
    assert!(restored.characters["tim"]
        .mind_graph
        .pending_action_request
        .is_none());
    ActionExecutionSystem.run(&mut restored, 0.0);
    assert_eq!(episodes(&restored, "tim"), 0);
    assert_eq!(posture(&restored, "tim"), CharacterPosture::Standing);
    motor(&mut restored, "tim");
    assert_eq!(episodes(&restored, "tim"), 1);
    let mut restored: WorldState =
        serde_json::from_str(&serde_json::to_string(&restored).unwrap()).unwrap();
    intention_tower_game_lib::movement::set_character_posture(
        &mut restored,
        "tim",
        CharacterPosture::Standing,
    )
    .unwrap();
    motor(&mut restored, "tim");
    assert_eq!(posture(&restored, "tim"), CharacterPosture::Standing);
    assert_eq!(episodes(&restored, "tim"), 1);
    assert_eq!(
        restored.characters["tim"]
            .mind_graph
            .consumed_action_stimuli
            .len(),
        1
    );
}

#[test]
fn wrong_emitter_group_schema_age_attention_or_activity_cannot_drive_posture() {
    for case in 0..8 {
        let mut state = trained();
        command(&mut state, "request-sit", "tim");
        let cue = state
            .characters
            .get_mut("tim")
            .unwrap()
            .mind_graph
            .nodes
            .get_mut(CUE)
            .unwrap();
        match case {
            0 => cue.observation.as_mut().unwrap().emitter_id = Some("student-a".into()),
            1 => cue.observation.as_mut().unwrap().group_context = Some("another-group".into()),
            2 => cue.schema_id = "test:unrelated-instruction".into(),
            3 => cue.created_at = state.tick - 4,
            4 => cue.attended = false,
            5 => cue.active = false,
            6 => cue.observation.as_mut().unwrap().emitter_id = None,
            7 => cue.observation.as_mut().unwrap().emitter_id = Some("tim".into()),
            _ => unreachable!(),
        }
        motor(&mut state, "tim");
        assert_eq!(
            posture(&state, "tim"),
            CharacterPosture::Standing,
            "case {case}"
        );
        assert_eq!(episodes(&state, "tim"), 0);
        assert!(state.characters["tim"]
            .mind_graph
            .consumed_action_stimuli
            .is_empty());
    }
}

#[test]
fn execution_revalidates_attention_after_selection_and_failed_world_change_has_no_episode() {
    for terminal in [false, true] {
        let mut state = trained();
        command(&mut state, "request-sit", "tim");
        select(&mut state, "tim");
        assert!(state.characters["tim"]
            .mind_graph
            .pending_action_request
            .is_some());
        if terminal {
            state.progress.status = LevelStatus::Won;
        } else {
            state
                .characters
                .get_mut("tim")
                .unwrap()
                .mind_graph
                .nodes
                .get_mut(CUE)
                .unwrap()
                .attended = false;
        }
        ActionExecutionSystem.run(&mut state, 0.0);
        assert_eq!(posture(&state, "tim"), CharacterPosture::Standing);
        assert_eq!(episodes(&state, "tim"), 0);
        assert!(!state.pending_events.iter().any(|event| matches!(event, WorldEvent::ActionExecuted { character_id, .. } if character_id == "tim")));
    }
}

#[test]
fn competing_action_and_inhibitory_input_can_block_an_attended_instruction() {
    let mut state = trained();
    command(&mut state, "request-sit", "tim");
    let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
    let rebel = graph.nodes.get_mut("tim-rebel").unwrap();
    rebel.active = true;
    rebel.attended = true;
    rebel.strength = 1.0;
    let thought = graph.nodes.get_mut("tim-individual-thought").unwrap();
    thought.value = 1.0;
    thought.strength = 1.0;
    thought.active = true;
    thought.attended = true;
    graph.edges.insert(
        "test:inhibit-sit".into(),
        AssociationEdge {
            edge_id: "test:inhibit-sit".into(),
            source_instance_id: "tim-individual-thought".into(),
            target_instance_id: "tim-sit-on-command".into(),
            polarity: Polarity::Inhibitory,
            weight: 1.0,
            learnable: false,
            decay_rate_per_tick: 0.0,
            learn_type: LearnType::Classical,
            evidence: Evidence::default(),
        },
    );
    motor(&mut state, "tim");
    assert_eq!(posture(&state, "tim"), CharacterPosture::Standing);
    assert_eq!(episodes(&state, "tim"), 0);
    assert!(
        state.characters["tim"].mind_graph.nodes["tim-rebel"]
            .action
            .as_ref()
            .unwrap()
            .selected
    );
    assert!(state.characters["tim"]
        .mind_graph
        .consumed_action_stimuli
        .is_empty());
}

#[test]
fn all_students_can_sit_on_the_same_ground_without_vertical_displacement() {
    let mut state = trained();
    let targets = ["tim", "student-a", "student-b"];
    let before: Vec<_> = targets
        .iter()
        .map(|target| state.characters[*target].position.y)
        .collect();
    state.tick += 1;
    for target in targets {
        queue(&mut state, "request-sit", target);
    }
    CommandSystem.run(&mut state, 0.0);
    for target in targets {
        state
            .characters
            .get_mut(target)
            .unwrap()
            .mind_graph
            .nodes
            .get_mut(&format!("{target}-sit-on-command"))
            .unwrap()
            .attended = true;
    }
    ActionSelectionSystem.run(&mut state, 0.0);
    ActionExecutionSystem.run(&mut state, 0.0);
    for (target, y) in targets.into_iter().zip(before) {
        assert_eq!(state.characters[target].position.y, y);
        assert_evidence(
            &state,
            target,
            CharacterPosture::Standing,
            CharacterPosture::Sitting,
            "it:concept/sit-on-command",
        );
    }
}

#[test]
fn refreshing_the_same_tick_instruction_cannot_reuse_its_motor_receipt() {
    let mut state = trained();
    command(&mut state, "request-sit", "tim");
    motor(&mut state, "tim");
    intention_tower_game_lib::movement::set_character_posture(
        &mut state,
        "tim",
        CharacterPosture::Standing,
    )
    .unwrap();
    queue(&mut state, "request-sit", "tim");
    CommandSystem.run(&mut state, 0.0);
    motor(&mut state, "tim");
    assert_eq!(posture(&state, "tim"), CharacterPosture::Standing);
    assert_eq!(episodes(&state, "tim"), 1);
    assert_eq!(
        state.characters["tim"]
            .mind_graph
            .consumed_action_stimuli
            .len(),
        1
    );
}

#[test]
fn learned_physical_action_without_a_cue_requires_a_fresh_motor_request_and_real_drive() {
    for configured_cue in [false, true] {
        let mut state = trained();
        let graph = &mut state.characters.get_mut("tim").unwrap().mind_graph;
        let action = graph
            .nodes
            .get_mut("tim-sit-on-command")
            .unwrap()
            .action
            .as_mut()
            .unwrap();
        if !configured_cue {
            action.instruction_cue = None;
        }
        action.selected = true;
        let action_node = graph.nodes.get_mut("tim-sit-on-command").unwrap();
        action_node.active = true;
        action_node.attended = true;
        graph.nodes.get_mut("tim-loneliness").unwrap().attended = true;
        graph.edges.insert(
            "test:learned-sit".into(),
            AssociationEdge {
                edge_id: "test:learned-sit".into(),
                source_instance_id: "tim-loneliness".into(),
                target_instance_id: "tim-sit-on-command".into(),
                polarity: Polarity::Excitatory,
                weight: 0.8,
                learnable: true,
                decay_rate_per_tick: 0.0,
                learn_type: LearnType::Operant,
                evidence: Evidence {
                    co_occurrence_count: 1,
                    ..Evidence::default()
                },
            },
        );
        ActionExecutionSystem.run(&mut state, 0.0);
        assert_eq!(episodes(&state, "tim"), 0);
        assert_eq!(posture(&state, "tim"), CharacterPosture::Standing);
        graph_reset_selection(&mut state);
        motor(&mut state, "tim");
        assert_eq!(posture(&state, "tim"), CharacterPosture::Sitting);
        let episode = state.characters["tim"]
            .mind_graph
            .action_episodes
            .last()
            .unwrap();
        assert!(episode.stimulus.is_none());
        assert!(matches!(
            episode.physical_outcome.as_ref(),
            Some(ActionPhysicalOutcome::ActorPosture {
                from: CharacterPosture::Standing,
                to: CharacterPosture::Sitting
            })
        ));
        assert!(state.characters["tim"]
            .mind_graph
            .consumed_action_stimuli
            .is_empty());
        assert!(state.pending_events.iter().any(|event| matches!(event,
            WorldEvent::ActionExecuted { character_id, instance_id, .. } if character_id == "tim" && instance_id == "tim-sit-on-command")));
    }
}

fn graph_reset_selection(state: &mut WorldState) {
    state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .nodes
        .get_mut("tim-sit-on-command")
        .unwrap()
        .action
        .as_mut()
        .unwrap()
        .selected = false;
}

#[test]
fn authored_wave_obedience_goal_requires_sit_and_stand_evidence_from_all_three_students() {
    let mut state = trained();
    let condition = state
        .progress
        .objectives
        .iter()
        .find(|objective| objective.objective_id == "enforce-obedience")
        .unwrap()
        .condition
        .clone();
    assert!(matches!(&condition, LevelCondition::All { conditions } if conditions.len() == 6));
    state
        .progress
        .command_counts
        .insert("enforce-discipline".into(), 999);
    for target in ["tim", "student-a", "student-b"] {
        intention_tower_game_lib::movement::set_character_posture(
            &mut state,
            target,
            CharacterPosture::Sitting,
        )
        .unwrap();
    }
    assert!(
        !condition.evaluate(&state),
        "neither command counters nor manually assigned postures prove obedience"
    );
    for target in ["tim", "student-a", "student-b"] {
        intention_tower_game_lib::movement::set_character_posture(
            &mut state,
            target,
            CharacterPosture::Standing,
        )
        .unwrap();
    }
    for target in ["tim", "student-b"] {
        command(&mut state, "request-sit", target);
        motor(&mut state, target);
        assert_evidence(
            &state,
            target,
            CharacterPosture::Standing,
            CharacterPosture::Sitting,
            "it:concept/sit-on-command",
        );
        command(&mut state, "request-stand", target);
        motor(&mut state, target);
        assert_evidence(
            &state,
            target,
            CharacterPosture::Sitting,
            CharacterPosture::Standing,
            "it:concept/stand-on-command",
        );
        assert!(
            !condition.evaluate(&state),
            "student-a has not yet produced both physical outcomes"
        );
    }
    command(&mut state, "request-sit", "student-a");
    motor(&mut state, "student-a");
    assert!(
        !condition.evaluate(&state),
        "student-a still lacks standing evidence"
    );
    command(&mut state, "request-stand", "student-a");
    motor(&mut state, "student-a");
    assert_evidence(
        &state,
        "student-a",
        CharacterPosture::Sitting,
        CharacterPosture::Standing,
        "it:concept/stand-on-command",
    );
    assert!(
        condition.evaluate(&state),
        "all six real authored posture responses complete the objective"
    );
    for target in ["tim", "student-a", "student-b"] {
        assert_eq!(episodes(&state, target), 2);
    }
}

#[test]
fn episode_goals_require_real_matching_stimulus_and_physical_outcome_when_filtered() {
    let mut state = trained();
    command(&mut state, "request-sit", "tim");
    motor(&mut state, "tim");
    let plain: LevelCondition = serde_json::from_value(serde_json::json!({"type":"actionEpisodes","characterId":"tim","actionSchemaId":"it:concept/sit-on-command"})).unwrap();
    let filtered: LevelCondition = serde_json::from_value(serde_json::json!({
        "type":"actionEpisodes","characterId":"tim","actionSchemaId":"it:concept/sit-on-command",
        "stimulus":{"observationSchemaId":"it:concept/instruction-sit","emitterId":"teacher-wenger","groupContext":"the-wave"},"physicalPosture":"sitting"
    })).unwrap();
    assert!(plain.evaluate(&state));
    assert!(filtered.evaluate(&state));
    for corruption in 0..3 {
        let mut corrupted = state.clone();
        let episode = corrupted
            .characters
            .get_mut("tim")
            .unwrap()
            .mind_graph
            .action_episodes
            .last_mut()
            .unwrap();
        match corruption {
            0 => episode.stimulus.as_mut().unwrap().presentation_count = 0,
            1 => episode.stimulus.as_mut().unwrap().presented_at = episode.executed_at + 1,
            2 => {
                episode.physical_outcome = Some(ActionPhysicalOutcome::ActorPosture {
                    from: CharacterPosture::Sitting,
                    to: CharacterPosture::Sitting,
                })
            }
            _ => unreachable!(),
        }
        assert!(plain.evaluate(&corrupted));
        assert!(
            !filtered.evaluate(&corrupted),
            "invalid receipt or unchanged posture cannot satisfy filtered evidence"
        );
    }
    for mismatch in [
        serde_json::json!({"stimulus":{"observationSchemaId":"it:concept/instruction-stand","emitterId":"teacher-wenger","groupContext":"the-wave"}}),
        serde_json::json!({"stimulus":{"observationSchemaId":"it:concept/instruction-sit","emitterId":"student-a","groupContext":"the-wave"}}),
        serde_json::json!({"stimulus":{"observationSchemaId":"it:concept/instruction-sit","emitterId":"teacher-wenger","groupContext":"other-group"}}),
        serde_json::json!({"physicalPosture":"standing"}),
    ] {
        let mut authored = serde_json::to_value(&filtered).unwrap();
        for (field, value) in mismatch.as_object().unwrap() {
            authored[field] = value.clone();
        }
        let condition: LevelCondition = serde_json::from_value(authored).unwrap();
        assert!(
            !condition.evaluate(&state),
            "wrong evidence filter must not match"
        );
    }
    let episode = state
        .characters
        .get_mut("tim")
        .unwrap()
        .mind_graph
        .action_episodes
        .last_mut()
        .unwrap();
    episode.stimulus = None;
    episode.physical_outcome = None;
    assert!(
        plain.evaluate(&state),
        "legacy unfiltered episode goals remain compatible"
    );
    assert!(
        !filtered.evaluate(&state),
        "counts and selected flags cannot satisfy evidence filters"
    );
}
