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

fn room_world() -> intention_tower_game_lib::models::world_state::WorldState {
    let mut world = level_loader::load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/pavlov"),
    )
    .unwrap();
    let actor = world.default_actor_id.clone().unwrap();
    world.characters.retain(|id, _| id == &actor);
    world.items.clear();
    world.characters.get_mut(&actor).unwrap().position.x = 790.0;
    world.character_rooms.insert(actor, "lab".into());
    world
}

#[test]
fn seamless_portal_crossing_is_bidirectional_bounded_and_preserves_state() {
    let mut world = room_world();
    let actor = world.default_actor_id.clone().unwrap();
    world.tick = 19;
    let before = serde_json::to_value(&world).unwrap();
    movement::move_character(&mut world, &actor, 500.0, 0.0).unwrap();
    assert_eq!(world.characters[&actor].position.x, 830.0);
    assert_eq!(world.entity_room(&actor), Some("pantry"));
    assert_eq!(world.tick, 19);
    assert_eq!(
        serde_json::to_value(&world.characters[&actor].mind_graph).unwrap(),
        before["characters"][&actor]["mind_graph"]
    );
    assert_eq!(
        serde_json::to_value(&world.progress).unwrap(),
        before["progress"]
    );
    assert_eq!(
        serde_json::to_value(&world.economy).unwrap(),
        before["economy"]
    );
    let mut restored = serde_json::from_value::<
        intention_tower_game_lib::models::world_state::WorldState,
    >(serde_json::to_value(&world).unwrap())
    .unwrap();
    normalize_positions(&mut restored);
    assert_eq!(restored.entity_room(&actor), Some("pantry"));
    movement::move_character(&mut restored, &actor, -40.0, 0.0).unwrap();
    assert_eq!(restored.characters[&actor].position.x, 790.0);
    assert_eq!(restored.entity_room(&actor), Some("lab"));
}

#[test]
fn blocked_crossing_rolls_back_and_missing_portal_stays_at_boundary() {
    let mut world = room_world();
    let actor = world.default_actor_id.clone().unwrap();
    let mut blocker = world.characters[&actor].clone();
    blocker.id = "blocker".into();
    blocker.position.x = 825.0;
    world.characters.insert(blocker.id.clone(), blocker);
    world
        .character_rooms
        .insert("blocker".into(), "pantry".into());
    let before = serde_json::to_value(&world).unwrap();
    assert!(movement::move_character(&mut world, &actor, 40.0, 0.0).is_err());
    assert_eq!(serde_json::to_value(&world).unwrap(), before);
    world.characters.remove("blocker");
    world.scene.portals.clear();
    movement::move_character(&mut world, &actor, 40.0, 0.0).unwrap();
    assert_eq!(world.characters[&actor].position.x, 800.0);
    assert_eq!(world.entity_room(&actor), Some("lab"));
}

#[test]
fn room_schema_rejects_nonadjacent_duplicate_and_unassigned_platforms() {
    let world = room_world();
    let mut scene = world.scene.clone();
    scene.portals[0].x = 799.0;
    assert!(scene.validate().is_err());
    let mut scene = world.scene.clone();
    scene.rooms[1].id = "lab".into();
    assert!(scene.validate().is_err());
    let mut scene = world.scene.clone();
    scene.rooms[1].platform_ids.pop();
    assert!(scene.validate().is_err());
    let mut scene = world.scene.clone();
    scene.rooms[1].x_max = f64::INFINITY;
    assert!(scene.validate().is_err());
}

#[test]
fn legacy_snapshot_without_room_fields_uses_main() {
    let world = cat_world();
    let mut value = serde_json::to_value(world).unwrap();
    value.as_object_mut().unwrap().remove("character_rooms");
    value.as_object_mut().unwrap().remove("item_rooms");
    value["scene"].as_object_mut().unwrap().remove("rooms");
    value["scene"].as_object_mut().unwrap().remove("portals");
    let world: intention_tower_game_lib::models::world_state::WorldState =
        serde_json::from_value(value).unwrap();
    assert_eq!(world.entity_room("trainer"), Some("main"));
}

#[test]
fn boundary_support_and_collisions_use_occupancy_then_pantry_ladder_works() {
    let mut world = room_world();
    let actor = world.default_actor_id.clone().unwrap();
    let mut other = world.characters[&actor].clone();
    other.id = "other".into();
    other.position.x = 810.0;
    world.characters.insert("other".into(), other);
    world
        .character_rooms
        .insert("other".into(), "pantry".into());
    // Close actors across the wall cannot block an in-room step.
    movement::move_character(&mut world, &actor, 10.0, 0.0).unwrap();
    assert_eq!(world.characters[&actor].position.x, 800.0);
    assert_eq!(world.entity_room(&actor), Some("lab"));
    world.characters.remove("other");
    movement::move_character(&mut world, &actor, 40.0, 0.0).unwrap();
    for _ in 0..9 {
        movement::move_character(&mut world, &actor, 40.0, 0.0).unwrap();
    }
    assert_eq!(world.characters[&actor].position.x, 1200.0);
    movement::traverse_connector(&mut world, &actor, "pantry_ladder").unwrap();
    assert_eq!(world.characters[&actor].position.y, 180.0);
    assert_eq!(world.entity_room(&actor), Some("pantry"));
    movement::traverse_connector(&mut world, &actor, "pantry_ladder").unwrap();
    assert_eq!(world.characters[&actor].position.y, 300.0);
}

#[test]
fn authored_pavlov_can_walk_past_dog_into_pantry_and_back_without_state_injection() {
    let mut world = level_loader::load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/pavlov"),
    )
    .unwrap();
    assert_eq!(world.characters["pavlov"].position.x, 200.0);
    assert_eq!(world.characters["dog"].position.x, 400.0);
    for _ in 0..16 {
        movement::move_character(&mut world, "pavlov", 40.0, 0.0).unwrap();
    }
    assert_eq!(world.characters["pavlov"].position.x, 840.0);
    assert_eq!(world.entity_room("pavlov"), Some("pantry"));
    for _ in 0..16 {
        movement::move_character(&mut world, "pavlov", -40.0, 0.0).unwrap();
    }
    assert_eq!(world.characters["pavlov"].position.x, 200.0);
    assert_eq!(world.entity_room("pavlov"), Some("lab"));
    world.scene.non_blocking_characters.clear();
    for _ in 0..4 {
        movement::move_character(&mut world, "pavlov", 40.0, 0.0).unwrap();
    }
    assert!(movement::move_character(&mut world, "pavlov", 40.0, 0.0).is_err());
}

#[test]
fn non_blocking_policy_rejects_blank_and_duplicate_characters() {
    let mut scene = cat_world().scene;
    scene.non_blocking_characters = vec![" ".into()];
    assert!(scene.validate().is_err());
    scene.non_blocking_characters = vec!["cat-billi".into(), "cat-billi".into()];
    assert!(scene.validate().is_err());
}
