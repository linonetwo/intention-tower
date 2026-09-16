use std::path::PathBuf;

use intention_tower_game_lib::level_loader::load_level_from_path;
use intention_tower_game_lib::models::commands::{CommandDTO, CommandEffect};
use intention_tower_game_lib::models::events::WorldEvent;
use intention_tower_game_lib::movement::move_character;
use intention_tower_game_lib::systems::action_selection::ActionSelectionSystem;
use intention_tower_game_lib::systems::attention_allocation::AttentionAllocationSystem;
use intention_tower_game_lib::systems::belief_conflict::BeliefConflictSystem;
use intention_tower_game_lib::systems::command_system::CommandSystem;
use intention_tower_game_lib::systems::economy::EconomySystem;
use intention_tower_game_lib::systems::meme_emergence::MemeEmergenceSystem;
use intention_tower_game_lib::systems::perception::PerceptionSystem;
use intention_tower_game_lib::systems::social_dynamics::SocialDynamicsSystem;
use intention_tower_game_lib::systems::System;

fn level_dir(level_id: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has an app parent")
        .join("assets/levels")
        .join(level_id)
}

fn command(
    world: &intention_tower_game_lib::models::world_state::WorldState,
    id: &str,
) -> CommandDTO {
    let definition = world
        .command_defs
        .iter()
        .find(|definition| definition.command_id == id)
        .unwrap_or_else(|| panic!("missing command {id}"));
    CommandDTO {
        command_id: id.to_owned(),
        actor_id: world
            .default_actor_id
            .clone()
            .expect("test level needs a default actor"),
        target_id: world.default_target_id.clone(),
        effects: definition.effect_templates.clone(),
    }
}

#[test]
fn virtual_context_is_nested_and_stamps_observation_layer() {
    let mut world = load_level_from_path(&level_dir("cyber-dream")).expect("load cyber-dream");
    let system = CommandSystem;

    let enter = command(&world, "enter-vr");
    world.pending_commands.push(enter.clone());
    system.run(&mut world, 0.0);
    world.pending_commands.push(enter);
    system.run(&mut world, 0.0);

    assert!(world.in_virtual_context);
    assert_eq!(world.virtual_context_stack.len(), 2);
    let observation = world.characters["player"]
        .mind_graph
        .find_by_schema("it:concept/enter-virtual")
        .expect("virtual observation");
    assert!(observation.is_virtual);
    assert_eq!(observation.reality_layer, 2);

    world.pending_events.push(WorldEvent::SoundEmitted {
        source_entity_id: "player".to_owned(),
        about: "it:concept/virtual-signal".to_owned(),
        modality: "Auditory".to_owned(),
    });
    PerceptionSystem.run(&mut world, 0.0);
    let perceived = world.characters["player"]
        .mind_graph
        .find_by_schema("it:concept/virtual-signal")
        .expect("event perception inside virtual context");
    assert!(perceived.is_virtual);
    assert_eq!(perceived.reality_layer, 2);

    let exit = command(&world, "exit-vr");
    world.pending_commands.push(exit.clone());
    system.run(&mut world, 0.0);
    assert!(world.in_virtual_context);
    assert_eq!(world.virtual_context_stack.len(), 1);

    world.pending_commands.push(exit);
    system.run(&mut world, 0.0);
    assert!(!world.in_virtual_context);
    assert!(world.virtual_context_stack.is_empty());
    assert!(world.pending_events.iter().any(|event| matches!(
        event,
        WorldEvent::VirtualContextChanged {
            value: false,
            depth: 0
        }
    )));
}

#[test]
fn attention_loss_is_recoverable_and_does_not_deactivate_nodes() {
    let mut world = load_level_from_path(&level_dir("pavlov")).expect("load pavlov");
    let dog = world.characters.get_mut("dog").expect("dog");
    for node in dog.mind_graph.nodes.values_mut() {
        if !node.is_resource() {
            node.active = node.instance_id == "dog-hunger";
            node.attended = true;
        }
    }
    dog.mind_graph
        .find_by_schema_mut("it:concept/attention")
        .expect("attention")
        .value = 0.0;

    AttentionAllocationSystem.run(&mut world, 0.0);
    let hunger = &world.characters["dog"].mind_graph.nodes["dog-hunger"];
    assert!(hunger.active, "attention must not alter lifecycle");
    assert!(!hunger.attended);

    world
        .characters
        .get_mut("dog")
        .expect("dog")
        .mind_graph
        .find_by_schema_mut("it:concept/attention")
        .expect("attention")
        .value = 1.0;
    AttentionAllocationSystem.run(&mut world, 0.0);
    let hunger = &world.characters["dog"].mind_graph.nodes["dog-hunger"];
    assert!(hunger.active);
    assert!(
        hunger.attended,
        "replenished attention must restore processing"
    );
}

#[test]
fn action_competition_can_choose_a_different_winner_next_tick() {
    let mut world =
        load_level_from_path(&level_dir("antimeme-division")).expect("load antimeme level");
    let agent = world
        .characters
        .get_mut("antimeme-agent")
        .expect("antimeme agent");
    for node in agent.mind_graph.nodes.values_mut() {
        if node.action.is_some() {
            node.active = true;
            node.attended = true;
        }
    }

    ActionSelectionSystem.run(&mut world, 0.0);
    assert!(
        world.characters["antimeme-agent"].mind_graph.nodes["agent-investigate"]
            .action
            .as_ref()
            .expect("action")
            .selected
    );

    let agent = world.characters.get_mut("antimeme-agent").expect("agent");
    agent
        .mind_graph
        .nodes
        .get_mut("agent-investigate")
        .expect("investigate")
        .strength = 0.1;
    agent
        .mind_graph
        .nodes
        .get_mut("agent-remember-location")
        .expect("remember")
        .strength = 0.9;
    ActionSelectionSystem.run(&mut world, 0.0);

    let graph = &world.characters["antimeme-agent"].mind_graph;
    assert!(graph.nodes["agent-investigate"].active);
    assert!(graph.nodes["agent-remember-location"].active);
    assert!(
        !graph.nodes["agent-investigate"]
            .action
            .as_ref()
            .expect("action")
            .selected
    );
    assert!(
        graph.nodes["agent-remember-location"]
            .action
            .as_ref()
            .expect("action")
            .selected
    );
}

#[test]
fn thought_seal_resists_deletion() {
    let mut world =
        load_level_from_path(&level_dir("water-is-poison")).expect("load water-is-poison");
    let system = CommandSystem;

    world
        .pending_commands
        .push(command(&world, "activate-mind-stamp"));
    system.run(&mut world, 0.0);
    world.pending_events.clear();

    world.pending_commands.push(CommandDTO {
        command_id: "erase-thought-seal".to_owned(),
        actor_id: "hines".to_owned(),
        target_id: Some("subject".to_owned()),
        effects: vec![CommandEffect::DeleteNode {
            schema_id: "it:concept/water-is-poison".to_owned(),
            target_character_id: Some("__target".to_owned()),
        }],
    });
    system.run(&mut world, 0.0);

    let node = world.characters["subject"]
        .mind_graph
        .find_by_schema("it:concept/water-is-poison")
        .expect("thought seal must remain installed");
    assert_eq!(node.meme.as_ref().expect("meme data").resilience, 0.98);
    assert!(world.pending_events.iter().any(|event| matches!(
        event,
        WorldEvent::NodeDeletionResisted {
            character_id,
            remaining_resilience,
            ..
        } if character_id == "subject" && (*remaining_resilience - 0.98).abs() < f64::EPSILON
    )));
}

#[test]
fn weaken_edge_always_reduces_weight_even_with_legacy_negative_delta() {
    let mut world = load_level_from_path(&level_dir("hive-self")).expect("load hive-self");
    let system = CommandSystem;
    let mut weaken = command(&world, "inject-distrust");
    weaken.target_id = Some("clone-b".to_owned());

    let before = world.characters["clone-b"].mind_graph.edges["trust-to-cooperate"].weight;
    world.pending_commands.push(weaken);
    system.run(&mut world, 0.0);
    let after = world.characters["clone-b"].mind_graph.edges["trust-to-cooperate"].weight;

    assert!(after < before);
    assert!((after - 0.3).abs() < f64::EPSILON);
}

#[test]
fn movement_is_authoritative_rate_limited_and_bounded() {
    let mut world = load_level_from_path(&level_dir("cyber-dream")).expect("load cyber-dream");
    let before = world.characters["player"].position.clone();
    let event = move_character(&mut world, "player", 1000.0, 0.0).expect("move player");
    let after = &world.characters["player"].position;
    assert!((after.x - before.x - 40.0).abs() < f64::EPSILON);
    assert!(matches!(event, WorldEvent::CharacterMoved { .. }));

    let player = world.characters.get_mut("player").expect("player");
    player.position.x = 795.0;
    player.position.y = 580.0;
    move_character(&mut world, "player", 30.0, 30.0).expect("bounded move");
    let after = &world.characters["player"].position;
    assert!(after.x <= 800.0);
    assert!(after.y <= 600.0);
}

#[test]
fn identity_memes_form_a_cross_character_social_group() {
    let mut world = load_level_from_path(&level_dir("the-wave")).expect("load the-wave");
    for target in ["tim", "student-a", "student-b"] {
        let mut introduce = command(&world, "introduce-uniform");
        introduce.target_id = Some(target.to_owned());
        world.pending_commands.push(introduce);
        CommandSystem.run(&mut world, 0.0);
    }

    SocialDynamicsSystem.run(&mut world, 1.0);
    let group = world.social_groups.get("the-wave").expect("the-wave group");
    assert_eq!(group.members, ["student-a", "student-b", "tim"]);
    assert!(group.cohesion > 0.5);
    assert!(world.pending_events.iter().any(|event| matches!(
        event,
        WorldEvent::SocialGroupUpdated {
            group_id,
            member_count: 3,
            ..
        } if group_id == "the-wave"
    )));
}

#[test]
fn repeated_public_behavior_crystallizes_into_an_emergent_meme() {
    let mut world = load_level_from_path(&level_dir("pavlov")).expect("load pavlov");
    for tick in 1..=3 {
        world.tick = tick;
        world.pending_events = vec![WorldEvent::SoundEmitted {
            source_entity_id: "pavlov".to_owned(),
            about: "it:concept/public-ritual".to_owned(),
            modality: "Social".to_owned(),
        }];
        PerceptionSystem.run(&mut world, 0.0);
        world.pending_events.clear();
    }

    MemeEmergenceSystem.run(&mut world, 0.0);
    let emergent = world.characters["dog"]
        .mind_graph
        .find_by_schema("it:emergent/it_concept_public_ritual")
        .expect("emergent meme");
    assert_eq!(
        emergent.node_type,
        intention_tower_game_lib::models::mind_node::NodeType::Meme
    );
    assert_eq!(
        emergent.meme.as_ref().expect("meme data").spread_vector,
        Some(intention_tower_game_lib::models::mind_node::SpreadVector::Language)
    );
}

#[test]
fn consumer_command_creates_a_real_balanced_asset_transaction() {
    let mut world = load_level_from_path(&level_dir("crowd")).expect("load crowd");
    let system = CommandSystem;
    let mut advertise = command(&world, "place-billboard");
    advertise.target_id = Some("citizen-1".to_owned());
    world.pending_commands.push(advertise);
    system.run(&mut world, 0.0);
    EconomySystem.run(&mut world, 0.0);
    assert!(world.economy.assets["product"].demand > 0.0);

    let mut buy = command(&world, "set-price");
    buy.target_id = Some("citizen-1".to_owned());
    world.pending_commands.push(buy);
    system.run(&mut world, 0.0);

    assert_eq!(world.economy.assets["product"].supply, 99.0);
    assert_eq!(world.economy.accounts["citizen-1"], 92.0);
    assert_eq!(world.economy.accounts["player-capitalist"], 108.0);
    assert_eq!(world.economy.holdings["citizen-1"]["product"], 1.0);
    assert_eq!(world.economy.transactions.len(), 1);
    assert!(world.pending_events.iter().any(|event| matches!(
        event,
        WorldEvent::AssetTraded {
            buyer_id,
            total_price,
            ..
        } if buyer_id == "citizen-1" && (*total_price - 8.0).abs() < f64::EPSILON
    )));
}

#[test]
fn belief_suppression_is_effective_but_never_erodes_base_instinct_strength() {
    let mut world =
        load_level_from_path(&level_dir("water-is-poison")).expect("load water-is-poison");
    world
        .pending_commands
        .push(command(&world, "activate-mind-stamp"));
    CommandSystem.run(&mut world, 0.0);
    let original_strength = world.characters["subject"]
        .mind_graph
        .find_by_schema("it:concept/thirst")
        .expect("thirst")
        .strength;

    BeliefConflictSystem.run(&mut world, 1.0);
    BeliefConflictSystem.run(&mut world, 1.0);
    let thirst = world.characters["subject"]
        .mind_graph
        .find_by_schema("it:concept/thirst")
        .expect("thirst");
    assert!(thirst.suppression > 0.0);
    assert_eq!(thirst.strength, original_strength);
    assert!(thirst.effective_strength() < thirst.strength);
}
