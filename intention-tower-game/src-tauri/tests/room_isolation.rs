use intention_tower_game_lib::{
    command_rules, level_loader,
    models::{
        commands::{CommandDTO, CommandDef, CommandEffect, TargetingMode},
        events::WorldEvent,
        mind_node::Modality,
        world_state::WorldState,
    },
    systems::{command_system::CommandSystem, perception::PerceptionSystem, System},
};

fn world() -> WorldState {
    let mut world = level_loader::load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/pavlov"),
    )
    .unwrap();
    let actor = world.default_actor_id.clone().unwrap();
    let mut other = world.characters[&actor].clone();
    other.id = "pantry_observer".into();
    other.position.x = 810.0;
    world.characters.insert(other.id.clone(), other);
    world
        .character_rooms
        .insert("pantry_observer".into(), "pantry".into());
    world.characters.get_mut(&actor).unwrap().position.x = 790.0;
    world
}

#[test]
fn sensory_events_are_room_local_and_unknown_sources_do_not_broadcast() {
    let mut world = world();
    let actor = world.default_actor_id.clone().unwrap();
    world.pending_events = vec![
        WorldEvent::SoundEmitted {
            source_entity_id: actor.clone(),
            about: "test:bell".into(),
            modality: "Auditory".into(),
        },
        WorldEvent::FoodPresented {
            source_entity_id: actor.clone(),
            about: "test:food".into(),
        },
        WorldEvent::SoundEmitted {
            source_entity_id: "missing".into(),
            about: "test:missing".into(),
            modality: "Auditory".into(),
        },
        WorldEvent::FoodPresented {
            source_entity_id: "missing".into(),
            about: "test:missing_food".into(),
        },
    ];
    PerceptionSystem.run(&mut world, 1.0);
    for schema in ["test:bell", "test:food"] {
        assert!(world.characters[&actor]
            .mind_graph
            .find_by_schema(schema)
            .is_some());
        assert!(world.characters["pantry_observer"]
            .mind_graph
            .find_by_schema(schema)
            .is_none());
    }
    for character in world.characters.values() {
        assert!(character
            .mind_graph
            .find_by_schema("test:missing")
            .is_none());
        assert!(character
            .mind_graph
            .find_by_schema("test:missing_food")
            .is_none());
    }
}

#[test]
fn commands_reject_cross_room_target_and_explicit_recipient_atomically() {
    let mut world = world();
    let actor = world.default_actor_id.clone().unwrap();
    let mut definition = CommandDef {
        command_id: "test".into(),
        label: "test".into(),
        hotkey: None,
        targeting: TargetingMode::RequiresTarget,
        preconditions: vec![],
        effect_templates: vec![CommandEffect::SpawnObservation {
            schema_id: "test:remote".into(),
            modality: Modality::Social,
            about: "test:remote".into(),
            ttl: 10,
            strength: 1.0,
            social_reward_scale: 1.0,
            signal_type: None,
            group_context: None,
            action_credit: None,
            target_character_id: Some("pantry_observer".into()),
        }],
    };
    assert!(!command_rules::command_available(
        &definition,
        &actor,
        Some("pantry_observer"),
        &world
    ));
    definition.targeting = TargetingMode::NoTarget;
    world.command_defs.push(definition);
    world.pending_commands.push(CommandDTO {
        command_id: "test".into(),
        actor_id: actor,
        target_id: None,
        effects: vec![],
    });
    let before = serde_json::to_value(&world.characters).unwrap();
    CommandSystem.run(&mut world, 1.0);
    assert_eq!(serde_json::to_value(&world.characters).unwrap(), before);
    assert!(world
        .pending_events
        .iter()
        .any(|event| matches!(event, WorldEvent::CommandRejected { .. })));
}
