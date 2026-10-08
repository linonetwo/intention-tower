use intention_tower_game_lib::models::scene::{normalize_positions, CharacterPosture};
use intention_tower_game_lib::{level_loader, movement};

fn cat_world() -> intention_tower_game_lib::models::world_state::WorldState {
    level_loader::load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/smart-cat"),
    )
    .unwrap()
}

#[test]
fn horizontal_walking_cannot_fly_and_stands_up() {
    let mut world = cat_world();
    movement::set_character_posture(&mut world, "trainer", CharacterPosture::Sitting).unwrap();
    assert!(movement::move_character(&mut world, "trainer", 0.0, -40.0).is_err());
    assert_eq!(world.characters["trainer"].position.y, 300.0);
    movement::move_character(&mut world, "trainer", 40.0, 0.0).unwrap();
    assert_eq!(
        world.character_postures["trainer"],
        CharacterPosture::Standing
    );
    assert_eq!(world.characters["trainer"].position.y, 300.0);
}

#[test]
fn stairs_require_endpoint_then_preserve_floor_and_bounds() {
    let mut world = cat_world();
    assert!(movement::traverse_connector(&mut world, "cat-billi", "loft-stairs").is_err());
    for _ in 0..3 {
        movement::move_character(&mut world, "cat-billi", 40.0, 0.0).unwrap();
    }
    movement::traverse_connector(&mut world, "cat-billi", "loft-stairs").unwrap();
    assert_eq!(world.characters["cat-billi"].position.y, 180.0);
    for _ in 0..10 {
        movement::move_character(&mut world, "cat-billi", -40.0, 0.0).unwrap();
    }
    assert_eq!(world.characters["cat-billi"].position.x, 540.0);
    assert!(movement::move_character(&mut world, "cat-billi", 0.0, 40.0).is_err());
    movement::move_character(&mut world, "cat-billi", 40.0, 0.0).unwrap();
    movement::traverse_connector(&mut world, "cat-billi", "loft-stairs").unwrap();
    assert_eq!(world.characters["cat-billi"].position.y, 300.0);
}

#[test]
fn snapshot_retains_sitting_and_migrates_legacy_ground() {
    let mut world = cat_world();
    movement::set_character_posture(&mut world, "trainer", CharacterPosture::Sitting).unwrap();
    let mut snapshot = serde_json::to_value(&world).unwrap();
    let restored: intention_tower_game_lib::models::world_state::WorldState =
        serde_json::from_value(snapshot.clone()).unwrap();
    assert_eq!(
        restored.character_postures["trainer"],
        CharacterPosture::Sitting
    );
    snapshot.as_object_mut().unwrap().remove("scene");
    snapshot
        .as_object_mut()
        .unwrap()
        .remove("character_postures");
    snapshot["characters"]["trainer"]["position"]["y"] = serde_json::json!(91.0);
    let mut legacy = serde_json::from_value(snapshot).unwrap();
    normalize_positions(&mut legacy);
    assert_eq!(legacy.characters["trainer"].position.y, 300.0);
    assert_eq!(
        legacy.character_postures["trainer"],
        CharacterPosture::Standing
    );
}

#[test]
fn wave_all_characters_share_ground() {
    let world = level_loader::load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/the-wave"),
    )
    .unwrap();
    assert!(world.characters.values().all(|c| c.position.y == 300.0));
    let characters: Vec<_> = world.characters.values().collect();
    for (index, character) in characters.iter().enumerate() {
        assert!(characters[index + 1..]
            .iter()
            .all(|other| (other.position.x - character.position.x).abs() >= 32.0));
    }
}
