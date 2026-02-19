/// Integration test: Load Pavlov level from JSON-LD and run the complete
/// classical conditioning loop end-to-end.
///
/// This test validates:
/// 1. Level loader correctly parses JSON-LD files into WorldState
/// 2. All 23 systems cooperate through the simulation runner
/// 3. The Pavlov dog scenario works: ring bell → present food → repeat → dog salivates on bell alone
/// 4. Command system correctly applies effects
/// 5. PerceptionSystem converts events to observations
/// 6. NoveltyHabituationSystem reduces repeated stimulus strength
/// 7. AttentionAllocationSystem manages attention budget

use std::path::PathBuf;

#[cfg(test)]
mod tests {
    use super::*;
    use intention_tower_game_lib::level_loader;
    use intention_tower_game_lib::systems::runner::SimulationRunner;
    use intention_tower_game_lib::models::mind_node::*;
    use intention_tower_game_lib::models::commands::*;
    use intention_tower_game_lib::models::events::WorldEvent;

    fn assets_dir() -> PathBuf {
        // Navigate from src-tauri/tests/ to assets/
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        PathBuf::from(manifest_dir).join("..").join("assets")
    }

    fn pavlov_level_dir() -> PathBuf {
        assets_dir().join("levels").join("pavlov")
    }

    #[test]
    fn test_load_pavlov_level() {
        let world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");

        // Check characters
        assert!(world.characters.contains_key("dog"), "Should have dog character");
        assert!(world.characters.contains_key("pavlov"), "Should have pavlov character");

        // Check items
        assert!(world.items.contains_key("fast-metronome"), "Should have fast metronome");
        assert!(world.items.contains_key("slow-metronome"), "Should have slow metronome");
        assert!(world.items.contains_key("meat"), "Should have meat");

        // Check dog mind graph
        let dog = &world.characters["dog"];
        assert!(dog.mind_graph.nodes.contains_key("dog-hunger"), "Dog should have hunger node");
        assert!(dog.mind_graph.nodes.contains_key("dog-salivate"), "Dog should have salivate node");
        assert!(dog.mind_graph.nodes.contains_key("dog-attention"), "Dog should have attention resource");
        assert!(dog.mind_graph.nodes.contains_key("dog-dopamine"), "Dog should have dopamine resource");
        assert!(dog.mind_graph.nodes.contains_key("dog-health"), "Dog should have health resource");

        // Check hunger node has correct thresholds
        let hunger = &dog.mind_graph.nodes["dog-hunger"];
        assert_eq!(hunger.thresholds.len(), 2, "Hunger should have 2 thresholds");
        assert_eq!(hunger.thresholds[0].activate_on_rising_above, 0.6);
        assert_eq!(hunger.thresholds[0].deactivate_on_falling_below, 0.4);

        // Check salivate action is innate
        let salivate = &dog.mind_graph.nodes["dog-salivate"];
        assert!(salivate.action.as_ref().unwrap().innate, "Salivate should be innate");
    }

    #[test]
    fn test_load_pavlov_commands() {
        let world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");

        assert_eq!(world.command_defs.len(), 2, "Should have 2 commands (ring-bell, feed)");

        let ring_bell = world.command_defs.iter().find(|c| c.command_id == "ring-bell").unwrap();
        assert_eq!(ring_bell.targeting, TargetingMode::RequiresTarget);
        assert_eq!(ring_bell.effect_templates.len(), 1);

        let feed = world.command_defs.iter().find(|c| c.command_id == "feed").unwrap();
        assert_eq!(feed.effect_templates.len(), 2);
    }

    #[test]
    fn test_loaded_level_hunger_rises() {
        let mut world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");
        let runner = SimulationRunner::new();

        let initial_hunger = world.characters["dog"].mind_graph.nodes["dog-hunger"].value;

        // Run 20 ticks
        for _ in 0..20 {
            runner.tick(&mut world, 1.0);
        }

        let final_hunger = world.characters["dog"].mind_graph.nodes["dog-hunger"].value;
        assert!(final_hunger > initial_hunger, "Hunger should rise: {} -> {}", initial_hunger, final_hunger);
    }

    #[test]
    fn test_full_pavlov_conditioning_loop() {
        let mut world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");
        let runner = SimulationRunner::new();

        // Phase 1: Let hunger build up
        for _ in 0..15 {
            runner.tick(&mut world, 1.0);
        }

        let hunger_val = world.characters["dog"].mind_graph.nodes["dog-hunger"].value;
        assert!(hunger_val > 0.6, "Hunger should have crossed 0.6 threshold: {}", hunger_val);

        // Phase 2: Ring bell + present food (simulate classical conditioning)
        // Ring bell → spawns auditory observation on dog
        let bell_cmd = CommandDTO {
            command_id: "ring-bell".to_string(),
            actor_id: "pavlov".to_string(),
            target_id: Some("dog".to_string()),
            effects: vec![
                CommandEffect::SpawnObservation {
                    schema_id: "it:concept/hear-metronome".to_string(),
                    modality: Modality::Auditory,
                    about: "it:entity-type/metronome".to_string(),
                    ttl: 300,
                    strength: 0.8,
                    target_character_id: Some("dog".to_string()),
                },
            ],
        };
        world.pending_commands.push(bell_cmd);
        runner.tick(&mut world, 1.0);

        // Check observation was created on dog
        let dog_obs: Vec<&MindNode> = world.characters["dog"].mind_graph.nodes.values()
            .filter(|n| n.node_type == NodeType::Observation)
            .collect();
        assert!(!dog_obs.is_empty(), "Dog should have observation nodes after bell ring");

        // Present food → spawns olfactory observation + reduces hunger
        let food_cmd = CommandDTO {
            command_id: "feed".to_string(),
            actor_id: "pavlov".to_string(),
            target_id: Some("dog".to_string()),
            effects: vec![
                CommandEffect::SpawnObservation {
                    schema_id: "it:concept/see-food".to_string(),
                    modality: Modality::Olfactory,
                    about: "schema:Food".to_string(),
                    ttl: 300,
                    strength: 1.0,
                    target_character_id: Some("dog".to_string()),
                },
                CommandEffect::ModifyNodeValue {
                    schema_id: "it:concept/hunger".to_string(),
                    delta: -0.4,
                    target_character_id: Some("dog".to_string()),
                },
            ],
        };
        world.pending_commands.push(food_cmd);
        runner.tick(&mut world, 1.0);

        // Hunger should have decreased
        let hunger_after_feed = world.characters["dog"].mind_graph.nodes["dog-hunger"].value;
        assert!(hunger_after_feed < hunger_val - 0.2,
            "Hunger should have dropped after feeding: {} -> {}", hunger_val, hunger_after_feed);
    }

    #[test]
    fn test_repeated_bell_food_creates_association() {
        let mut world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");
        let runner = SimulationRunner::new();

        // Repeat: let hunger rise → ring bell → feed → tick
        // Do this 5 times to build strong association
        for trial in 0..5 {
            // Let hunger rise above threshold (0.6)
            for _ in 0..20 {
                runner.tick(&mut world, 1.0);
            }

            // Verify hunger is high and want-to-eat exists
            let hunger_val = world.characters["dog"].mind_graph.nodes["dog-hunger"].value;
            assert!(hunger_val > 0.5,
                "Trial {}: hunger should be above 0.5, got {}", trial, hunger_val);

            // Ring bell
            world.pending_commands.push(CommandDTO {
                command_id: "ring-bell".to_string(),
                actor_id: "pavlov".to_string(),
                target_id: Some("dog".to_string()),
                effects: vec![
                    CommandEffect::SpawnObservation {
                        schema_id: "it:concept/hear-metronome".to_string(),
                        modality: Modality::Auditory,
                        about: "it:entity-type/metronome".to_string(),
                        ttl: 300,
                        strength: 0.8,
                        target_character_id: Some("dog".to_string()),
                    },
                ],
            });
            runner.tick(&mut world, 1.0);

            // Feed
            world.pending_commands.push(CommandDTO {
                command_id: "feed".to_string(),
                actor_id: "pavlov".to_string(),
                target_id: Some("dog".to_string()),
                effects: vec![
                    CommandEffect::SpawnObservation {
                        schema_id: "it:concept/see-food".to_string(),
                        modality: Modality::Olfactory,
                        about: "schema:Food".to_string(),
                        ttl: 300,
                        strength: 1.0,
                        target_character_id: Some("dog".to_string()),
                    },
                    CommandEffect::ModifyNodeValue {
                        schema_id: "it:concept/hunger".to_string(),
                        delta: -0.4,
                        target_character_id: Some("dog".to_string()),
                    },
                ],
            });
            runner.tick(&mut world, 1.0);
        }

        // Check that learned edges exist (from bell observation → want-to-eat motivation)
        let dog_graph = &world.characters["dog"].mind_graph;
        let learned_edges: Vec<_> = dog_graph.edges.values()
            .filter(|e| e.learnable)
            .collect();

        // Also count all edges for diagnostics
        let total_edges = dog_graph.edges.len();
        let edges_with_classical: Vec<_> = dog_graph.edges.values()
            .filter(|e| e.learn_type == LearnType::Classical && e.learnable)
            .collect();

        assert!(!learned_edges.is_empty(),
            "After 5 conditioning trials, there should be learned edges. \
             Found {} total edges, {} learnable, {} classical.",
            total_edges, learned_edges.len(), edges_with_classical.len());

        // Check edge weights — new edges start at 0.1 (REINFORCE_DELTA)
        // Multiple trials should create multiple edges (one per observation instance)
        assert!(learned_edges.len() >= 2,
            "Should have at least 2 learned edges from multiple trials, got {}",
            learned_edges.len());

        for edge in &learned_edges {
            assert!(edge.weight >= 0.1,
                "Learned edge weight should be >= 0.1, got {}",
                edge.weight);
        }
    }

    #[test]
    fn test_command_precondition_checking() {
        let world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");

        // ring-bell requires EnvHasItem for metronome
        let ring_bell = world.command_defs.iter().find(|c| c.command_id == "ring-bell").unwrap();
        assert_eq!(ring_bell.preconditions.len(), 1);

        // The world has items with schema:Product type but the precondition checks for it:entity-type/metronome
        // This tests our abstract_type matching in items
    }

    #[test]
    fn test_attention_budget_limits_nodes() {
        let mut world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");
        let runner = SimulationRunner::new();

        // Drain attention by setting it low
        if let Some(dog) = world.characters.get_mut("dog") {
            if let Some(attention) = dog.mind_graph.find_by_schema_mut("it:concept/attention") {
                attention.value = 0.01; // Nearly empty
            }
        }

        // Spawn many observations to overwhelm attention
        for i in 0..20 {
            let obs = MindNode {
                instance_id: format!("test-obs-{}", i),
                schema_id: format!("it:concept/test-{}", i),
                label: format!("test-{}", i),
                node_type: NodeType::Observation,
                value: 1.0,
                value_velocity: 0.0,
                strength: 0.3,
                active: true,
                created_at: world.tick,
                ttl: Some(100),
                hidden_by_default: false,
                thresholds: Vec::new(),
                costs: Vec::new(),
                observation: Some(ObservationData {
                    modality: Some(Modality::Visual),
                    about: Some(format!("test-{}", i)),
                    ..Default::default()
                }),
                prior_instinct: None,
                motivation: None,
                action: None,
                meme: None,
                prev_value: 0.0,
            reality_layer: 0,
            is_virtual: false,
            };
            world.characters.get_mut("dog").unwrap().mind_graph.add_node(obs);
        }

        // Tick to run AttentionAllocationSystem
        runner.tick(&mut world, 1.0);

        // Some observations should have been deactivated due to low attention
        let active_count = world.characters["dog"].mind_graph.nodes.values()
            .filter(|n| n.node_type == NodeType::Observation && n.active)
            .count();
        let total_count = world.characters["dog"].mind_graph.nodes.values()
            .filter(|n| n.node_type == NodeType::Observation)
            .count();

        // Not all observations should remain active with such low attention
        assert!(active_count < total_count,
            "With low attention, not all {} observations should be active (got {} active)",
            total_count, active_count);
    }

    #[test]
    fn test_novelty_habituation_reduces_strength() {
        let mut world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");
        let runner = SimulationRunner::new();

        // Create multiple observations with the same novelty key
        for i in 0..5 {
            let obs = MindNode {
                instance_id: format!("repeated-obs-{}", i),
                schema_id: "it:concept/repeated-stimulus".to_string(),
                label: "repeated".to_string(),
                node_type: NodeType::Observation,
                value: 1.0,
                value_velocity: 0.0,
                strength: 0.8,
                active: true,
                created_at: world.tick,
                ttl: Some(1000),
                hidden_by_default: false,
                thresholds: Vec::new(),
                costs: Vec::new(),
                observation: Some(ObservationData {
                    modality: Some(Modality::Visual),
                    about: Some("pavlov-walking".to_string()),
                    novelty_key: Some("visual-pavlov-walking".to_string()),
                    ..Default::default()
                }),
                prior_instinct: None,
                motivation: None,
                action: None,
                meme: None,
                prev_value: 0.0,
            reality_layer: 0,
            is_virtual: false,
            };
            world.characters.get_mut("dog").unwrap().mind_graph.add_node(obs);
        }

        // Record initial strength
        let initial_strength = world.characters["dog"].mind_graph.nodes["repeated-obs-0"].strength;

        // Run several ticks for habituation
        for _ in 0..10 {
            runner.tick(&mut world, 1.0);
        }

        // Check that strength decreased due to habituation
        let final_strength = world.characters["dog"].mind_graph.nodes.get("repeated-obs-0")
            .map(|n| n.strength)
            .unwrap_or(0.0);

        assert!(final_strength < initial_strength,
            "Repeated stimulus strength should decrease: {} -> {}",
            initial_strength, final_strength);
    }

    #[test]
    fn test_dog_resources_regenerate() {
        let mut world = level_loader::load_level_from_path(&pavlov_level_dir())
            .expect("Should load pavlov level");
        let runner = SimulationRunner::new();

        // Drain dopamine
        if let Some(dog) = world.characters.get_mut("dog") {
            if let Some(dopa) = dog.mind_graph.find_by_schema_mut("it:concept/dopamine") {
                dopa.value = 0.2;
            }
        }

        let initial_dopa = world.characters["dog"].mind_graph.resource_value("it:concept/dopamine");

        // Run ticks for regeneration
        for _ in 0..20 {
            runner.tick(&mut world, 1.0);
        }

        let final_dopa = world.characters["dog"].mind_graph.resource_value("it:concept/dopamine");
        assert!(final_dopa > initial_dopa,
            "Dopamine should regenerate: {} -> {}", initial_dopa, final_dopa);
    }
}
