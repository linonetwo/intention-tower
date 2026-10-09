use intention_tower_game_lib::models::commands::{
    CommandDTO, CommandDef, CommandEffect, TargetingMode,
};
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::models::mind_node::{MemeData, Modality};
use intention_tower_game_lib::models::world_state::WorldState;
use intention_tower_game_lib::systems::{command_system::CommandSystem, System};

fn world() -> WorldState {
    intention_tower_game_lib::level_loader::load_level_from_path(
        &std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/levels/smart-cat"),
    )
    .unwrap()
}
fn queue(world: &mut WorldState, effects: Vec<CommandEffect>) {
    world
        .command_defs
        .retain(|d| d.command_id != "outcome-test");
    world.command_defs.push(CommandDef {
        command_id: "outcome-test".into(),
        label: "test".into(),
        hotkey: None,
        targeting: TargetingMode::NoTarget,
        preconditions: vec![],
        effect_templates: effects,
    });
    world.pending_commands.push(CommandDTO {
        command_id: "outcome-test".into(),
        actor_id: "trainer".into(),
        target_id: None,
        effects: vec![],
    });
}
fn observation() -> CommandEffect {
    CommandEffect::SpawnObservation {
        schema_id: "test:cue".into(),
        modality: Modality::Auditory,
        about: "test".into(),
        ttl: 12,
        strength: 1.0,
        target_character_id: None,
    }
}
fn executed(world: &WorldState) -> usize {
    world
        .pending_events
        .iter()
        .filter(|e| matches!(e, WorldEvent::CommandExecuted { .. }))
        .count()
}
fn resource(world: &mut WorldState) -> String {
    let node = world
        .characters
        .get_mut("trainer")
        .unwrap()
        .mind_graph
        .nodes
        .values_mut()
        .find(|n| n.is_resource())
        .expect("trainer resource");
    node.value = 0.5;
    node.schema_id.clone()
}
fn cost(schema: &str) -> CommandEffect {
    CommandEffect::ConsumeResource {
        resource_schema_id: schema.into(),
        amount: 0.5,
        target_character_id: None,
    }
}

#[test]
fn empty_and_missing_effects_do_not_execute() {
    let mut w = world();
    queue(&mut w, vec![]);
    CommandSystem.run(&mut w, 0.0);
    queue(
        &mut w,
        vec![CommandEffect::DeleteNode {
            schema_id: "absent".into(),
            target_character_id: None,
        }],
    );
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(executed(&w), 0);
    assert_eq!(
        w.pending_events
            .iter()
            .filter(|e| matches!(e, WorldEvent::CommandRejected { .. }))
            .count(),
        2
    );
}
#[test]
fn cost_does_not_turn_missing_primary_effect_into_success() {
    let mut w = world();
    let schema = resource(&mut w);
    queue(
        &mut w,
        vec![
            cost(&schema),
            CommandEffect::DeleteNode {
                schema_id: "absent".into(),
                target_character_id: None,
            },
        ],
    );
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(
        w.characters["trainer"].mind_graph.resource_value(&schema),
        0.5
    );
    assert_eq!(executed(&w), 0);
    assert_eq!(w.pending_events.len(), 1);
    assert!(
        matches!(&w.pending_events[0], WorldEvent::CommandRejected { reason, .. } if reason == "no_effect_applied")
    );
}

#[test]
fn hard_failure_rolls_back_cost_and_domain_events() {
    let mut w = world();
    let schema = resource(&mut w);
    queue(
        &mut w,
        vec![
            cost(&schema),
            observation(),
            CommandEffect::TradeAsset {
                item_id: "absent".into(),
                buyer_id: "__actor".into(),
                seller_id: "__actor".into(),
                quantity: 1.0,
            },
        ],
    );
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(
        w.characters["trainer"].mind_graph.resource_value(&schema),
        0.5
    );
    assert!(w.characters["trainer"]
        .mind_graph
        .find_by_schema("test:cue")
        .is_none());
    assert_eq!(w.pending_events.len(), 1);
    assert!(
        matches!(&w.pending_events[0], WorldEvent::CommandRejected { reason, .. } if reason == "asset_not_found")
    );
}
#[test]
fn queued_commands_revalidate_resource_without_fabricated_consumption() {
    let mut w = world();
    let schema = resource(&mut w);
    queue(&mut w, vec![cost(&schema), observation()]);
    w.pending_commands.push(w.pending_commands[0].clone());
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(executed(&w), 1);
    assert_eq!(
        w.pending_events
            .iter()
            .filter(|e| matches!(e, WorldEvent::ResourceConsumed { .. }))
            .count(),
        1
    );
    assert!(w.pending_events.iter().any(|e| matches!(e, WorldEvent::CommandRejected { reason, .. } if reason == "insufficient_resource")));
}
#[test]
fn repeated_observation_is_meaningful_and_refreshes_ttl() {
    let mut w = world();
    queue(&mut w, vec![observation()]);
    CommandSystem.run(&mut w, 0.0);
    w.tick += 5;
    queue(&mut w, vec![observation()]);
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(executed(&w), 2);
    assert_eq!(
        w.characters["trainer"]
            .mind_graph
            .find_by_schema("test:cue")
            .unwrap()
            .created_at,
        5
    );
}
#[test]
fn absolute_resistance_rejects_but_partial_weakening_executes() {
    let mut w = world();
    queue(
        &mut w,
        vec![CommandEffect::InjectMeme {
            meme_schema_id: "test:meme".into(),
            target_character_id: None,
            meme: MemeData {
                resilience: 0.98,
                ..Default::default()
            },
        }],
    );
    CommandSystem.run(&mut w, 0.0);
    w.pending_events.clear();
    let delete = CommandEffect::DeleteNode {
        schema_id: "test:meme".into(),
        target_character_id: None,
    };
    queue(&mut w, vec![delete.clone()]);
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(executed(&w), 0);
    w.characters
        .get_mut("trainer")
        .unwrap()
        .mind_graph
        .find_by_schema_mut("test:meme")
        .unwrap()
        .meme
        .as_mut()
        .unwrap()
        .resilience = 0.5;
    queue(&mut w, vec![delete]);
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(executed(&w), 1);
    assert!(
        w.characters["trainer"]
            .mind_graph
            .find_by_schema("test:meme")
            .unwrap()
            .meme
            .as_ref()
            .unwrap()
            .resilience
            < 0.5
    );
}
#[test]
fn forged_payload_is_ignored_and_unknown_queue_is_rejected() {
    let mut w = world();
    queue(&mut w, vec![observation()]);
    w.pending_commands[0].effects = vec![CommandEffect::SetVirtualContext { value: true }];
    let mut unknown = w.pending_commands[0].clone();
    unknown.command_id = "unknown".into();
    w.pending_commands.push(unknown);
    CommandSystem.run(&mut w, 0.0);
    assert!(!w.in_virtual_context);
    assert_eq!(executed(&w), 1);
    assert!(w.pending_events.iter().any(
        |e| matches!(e, WorldEvent::CommandRejected { reason, .. } if reason == "unknown_command")
    ));
}

#[test]
fn no_target_command_discards_forged_recipient() {
    let mut w = world();
    queue(&mut w, vec![observation()]);
    w.pending_commands[0].target_id = Some("cat-billi".into());
    CommandSystem.run(&mut w, 0.0);
    assert!(w.characters["trainer"]
        .mind_graph
        .find_by_schema("test:cue")
        .is_some());
    assert!(w.characters["cat-billi"]
        .mind_graph
        .find_by_schema("test:cue")
        .is_none());
    assert!(w.pending_events.iter().any(|event| matches!(
        event,
        WorldEvent::CommandExecuted {
            target_id: None,
            ..
        }
    )));
}

#[test]
fn resistance_diagnostics_do_not_leak_from_failed_atomic_command() {
    let mut w = world();
    queue(
        &mut w,
        vec![CommandEffect::InjectMeme {
            meme_schema_id: "test:sealed".into(),
            target_character_id: None,
            meme: MemeData {
                resilience: 0.98,
                ..Default::default()
            },
        }],
    );
    CommandSystem.run(&mut w, 0.0);
    w.pending_events.clear();
    let delete = CommandEffect::DeleteNode {
        schema_id: "test:sealed".into(),
        target_character_id: None,
    };
    queue(&mut w, vec![delete.clone()]);
    CommandSystem.run(&mut w, 0.0);
    assert!(w.pending_events.iter().any(|event| matches!(event, WorldEvent::NodeDeletionResisted { remaining_resilience, .. } if *remaining_resilience == 0.98)));
    assert_eq!(executed(&w), 0);
    w.pending_events.clear();
    queue(
        &mut w,
        vec![
            delete.clone(),
            CommandEffect::ConsumeResource {
                resource_schema_id: "absent".into(),
                amount: 1.0,
                target_character_id: None,
            },
        ],
    );
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(w.pending_events.len(), 1);
    assert!(matches!(
        &w.pending_events[0],
        WorldEvent::CommandRejected { .. }
    ));
    w.pending_events.clear();
    w.characters
        .get_mut("trainer")
        .unwrap()
        .mind_graph
        .find_by_schema_mut("test:sealed")
        .unwrap()
        .meme
        .as_mut()
        .unwrap()
        .resilience = 0.5;
    queue(
        &mut w,
        vec![
            delete,
            CommandEffect::ConsumeResource {
                resource_schema_id: "absent".into(),
                amount: 1.0,
                target_character_id: None,
            },
        ],
    );
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(w.pending_events.len(), 1);
    assert!(matches!(
        &w.pending_events[0],
        WorldEvent::CommandRejected { .. }
    ));
    assert_eq!(
        w.characters["trainer"]
            .mind_graph
            .find_by_schema("test:sealed")
            .unwrap()
            .meme
            .as_ref()
            .unwrap()
            .resilience,
        0.5
    );
}
#[test]
fn movement_collision_is_atomic_failure() {
    let mut w = world();
    let schema = resource(&mut w);
    let actor = w.characters["trainer"].position.clone();
    w.characters.get_mut("cat-billi").unwrap().position.x = actor.x + 10.0;
    w.characters.get_mut("cat-billi").unwrap().position.y = actor.y;
    queue(
        &mut w,
        vec![
            cost(&schema),
            CommandEffect::MoveCharacter {
                delta_x: 10.0,
                delta_y: 0.0,
                target_character_id: None,
            },
        ],
    );
    CommandSystem.run(&mut w, 0.0);
    assert_eq!(w.characters["trainer"].position.x, actor.x);
    assert_eq!(
        w.characters["trainer"].mind_graph.resource_value(&schema),
        0.5
    );
    assert_eq!(executed(&w), 0);
    assert!(w.pending_events.iter().any(
        |e| matches!(e, WorldEvent::CommandRejected { reason, .. } if reason == "movement_rejected")
    ));
}

#[test]
fn self_trade_and_unowned_asset_reject_and_roll_back_price_changes() {
    use intention_tower_game_lib::models::economy::EconomyAsset;
    for (owner, buyer, reason) in [
        (Some("trainer"), "trainer", "self_trade"),
        (None, "cat-billi", "seller_does_not_own_asset"),
    ] {
        let mut w = world();
        w.economy.assets.insert(
            "test:product".into(),
            EconomyAsset {
                item_id: "test:product".into(),
                owner_id: owner.map(str::to_owned),
                supply: 5.0,
                unit_price: 2.0,
                ..Default::default()
            },
        );
        w.economy.accounts.insert("trainer".into(), 10.0);
        w.economy.accounts.insert("cat-billi".into(), 10.0);
        let economy_before = serde_json::to_value(&w.economy).unwrap();
        queue(
            &mut w,
            vec![
                CommandEffect::SetAssetPrice {
                    item_id: "test:product".into(),
                    unit_price: 1.0,
                },
                CommandEffect::TradeAsset {
                    item_id: "test:product".into(),
                    buyer_id: buyer.into(),
                    seller_id: "trainer".into(),
                    quantity: 1.0,
                },
            ],
        );
        CommandSystem.run(&mut w, 0.0);
        assert_eq!(w.economy.assets["test:product"].unit_price, 2.0);
        assert_eq!(w.economy.assets["test:product"].supply, 5.0);
        assert_eq!(w.economy.accounts["trainer"], 10.0);
        assert_eq!(w.economy.accounts["cat-billi"], 10.0);
        assert_eq!(serde_json::to_value(&w.economy).unwrap(), economy_before);
        assert_eq!(w.pending_events.len(), 1);
        assert!(
            matches!(&w.pending_events[0], WorldEvent::CommandRejected { reason: actual, .. } if actual == reason)
        );
        assert_eq!(executed(&w), 0);
    }
}
