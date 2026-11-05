use std::path::PathBuf;

use intention_tower_game_lib::command_rules::command_available;
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::CommandDTO;
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::runner::SimulationRunner;

fn load(id: &str) -> WorldState {
    load_level_from_path(
        &PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../assets/levels")
            .join(id),
    )
    .unwrap()
}

fn execute(world: &mut WorldState, command_id: &str, target: &str) -> Vec<WorldEvent> {
    execute_as(world, "ideologue", command_id, target)
}

fn execute_as(
    world: &mut WorldState,
    actor: &str,
    command_id: &str,
    target: &str,
) -> Vec<WorldEvent> {
    let command = world
        .command_defs
        .iter()
        .find(|c| c.command_id == command_id)
        .unwrap()
        .clone();
    world.pending_commands.push(CommandDTO {
        command_id: command_id.into(),
        actor_id: actor.into(),
        target_id: Some(target.into()),
        effects: command.effect_templates,
    });
    SimulationRunner::new().tick(world, 0.5)
}

fn faith_weight(world: &WorldState, character_id: &str) -> Option<f64> {
    binding_weight(
        world,
        character_id,
        "it:concept/ideology",
        "it:concept/struggle-action",
    )
}

fn binding_weight(
    world: &WorldState,
    character_id: &str,
    source: &str,
    target: &str,
) -> Option<f64> {
    let graph = &world.characters[character_id].mind_graph;
    graph
        .edges
        .values()
        .find(|edge| {
            graph
                .nodes
                .get(&edge.source_instance_id)
                .is_some_and(|node| node.schema_id == source)
                && graph
                    .nodes
                    .get(&edge.target_instance_id)
                    .is_some_and(|node| node.schema_id == target)
        })
        .map(|edge| edge.weight)
}

#[test]
fn gesture_teaching_creates_the_discipline_binding_for_each_student() {
    for target in ["tim", "student-a", "student-b"] {
        let mut world = load("the-wave");
        let weight = |world: &WorldState| {
            binding_weight(world, target, "it:concept/discipline", "it:concept/obey")
        };
        assert_eq!(weight(&world), None);
        let premature = execute_as(&mut world, "teacher-wenger", "enforce-discipline", target);
        assert!(
            premature.iter().any(|event| matches!(event,
            WorldEvent::CommandRejected { reason, .. } if reason == "no_effect_applied")),
            "{target}: {premature:?}"
        );
        assert!(!world
            .progress
            .command_counts
            .contains_key("enforce-discipline"));

        let taught = execute_as(&mut world, "teacher-wenger", "teach-gesture", target);
        assert!(taught.iter().any(|event| matches!(event,
            WorldEvent::CommandExecuted { command_id, .. } if command_id == "teach-gesture")));
        let obey_id = world.characters[target]
            .mind_graph
            .find_by_schema("it:concept/obey")
            .unwrap()
            .instance_id
            .clone();
        assert!(
            taught.iter().any(|event| matches!(event,
            WorldEvent::EdgeCreated { character_id, target_id, .. }
                if character_id == target && target_id == &obey_id)),
            "{target}: {taught:?}"
        );
        let before =
            weight(&world).expect("teaching integrates discipline with the existing action");
        let enforced = execute_as(&mut world, "teacher-wenger", "enforce-discipline", target);
        assert!(enforced.iter().any(|event| matches!(event,
            WorldEvent::CommandExecuted { command_id, .. } if command_id == "enforce-discipline")));
        assert!(weight(&world).unwrap() > before);
        assert_eq!(
            world.progress.command_counts.get("enforce-discipline"),
            Some(&1)
        );
        assert!(world.characters[target]
            .mind_graph
            .find_by_schema("it:concept/collective-power")
            .is_none());
    }
}

#[test]
fn skeptic_acquires_a_real_action_binding_before_faith_can_be_reinforced() {
    let mut world = load("ideology");
    let graph = &world.characters["skeptic"].mind_graph;
    assert!(graph.find_by_schema("it:concept/ideology").is_none());
    let action = graph.find_by_schema("it:concept/struggle-action").unwrap();
    assert!(!action.active);
    assert_eq!(action.value, 0.0);
    assert_eq!(action.action.as_ref().unwrap().proficiency_level, 0.2);
    assert_eq!(faith_weight(&world, "skeptic"), None);

    let premature = execute(&mut world, "reinforce-faith", "skeptic");
    assert!(premature.iter().any(|event| matches!(event,
        WorldEvent::CommandRejected { reason, .. } if reason == "no_effect_applied")));
    assert!(!world
        .progress
        .command_counts
        .contains_key("reinforce-faith"));
    assert_eq!(faith_weight(&world, "skeptic"), None);

    let preached = execute(&mut world, "preach", "skeptic");
    assert!(preached.iter().any(|event| matches!(event,
        WorldEvent::CommandExecuted { command_id, .. } if command_id == "preach")));
    assert!(preached.iter().any(|event| matches!(event,
        WorldEvent::EdgeCreated { character_id, target_id, .. }
            if character_id == "skeptic" && target_id == "skp-struggle-action")));
    let before = faith_weight(&world, "skeptic").expect("preaching integrates a real binding");
    let reinforced = execute(&mut world, "reinforce-faith", "skeptic");
    assert!(reinforced.iter().any(|event| matches!(event,
        WorldEvent::CommandExecuted { command_id, .. } if command_id == "reinforce-faith")));
    assert!(faith_weight(&world, "skeptic").unwrap() > before);
    assert!(
        !world
            .progress
            .objectives
            .iter()
            .find(|objective| objective.objective_id == "bind-faith-action")
            .unwrap()
            .completed
    );

    let believer_before = faith_weight(&world, "believer").unwrap();
    let believer = execute(&mut world, "reinforce-faith", "believer");
    assert!(believer
        .iter()
        .any(|event| matches!(event, WorldEvent::CommandExecuted { .. })));
    assert!(faith_weight(&world, "believer").unwrap() > believer_before);
    assert_eq!(
        world.progress.command_counts.get("reinforce-faith"),
        Some(&2)
    );
    assert_eq!(world.progress.command_targets["reinforce-faith"].len(), 2);
    assert!(
        world
            .progress
            .objectives
            .iter()
            .find(|objective| objective.objective_id == "bind-faith-action")
            .unwrap()
            .completed
    );
}

#[test]
fn ideology_commands_are_limited_to_the_authored_speaker_and_audience() {
    let world = load("ideology");
    for command in &world.command_defs {
        for target in ["believer", "skeptic"] {
            assert!(command_available(
                command,
                "ideologue",
                Some(target),
                &world
            ));
            assert!(!command_available(command, target, Some(target), &world));
        }
        assert!(!command_available(
            command,
            "ideologue",
            Some("ideologue"),
            &world
        ));
        assert!(!command_available(
            command,
            "ideologue",
            Some("outsider"),
            &world
        ));
        assert!(!command_available(command, "ideologue", None, &world));
    }
}

#[test]
fn repeated_saturated_faith_does_not_complete_two_person_objective() {
    let mut world = load("ideology");
    let first = execute(&mut world, "reinforce-faith", "believer");
    assert!(first
        .iter()
        .any(|event| matches!(event, WorldEvent::CommandExecuted { .. })));
    for _ in 0..3 {
        let events = execute(&mut world, "reinforce-faith", "believer");
        assert!(events.iter().any(|event| matches!(event,
            WorldEvent::CommandRejected { reason, .. } if reason == "no_effect_applied")));
        assert!(!events
            .iter()
            .any(|event| matches!(event, WorldEvent::CommandExecuted { .. })));
    }
    assert_eq!(
        world.progress.command_counts.get("reinforce-faith"),
        Some(&1)
    );
    assert_eq!(world.progress.command_targets["reinforce-faith"].len(), 1);
    assert!(
        !world
            .progress
            .objectives
            .iter()
            .find(|objective| objective.objective_id == "bind-faith-action")
            .unwrap()
            .completed
    );
}

#[test]
fn persuasion_only_targets_luddites_without_overconstraining_bci() {
    let world = load("destroy-hive-mind");
    let persuade = world
        .command_defs
        .iter()
        .find(|c| c.command_id == "persuade-luddite")
        .unwrap();
    for target in ["luddite-1", "luddite-2"] {
        assert!(command_available(
            persuade,
            "player-agent",
            Some(target),
            &world
        ));
        assert!(!command_available(persuade, target, Some(target), &world));
    }
    for target in ["player-agent", "hive-mind", "outsider"] {
        assert!(!command_available(
            persuade,
            "player-agent",
            Some(target),
            &world
        ));
    }
    let hack = world
        .command_defs
        .iter()
        .find(|c| c.command_id == "hack-bci")
        .unwrap();
    assert!(command_available(
        hack,
        "player-agent",
        Some("hive-mind"),
        &world
    ));
}
