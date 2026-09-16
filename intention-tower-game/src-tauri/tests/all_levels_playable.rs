use std::path::{Path, PathBuf};

use intention_tower_game_lib::command_rules::command_available;
use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::{CommandDTO, TargetingMode};
use intention_tower_game_lib::models::progress::LevelStatus;
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::runner::SimulationRunner;

fn levels_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has an app parent")
        .join("assets/levels")
}

fn act(
    world: &mut WorldState,
    runner: &SimulationRunner,
    actor: &str,
    target: Option<&str>,
    command_id: &str,
    times: usize,
) {
    for _ in 0..times {
        assert_eq!(
            world.progress.status,
            LevelStatus::InProgress,
            "level {} became terminal before action {}",
            world.level_id,
            command_id
        );
        let command = world
            .command_defs
            .iter()
            .find(|command| command.command_id == command_id)
            .unwrap_or_else(|| panic!("{}: missing command {}", world.level_id, command_id))
            .clone();
        assert!(
            command_available(&command, actor, target, world),
            "{}: command {} unavailable for actor={} target={:?}",
            world.level_id,
            command_id,
            actor,
            target
        );

        let effective_target = match command.targeting {
            TargetingMode::NoTarget => None,
            TargetingMode::RequiresTarget | TargetingMode::OptionalTarget => {
                target.map(str::to_owned)
            }
        };
        world.pending_commands.push(CommandDTO {
            command_id: command_id.to_owned(),
            actor_id: actor.to_owned(),
            target_id: effective_target,
            effects: command.effect_templates,
        });
        let _events = runner.tick(world, 0.5);
    }
}

fn play_scenario(level_id: &str, world: &mut WorldState, runner: &SimulationRunner) {
    match level_id {
        "antimeme-division" => {
            act(world, runner, "antimeme-agent", None, "take-memory-drug", 1);
            act(
                world,
                runner,
                "antimeme-agent",
                None,
                "remember-this-place",
                2,
            );
            act(
                world,
                runner,
                "antimeme-agent",
                Some("bystander"),
                "ask-bystander",
                1,
            );
        }
        "chen-sheng-uprising" => {
            for target in ["soldier-1", "soldier-2", "soldier-3"] {
                act(
                    world,
                    runner,
                    "chen-sheng",
                    Some(target),
                    "announce-situation",
                    1,
                );
                act(world, runner, "chen-sheng", Some(target), "inspire-hope", 1);
                act(world, runner, "chen-sheng", Some(target), "rally-troops", 1);
            }
            act(
                world,
                runner,
                "chen-sheng",
                Some("soldier-1"),
                "plant-prophecy",
                1,
            );
        }
        "collapse" => {
            act(
                world,
                runner,
                "student-worker",
                Some("student-worker"),
                "deliver-bad-news",
                2,
            );
            act(
                world,
                runner,
                "student-worker",
                Some("student-worker"),
                "add-pressure",
                1,
            );
            act(
                world,
                runner,
                "student-worker",
                Some("student-worker"),
                "encourage-intrinsic",
                2,
            );
        }
        "consumerism-magic" => {
            for target in ["citizen-1", "citizen-2", "citizen-3"] {
                act(
                    world,
                    runner,
                    "magic-merchant",
                    Some(target),
                    "cast-magic-ad",
                    1,
                );
                act(
                    world,
                    runner,
                    "magic-merchant",
                    Some(target),
                    "enhance-brand",
                    1,
                );
                act(
                    world,
                    runner,
                    "magic-merchant",
                    Some(target),
                    "set-up-shop",
                    1,
                );
            }
        }
        "crowd" => {
            for target in [
                "citizen-1",
                "citizen-2",
                "citizen-3",
                "citizen-4",
                "citizen-5",
            ] {
                act(
                    world,
                    runner,
                    "player-capitalist",
                    Some(target),
                    "place-billboard",
                    1,
                );
                act(
                    world,
                    runner,
                    "player-capitalist",
                    Some(target),
                    "set-price",
                    1,
                );
            }
            act(
                world,
                runner,
                "player-capitalist",
                Some("citizen-1"),
                "craft-ad-meme",
                1,
            );
        }
        "cthulhu" => {
            act(
                world,
                runner,
                "investigator",
                Some("investigator"),
                "read-necronomicon",
                1,
            );
            act(world, runner, "investigator", None, "close-book", 1);
            act(
                world,
                runner,
                "investigator",
                Some("victim"),
                "investigate-victim",
                1,
            );
        }
        "cyber-dream" => {
            act(world, runner, "player", None, "enter-vr", 1);
            act(world, runner, "player", None, "compare-layers", 1);
            act(world, runner, "player", None, "examine-reality", 1);
            act(world, runner, "player", None, "exit-vr", 1);
        }
        "destroy-hive-mind" => {
            act(world, runner, "player-agent", None, "defend-station", 2);
            for target in ["luddite-1", "luddite-2"] {
                act(
                    world,
                    runner,
                    "player-agent",
                    Some(target),
                    "pheromone-attack",
                    1,
                );
            }
            act(
                world,
                runner,
                "player-agent",
                Some("hive-mind"),
                "hack-bci",
                1,
            );
            for target in ["luddite-1", "luddite-2"] {
                act(
                    world,
                    runner,
                    "player-agent",
                    Some(target),
                    "persuade-luddite",
                    2,
                );
            }
        }
        "face-saving" => {
            for command in [
                "humiliate",
                "offer-respect",
                "threaten-life",
                "praise-loyalty",
            ] {
                act(world, runner, "king", Some("minister"), command, 1);
            }
        }
        "gosling" => {
            act(
                world,
                runner,
                "lorenz",
                Some("gosling"),
                "approach-gosling",
                3,
            );
            act(world, runner, "lorenz", Some("gosling"), "make-sound", 2);
            act(world, runner, "lorenz", Some("gosling"), "move-away", 1);
        }
        "hive-self" => {
            for target in ["clone-a", "clone-b", "clone-c"] {
                act(
                    world,
                    runner,
                    "clone-a",
                    Some(target),
                    "reduce-resources",
                    1,
                );
            }
            for target in ["clone-b", "clone-c"] {
                act(world, runner, "clone-a", Some(target), "inject-distrust", 1);
                act(
                    world,
                    runner,
                    "clone-a",
                    Some(target),
                    "reinforce-protocol",
                    1,
                );
            }
        }
        "ideology" => {
            for target in ["believer", "skeptic"] {
                act(world, runner, "ideologue", Some(target), "preach", 1);
            }
            act(
                world,
                runner,
                "ideologue",
                Some("believer"),
                "reinforce-faith",
                2,
            );
            act(
                world,
                runner,
                "ideologue",
                Some("believer"),
                "challenge-belief",
                1,
            );
            act(
                world,
                runner,
                "ideologue",
                Some("believer"),
                "show-evidence",
                2,
            );
        }
        "illusion-trap" => {
            act(
                world,
                runner,
                "illusionist",
                Some("trapped-person"),
                "inflict-real-pain",
                2,
            );
            act(
                world,
                runner,
                "illusionist",
                Some("trapped-person"),
                "trigger-memory-fragment",
                3,
            );
            act(
                world,
                runner,
                "illusionist",
                Some("trapped-person"),
                "call-name",
                1,
            );
            act(
                world,
                runner,
                "illusionist",
                Some("trapped-person"),
                "shake-illusion",
                2,
            );
        }
        "internet-addict" => {
            act(
                world,
                runner,
                "addict-teen",
                Some("addict-teen"),
                "show-real-world",
                2,
            );
            act(
                world,
                runner,
                "addict-teen",
                Some("addict-teen"),
                "cut-game-connection",
                2,
            );
            act(
                world,
                runner,
                "addict-teen",
                Some("addict-teen"),
                "build-real-meaning",
                2,
            );
        }
        "meme-magic" => {
            act(world, runner, "meme-engineer", None, "craft-normal-meme", 1);
            act(world, runner, "meme-engineer", None, "craft-magic-meme", 1);
            act(
                world,
                runner,
                "meme-engineer",
                Some("meme-target"),
                "inject-meme",
                1,
            );
            act(
                world,
                runner,
                "meme-engineer",
                Some("meme-target"),
                "observe-binding",
                1,
            );
            act(
                world,
                runner,
                "meme-engineer",
                Some("meme-target"),
                "spread-via-carrier",
                2,
            );
        }
        "pavlov" => {
            for _ in 0..20 {
                runner.tick(world, 1.0);
            }
            for _ in 0..3 {
                act(world, runner, "pavlov", Some("dog"), "ring-bell", 1);
                act(world, runner, "pavlov", Some("dog"), "feed", 1);
                for _ in 0..25 {
                    runner.tick(world, 1.0);
                }
            }
            act(world, runner, "pavlov", Some("dog"), "ring-bell", 1);
        }
        "postmodern-vagrant" => {
            act(
                world,
                runner,
                "protagonist",
                Some("protagonist"),
                "deconstruct-narrative",
                2,
            );
            act(world, runner, "protagonist", None, "go-to-wilderness", 1);
            act(world, runner, "protagonist", None, "help-with-work", 2);
            act(world, runner, "protagonist", None, "reflect-on-meaning", 2);
            act(
                world,
                runner,
                "protagonist",
                None,
                "accept-new-narrative",
                1,
            );
        }
        "smart-cat" => {
            act(
                world,
                runner,
                "trainer",
                Some("cat-billi"),
                "show-button",
                1,
            );
            for _ in 0..3 {
                act(
                    world,
                    runner,
                    "trainer",
                    Some("cat-billi"),
                    "demonstrate-press",
                    1,
                );
                act(
                    world,
                    runner,
                    "trainer",
                    Some("cat-billi"),
                    "feed-after-press",
                    1,
                );
            }
        }
        "the-wave" => {
            for target in ["tim", "student-a", "student-b"] {
                act(
                    world,
                    runner,
                    "teacher-wenger",
                    Some(target),
                    "introduce-uniform",
                    1,
                );
                act(
                    world,
                    runner,
                    "teacher-wenger",
                    Some(target),
                    "teach-gesture",
                    1,
                );
                act(
                    world,
                    runner,
                    "teacher-wenger",
                    Some(target),
                    "enforce-discipline",
                    1,
                );
            }
            act(
                world,
                runner,
                "teacher-wenger",
                Some("tim"),
                "give-approval",
                1,
            );
            act(
                world,
                runner,
                "teacher-wenger",
                Some("student-a"),
                "reject-outsider",
                1,
            );
        }
        "trigger-addiction" => {
            act(
                world,
                runner,
                "player-agent",
                Some("enemy-target"),
                "hack-bci",
                1,
            );
            act(
                world,
                runner,
                "player-agent",
                Some("enemy-target"),
                "inject-game-meme",
                1,
            );
            act(
                world,
                runner,
                "player-agent",
                Some("enemy-target"),
                "boost-virtual-reward",
                1,
            );
            act(
                world,
                runner,
                "player-agent",
                Some("enemy-target"),
                "attack-body",
                1,
            );
        }
        "water-is-poison" => {
            act(
                world,
                runner,
                "hines",
                Some("subject"),
                "activate-mind-stamp",
                1,
            );
            act(world, runner, "hines", Some("subject"), "offer-water", 1);
            act(world, runner, "hines", Some("subject"), "offer-dry-food", 1);
            act(
                world,
                runner,
                "hines",
                Some("subject"),
                "attempt-rational-persuasion",
                3,
            );
            act(
                world,
                runner,
                "hines",
                Some("subject"),
                "observe-conflict",
                1,
            );
        }
        unknown => panic!("no play scenario for {unknown}"),
    }
}

#[test]
fn every_shipped_level_has_a_verified_winning_route() {
    let root = levels_dir();
    let mut level_paths: Vec<PathBuf> = std::fs::read_dir(&root)
        .expect("read levels directory")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    level_paths.sort();
    assert_eq!(
        level_paths.len(),
        21,
        "the scenario suite must cover every shipped level"
    );

    for path in level_paths {
        play_and_assert_won(&path);
    }
}

fn play_and_assert_won(path: &Path) {
    let level_id = path
        .file_name()
        .and_then(|name| name.to_str())
        .expect("valid level directory name");
    let mut world = load_level_from_path(path).unwrap_or_else(|error| {
        panic!("failed loading {level_id}: {error}");
    });
    assert_eq!(world.level_id, level_id);
    assert!(
        !world.progress.objectives.is_empty(),
        "{level_id} has no objectives"
    );
    assert!(world
        .progress
        .objectives
        .iter()
        .all(|objective| objective.required));

    let runner = SimulationRunner::new();
    play_scenario(level_id, &mut world, &runner);

    let incomplete: Vec<&str> = world
        .progress
        .objectives
        .iter()
        .filter(|objective| !objective.completed)
        .map(|objective| objective.objective_id.as_str())
        .collect();
    assert_eq!(
        world.progress.status,
        LevelStatus::Won,
        "{level_id} did not reach Won; incomplete={incomplete:?}, counts={:?}",
        world.progress.command_counts
    );
    assert!(world.progress.completed_at_tick.is_some());
    eprintln!("verified {level_id} in {} ticks", world.tick);
}
