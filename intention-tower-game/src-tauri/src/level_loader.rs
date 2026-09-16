use crate::models::commands::*;
use crate::models::economy::{EconomyAsset, EconomyState};
use crate::models::mind_graph::MindGraph;
use crate::models::mind_node::*;
use crate::models::progress::{FailureRule, LevelCondition, LevelProgress, ObjectiveState};
use crate::models::world_state::{Position, WorldCharacter, WorldItem, WorldState};
use serde::Deserialize;

/// Errors during level loading
#[derive(Debug)]
pub enum LoadError {
    Io(std::io::Error),
    Json(serde_json::Error),
    NotFound(String),
}

impl std::fmt::Display for LoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoadError::Io(e) => write!(f, "IO error: {}", e),
            LoadError::Json(e) => write!(f, "JSON parse error: {}", e),
            LoadError::NotFound(s) => write!(f, "Not found: {}", s),
        }
    }
}

// ── JSON-LD Intermediate Representations ──

#[derive(Deserialize, Debug)]
struct LevelJson {
    #[serde(rename = "@id")]
    id: String,
    label: Option<String>,
    comment: Option<String>,
    characters: Vec<CharacterJson>,
    items: Option<Vec<ItemJson>>,
    #[serde(rename = "initialMode")]
    initial_mode: Option<String>,
    objectives: Option<Vec<String>>,
    #[serde(rename = "objectiveRules", default)]
    objective_rules: Vec<ObjectiveRuleJson>,
    #[serde(rename = "failureRules", default)]
    failure_rules: Vec<FailureRuleJson>,
    #[serde(rename = "defaultActorId")]
    default_actor_id: Option<String>,
    #[serde(rename = "defaultTargetId")]
    default_target_id: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ObjectiveRuleJson {
    #[serde(rename = "objectiveId")]
    objective_id: String,
    label: String,
    #[serde(default = "default_true")]
    required: bool,
    condition: LevelCondition,
}

#[derive(Deserialize, Debug)]
struct FailureRuleJson {
    #[serde(rename = "ruleId")]
    rule_id: String,
    label: String,
    condition: LevelCondition,
}

const fn default_true() -> bool {
    true
}

#[derive(Deserialize, Debug)]
struct CharacterJson {
    #[serde(rename = "@id")]
    id: String,
    #[serde(rename = "@type")]
    _type: Option<String>,
    label: Option<String>,
    position: Option<PositionJson>,
    #[serde(rename = "mindGraphRef")]
    mind_graph_ref: Option<String>,
}

#[derive(Deserialize, Debug)]
struct ItemJson {
    #[serde(rename = "@id")]
    id: String,
    #[serde(
        rename = "@type",
        deserialize_with = "deserialize_string_or_array",
        default
    )]
    type_: Option<String>,
    label: Option<String>,
    position: Option<PositionJson>,
    #[serde(rename = "it:abstractType")]
    abstract_type: Option<String>,
    #[serde(rename = "ownerId")]
    owner_id: Option<String>,
    quantity: Option<f64>,
    #[serde(rename = "unitPrice")]
    unit_price: Option<f64>,
}

/// Deserialize a field that may be a single string or an array of strings.
/// If array, joins them with ", ".
fn deserialize_string_or_array<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct StringOrArray;
    impl<'de> de::Visitor<'de> for StringOrArray {
        type Value = Option<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or an array of strings")
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
            Ok(Some(v))
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut parts = Vec::new();
            while let Some(s) = seq.next_element::<String>()? {
                parts.push(s);
            }
            if parts.is_empty() {
                Ok(None)
            } else {
                Ok(Some(parts.join(", ")))
            }
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
    }

    deserializer.deserialize_any(StringOrArray)
}

#[derive(Deserialize, Debug)]
struct PositionJson {
    x: f64,
    y: f64,
}

#[derive(Deserialize, Debug)]
struct MindGraphJson {
    #[serde(rename = "belongsToCharacter")]
    _belongs_to_character: Option<String>,
    nodes: Vec<NodeJson>,
    edges: Option<Vec<EdgeJson>>,
}

#[derive(Deserialize, Debug)]
struct NodeJson {
    #[serde(rename = "instanceId")]
    instance_id: String,
    #[serde(rename = "schemaId")]
    schema_id: String,
    #[serde(rename = "nodeType")]
    node_type: String,
    value: Option<f64>,
    #[serde(rename = "valueVelocity")]
    value_velocity: Option<f64>,
    strength: Option<f64>,
    active: Option<bool>,
    thresholds: Option<Vec<ThresholdJson>>,
    label: Option<String>,
    ttl: Option<u64>,
    #[serde(rename = "hiddenByDefault")]
    hidden_by_default: Option<bool>,
    #[serde(rename = "realityLayer")]
    reality_layer: Option<u8>,
    #[serde(rename = "isVirtual")]
    is_virtual: Option<bool>,

    // Type-specific fields
    #[serde(rename = "it:priorInstinct")]
    prior_instinct: Option<PriorInstinctJson>,
    #[serde(rename = "it:action")]
    action: Option<ActionJson>,
    #[serde(rename = "it:observation")]
    observation: Option<ObservationJson>,
    #[serde(rename = "it:motivation")]
    motivation: Option<MotivationJson>,
    #[serde(rename = "it:meme")]
    meme: Option<MemeJson>,
}

#[derive(Deserialize, Debug)]
struct ThresholdJson {
    #[serde(rename = "triggerId")]
    trigger_id: String,
    #[serde(rename = "spawnSchemaId")]
    spawn_schema_id: String,
    #[serde(rename = "spawnNodeType")]
    spawn_node_type: String,
    #[serde(rename = "activateOnRisingAbove")]
    activate_on_rising_above: f64,
    #[serde(rename = "deactivateOnFallingBelow")]
    deactivate_on_falling_below: f64,
}

#[derive(Deserialize, Debug)]
struct PriorInstinctJson {
    #[serde(rename = "setPoint")]
    set_point: Option<f64>,
    #[serde(rename = "brainRegion")]
    brain_region: Option<String>,
    #[serde(rename = "satisfiedByAbout")]
    satisfied_by_about: Option<Vec<String>>,
    #[serde(rename = "overridableByMeme")]
    overridable_by_meme: Option<bool>,
    #[serde(rename = "isResource")]
    is_resource: Option<bool>,
    #[serde(rename = "isMood")]
    is_mood: Option<bool>,
}

#[derive(Deserialize, Debug)]
struct ActionJson {
    innate: Option<bool>,
    goap: Option<bool>,
    #[serde(rename = "proficiencyLevel")]
    proficiency_level: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct ObservationJson {
    modality: Option<String>,
    about: Option<String>,
    #[serde(rename = "noveltyKey")]
    novelty_key: Option<String>,
    credibility: Option<f64>,
    satisfaction: Option<f64>,
    source: Option<String>,
}

#[derive(Deserialize, Debug)]
struct MotivationJson {
    #[serde(rename = "lookbackWindowSec")]
    lookback_window_sec: Option<f64>,
    goal: Option<String>,
    #[serde(rename = "isChained")]
    is_chained: Option<bool>,
    #[serde(rename = "chainTarget")]
    chain_target: Option<String>,
    #[serde(rename = "targetEntity")]
    target_entity: Option<String>,
    #[serde(rename = "criticalPeriodEnd")]
    critical_period_end: Option<u64>,
}

#[derive(Deserialize, Debug)]
struct MemeJson {
    #[serde(rename = "bindingSites")]
    binding_sites: Option<Vec<String>>,
    #[serde(rename = "isBelief")]
    is_belief: Option<bool>,
    #[serde(rename = "isIdentity")]
    is_identity: Option<bool>,
    #[serde(rename = "isAttentionFlood")]
    is_attention_flood: Option<bool>,
    #[serde(rename = "isAntiMeme")]
    is_anti_meme: Option<bool>,
    #[serde(rename = "isMagic")]
    is_magic: Option<bool>,
    #[serde(rename = "overridesInstinct")]
    overrides_instinct: Option<Vec<String>>,
    #[serde(rename = "groupId")]
    group_id: Option<String>,
    #[serde(rename = "conflictResolution")]
    conflict_resolution: Option<String>,
    resilience: Option<f64>,
    #[serde(rename = "floodNodeCount")]
    flood_node_count: Option<u32>,
    #[serde(rename = "floodDrainRatePerTick")]
    flood_drain_rate_per_tick: Option<f64>,
    #[serde(rename = "antiMemeTargetPattern")]
    anti_meme_target_pattern: Option<String>,
}

#[derive(Deserialize, Debug)]
struct EdgeJson {
    #[serde(rename = "edgeId")]
    edge_id: String,
    #[serde(rename = "sourceInstanceId")]
    source_instance_id: String,
    #[serde(rename = "targetInstanceId")]
    target_instance_id: String,
    polarity: String,
    weight: f64,
    learnable: Option<bool>,
    #[serde(rename = "decayRatePerTick")]
    decay_rate_per_tick: Option<f64>,
    #[serde(rename = "learnType")]
    learn_type: Option<String>,
    evidence: Option<EvidenceJson>,
}

#[derive(Deserialize, Debug)]
struct EvidenceJson {
    #[serde(rename = "coOccurrenceCount")]
    co_occurrence_count: Option<u32>,
    #[serde(rename = "lastCoOccurredAt")]
    last_co_occurred_at: Option<u64>,
    #[serde(rename = "windowSec")]
    window_sec: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct CommandsJson {
    commands: Vec<CommandDefJson>,
}

#[derive(Deserialize, Debug)]
struct CommandDefJson {
    #[serde(rename = "commandId")]
    command_id: String,
    label: Option<String>,
    hotkey: Option<String>,
    targeting: Option<String>,
    preconditions: Option<Vec<PreconditionJson>>,
    effects: Vec<EffectJson>,
}

#[derive(Deserialize, Debug)]
struct PreconditionJson {
    #[serde(rename = "type")]
    type_: String,
    #[serde(rename = "itemSchemaId")]
    item_schema_id: Option<String>,
    #[serde(rename = "schemaId")]
    schema_id: Option<String>,
    #[serde(rename = "resourceSchemaId")]
    resource_schema_id: Option<String>,
    op: Option<String>,
    threshold: Option<f64>,
    value: Option<bool>,
}

#[derive(Deserialize, Debug)]
struct EffectJson {
    #[serde(rename = "type")]
    type_: String,
    #[serde(rename = "schemaId")]
    schema_id: Option<String>,
    modality: Option<String>,
    about: Option<String>,
    ttl: Option<u64>,
    strength: Option<f64>,
    delta: Option<f64>,
    #[serde(rename = "targetCharacterId")]
    target_character_id: Option<String>,
    #[serde(rename = "resourceSchemaId")]
    resource_schema_id: Option<String>,
    amount: Option<f64>,
    #[serde(rename = "sourceSchemaId")]
    source_schema_id: Option<String>,
    #[serde(rename = "targetSchemaId")]
    target_schema_id: Option<String>,
    #[serde(rename = "characterId")]
    character_id: Option<String>,
    #[serde(rename = "memeSchemaId")]
    meme_schema_id: Option<String>,
    meme: Option<MemeJson>,
    #[serde(rename = "newRegenRate")]
    new_regen_rate: Option<f64>,
    value: Option<bool>,
    #[serde(rename = "itemId")]
    item_id: Option<String>,
    #[serde(rename = "unitPrice")]
    unit_price: Option<f64>,
    #[serde(rename = "buyerId")]
    buyer_id: Option<String>,
    #[serde(rename = "sellerId")]
    seller_id: Option<String>,
    quantity: Option<f64>,
}

// ── Loading Implementation ──

/// Load a level from Tauri's asset resolver (bundled assets).
#[cfg(feature = "desktop")]
pub fn load_level_from_assets(
    level_id: &str,
    app: &tauri::AppHandle,
) -> Result<WorldState, LoadError> {
    use tauri::Manager;

    let base_path = app
        .path()
        .resource_dir()
        .map_err(|_| LoadError::NotFound("Could not find resource directory".to_string()))?;
    let level_dir = base_path.join("assets").join("levels").join(level_id);

    let level_path = level_dir.join("level.jsonld");
    let level_text = std::fs::read_to_string(&level_path).map_err(LoadError::Io)?;

    let level_json: LevelJson = serde_json::from_str(&level_text).map_err(LoadError::Json)?;

    let mut world = WorldState::new(42);

    // Load characters
    for char_json in &level_json.characters {
        let pos = char_json.position.as_ref();
        let char_id = extract_local_id(&char_json.id);

        // Load mind graph if referenced
        let mind_graph = if let Some(ref mg_ref) = char_json.mind_graph_ref {
            // Derive filename from mindGraphRef: extract last segment + ".jsonld"
            let mg_local = extract_local_id(mg_ref);
            let mg_filename = format!("{}.jsonld", mg_local);
            let mg_path = level_dir.join(&mg_filename);
            if mg_path.exists() {
                let mg_text = std::fs::read_to_string(&mg_path).map_err(LoadError::Io)?;
                let mg_json: MindGraphJson =
                    serde_json::from_str(&mg_text).map_err(LoadError::Json)?;
                parse_mind_graph(&char_id, &mg_json)
            } else {
                // Fallback: try {char_id}-mind.jsonld for backwards compatibility
                let fallback_filename = format!("{}-mind.jsonld", char_id);
                let fallback_path = level_dir.join(&fallback_filename);
                if fallback_path.exists() {
                    let mg_text = std::fs::read_to_string(&fallback_path).map_err(LoadError::Io)?;
                    let mg_json: MindGraphJson =
                        serde_json::from_str(&mg_text).map_err(LoadError::Json)?;
                    parse_mind_graph(&char_id, &mg_json)
                } else {
                    MindGraph::new(char_id.clone())
                }
            }
        } else {
            MindGraph::new(char_id.clone())
        };

        let character = WorldCharacter {
            id: char_id.clone(),
            label: char_json.label.clone().unwrap_or_default(),
            position: Position {
                x: pos.map_or(0.0, |p| p.x),
                y: pos.map_or(0.0, |p| p.y),
            },
            mind_graph,
        };
        world.characters.insert(char_id, character);
    }

    // Load items
    if let Some(items) = &level_json.items {
        for item_json in items {
            let item_id = extract_local_id(&item_json.id);
            let pos = item_json.position.as_ref();
            let item = WorldItem {
                id: item_id.clone(),
                schema_type: item_json.type_.clone().unwrap_or_default(),
                label: item_json.label.clone().unwrap_or_default(),
                position: Position {
                    x: pos.map_or(0.0, |p| p.x),
                    y: pos.map_or(0.0, |p| p.y),
                },
                abstract_type: item_json.abstract_type.clone(),
                owner_id: item_json.owner_id.as_deref().map(extract_local_id),
                quantity: item_json.quantity.unwrap_or(0.0).max(0.0),
                unit_price: item_json.unit_price.unwrap_or(1.0).max(0.0),
            };
            world.items.insert(item_id, item);
        }
    }

    // Load commands
    let commands_path = level_dir.join("commands.jsonld");
    if commands_path.exists() {
        let cmd_text = std::fs::read_to_string(&commands_path).map_err(LoadError::Io)?;
        let cmd_json: CommandsJson = serde_json::from_str(&cmd_text).map_err(LoadError::Json)?;
        world.command_defs = parse_command_defs(&cmd_json);
    }

    apply_level_metadata(&mut world, &level_json);

    Ok(world)
}

/// Load a level from a filesystem path (for testing without Tauri runtime).
pub fn load_level_from_path(level_dir: &std::path::Path) -> Result<WorldState, LoadError> {
    let level_path = level_dir.join("level.jsonld");
    let level_text = std::fs::read_to_string(&level_path).map_err(LoadError::Io)?;
    let level_json: LevelJson = serde_json::from_str(&level_text).map_err(LoadError::Json)?;

    let mut world = WorldState::new(42);

    for char_json in &level_json.characters {
        let pos = char_json.position.as_ref();
        let char_id = extract_local_id(&char_json.id);

        let mind_graph = if let Some(ref mg_ref) = char_json.mind_graph_ref {
            let mg_local = extract_local_id(mg_ref);
            let mg_filename = format!("{}.jsonld", mg_local);
            let mg_path = level_dir.join(&mg_filename);
            if mg_path.exists() {
                let mg_text = std::fs::read_to_string(&mg_path).map_err(LoadError::Io)?;
                let mg_json: MindGraphJson =
                    serde_json::from_str(&mg_text).map_err(LoadError::Json)?;
                parse_mind_graph(&char_id, &mg_json)
            } else {
                let fallback_filename = format!("{}-mind.jsonld", char_id);
                let fallback_path = level_dir.join(&fallback_filename);
                if fallback_path.exists() {
                    let mg_text = std::fs::read_to_string(&fallback_path).map_err(LoadError::Io)?;
                    let mg_json: MindGraphJson =
                        serde_json::from_str(&mg_text).map_err(LoadError::Json)?;
                    parse_mind_graph(&char_id, &mg_json)
                } else {
                    MindGraph::new(char_id.clone())
                }
            }
        } else {
            MindGraph::new(char_id.clone())
        };

        let character = WorldCharacter {
            id: char_id.clone(),
            label: char_json.label.clone().unwrap_or_default(),
            position: Position {
                x: pos.map_or(0.0, |p| p.x),
                y: pos.map_or(0.0, |p| p.y),
            },
            mind_graph,
        };
        world.characters.insert(char_id, character);
    }

    if let Some(items) = &level_json.items {
        for item_json in items {
            let item_id = extract_local_id(&item_json.id);
            let pos = item_json.position.as_ref();
            let item = WorldItem {
                id: item_id.clone(),
                schema_type: item_json.type_.clone().unwrap_or_default(),
                label: item_json.label.clone().unwrap_or_default(),
                position: Position {
                    x: pos.map_or(0.0, |p| p.x),
                    y: pos.map_or(0.0, |p| p.y),
                },
                abstract_type: item_json.abstract_type.clone(),
                owner_id: item_json.owner_id.as_deref().map(extract_local_id),
                quantity: item_json.quantity.unwrap_or(0.0).max(0.0),
                unit_price: item_json.unit_price.unwrap_or(1.0).max(0.0),
            };
            world.items.insert(item_id, item);
        }
    }

    let commands_path = level_dir.join("commands.jsonld");
    if commands_path.exists() {
        let cmd_text = std::fs::read_to_string(&commands_path).map_err(LoadError::Io)?;
        let cmd_json: CommandsJson = serde_json::from_str(&cmd_text).map_err(LoadError::Json)?;
        world.command_defs = parse_command_defs(&cmd_json);
    }

    apply_level_metadata(&mut world, &level_json);

    Ok(world)
}

// ── Parse Helpers ──

fn extract_local_id(full_id: &str) -> String {
    // "it:entity/dog" → "dog", "it:level/pavlov/dog-mind" → "dog-mind"
    full_id.rsplit('/').next().unwrap_or(full_id).to_string()
}

fn apply_level_metadata(world: &mut WorldState, level: &LevelJson) {
    world.level_id = extract_local_id(&level.id);
    world.level_label = level.label.clone().unwrap_or_default();
    world.level_description = level.comment.clone().unwrap_or_default();
    world.initial_mode = level
        .initial_mode
        .clone()
        .unwrap_or_else(|| "observe".to_string());

    let ordered_character_ids: Vec<String> = level
        .characters
        .iter()
        .map(|character| extract_local_id(&character.id))
        .collect();
    world.default_actor_id = level
        .default_actor_id
        .as_deref()
        .map(extract_local_id)
        .or_else(|| ordered_character_ids.first().cloned());
    world.default_target_id = level
        .default_target_id
        .as_deref()
        .map(extract_local_id)
        .or_else(|| ordered_character_ids.get(1).cloned())
        .or_else(|| ordered_character_ids.first().cloned());

    let objectives = if level.objective_rules.is_empty() {
        // Backward-compatible migration: every legacy objective is associated with
        // the command in the same position. Content can opt into richer predicates
        // by declaring objectiveRules in level.jsonld.
        level
            .objectives
            .clone()
            .unwrap_or_default()
            .into_iter()
            .enumerate()
            .filter_map(|(index, label)| {
                let command = world
                    .command_defs
                    .get(index)
                    .or_else(|| world.command_defs.last())?;
                Some(ObjectiveState {
                    objective_id: format!("objective-{}", index),
                    label,
                    condition: LevelCondition::CommandUsed {
                        command_id: command.command_id.clone(),
                        min_count: 1,
                        distinct_targets: 0,
                    },
                    required: true,
                    completed: false,
                    completed_at_tick: None,
                })
            })
            .collect()
    } else {
        level
            .objective_rules
            .iter()
            .map(|rule| ObjectiveState {
                objective_id: rule.objective_id.clone(),
                label: rule.label.clone(),
                condition: rule.condition.clone(),
                required: rule.required,
                completed: false,
                completed_at_tick: None,
            })
            .collect()
    };

    world.progress = LevelProgress {
        objectives,
        failure_rules: level
            .failure_rules
            .iter()
            .map(|rule| FailureRule {
                rule_id: rule.rule_id.clone(),
                label: rule.label.clone(),
                condition: rule.condition.clone(),
            })
            .collect(),
        ..LevelProgress::default()
    };
    initialize_economy(world);
}

fn initialize_economy(world: &mut WorldState) {
    let mut economy = EconomyState::default();
    for character_id in world.characters.keys() {
        economy.accounts.insert(character_id.clone(), 100.0);
        economy.holdings.entry(character_id.clone()).or_default();
    }
    for item in world.items.values() {
        if item.quantity <= 0.0 {
            continue;
        }
        economy.assets.insert(
            item.id.clone(),
            EconomyAsset {
                item_id: item.id.clone(),
                owner_id: item.owner_id.clone(),
                supply: item.quantity,
                unit_price: item.unit_price,
                demand: 0.0,
            },
        );
        if let Some(owner_id) = &item.owner_id {
            *economy
                .holdings
                .entry(owner_id.clone())
                .or_default()
                .entry(item.id.clone())
                .or_default() += item.quantity;
        }
    }
    world.economy = economy;
}

fn parse_node_type(s: &str) -> NodeType {
    match s {
        "Observation" => NodeType::Observation,
        "PriorInstinct" => NodeType::PriorInstinct,
        "Motivation" => NodeType::Motivation,
        "Action" => NodeType::Action,
        "Meme" => NodeType::Meme,
        _ => NodeType::Observation,
    }
}

fn parse_modality(s: &str) -> Modality {
    match s {
        "Visual" => Modality::Visual,
        "Auditory" => Modality::Auditory,
        "Olfactory" => Modality::Olfactory,
        "Gustatory" => Modality::Gustatory,
        "Tactile" => Modality::Tactile,
        "Interoceptive" => Modality::Interoceptive,
        "Chemical" => Modality::Chemical,
        "Social" => Modality::Social,
        _ => Modality::Visual,
    }
}

fn parse_polarity(s: &str) -> Polarity {
    match s {
        "Inhibitory" => Polarity::Inhibitory,
        _ => Polarity::Excitatory,
    }
}

fn parse_learn_type(s: &str) -> LearnType {
    match s {
        "Classical" => LearnType::Classical,
        "Operant" => LearnType::Operant,
        "Imprinting" => LearnType::Imprinting,
        "Social" => LearnType::Social,
        "DirectInjection" => LearnType::DirectInjection,
        "MemeInfection" => LearnType::MemeInfection,
        "InnerCut" => LearnType::InnerCut,
        _ => LearnType::Classical,
    }
}

fn parse_brain_region(s: &str) -> BrainRegion {
    match s {
        "Brainstem" => BrainRegion::Brainstem,
        "Hypothalamus" => BrainRegion::Hypothalamus,
        "Limbic" => BrainRegion::Limbic,
        "PFC" => BrainRegion::Pfc,
        _ => BrainRegion::Limbic,
    }
}

fn parse_conflict_resolution(s: &str) -> Option<ConflictResolution> {
    match s {
        "BeliefWins" => Some(ConflictResolution::BeliefWins),
        "InstinctWins" => Some(ConflictResolution::InstinctWins),
        "StressDependent" => Some(ConflictResolution::StressDependent),
        _ => None,
    }
}

fn parse_observation_source(s: &str) -> ObservationSource {
    match s {
        "Environment" => ObservationSource::Environment,
        "Body" => ObservationSource::Body,
        "Virtual" => ObservationSource::Virtual,
        "Implant" => ObservationSource::Implant,
        "Chemical" => ObservationSource::Chemical,
        _ => ObservationSource::Environment,
    }
}

fn parse_mind_graph(char_id: &str, mg: &MindGraphJson) -> MindGraph {
    let mut graph = MindGraph::new(char_id.to_string());

    for node_json in &mg.nodes {
        let node_type = parse_node_type(&node_json.node_type);

        let thresholds: Vec<ThresholdTrigger> = node_json
            .thresholds
            .as_ref()
            .map(|ts| {
                ts.iter()
                    .map(|t| ThresholdTrigger {
                        trigger_id: t.trigger_id.clone(),
                        spawn_schema_id: t.spawn_schema_id.clone(),
                        spawn_node_type: parse_node_type(&t.spawn_node_type),
                        activate_on_rising_above: t.activate_on_rising_above,
                        deactivate_on_falling_below: t.deactivate_on_falling_below,
                        managed_instance_id: None,
                    })
                    .collect()
            })
            .unwrap_or_default();

        let prior_instinct = node_json
            .prior_instinct
            .as_ref()
            .map(|pi| PriorInstinctData {
                set_point: pi.set_point.unwrap_or(0.0),
                satisfied_by_about: pi.satisfied_by_about.clone().unwrap_or_default(),
                brain_region: pi.brain_region.as_deref().map(parse_brain_region),
                overridable_by_meme: pi.overridable_by_meme.unwrap_or(false),
                threshold_modifiers: Vec::new(),
                is_mood: pi.is_mood.unwrap_or(false),
                valence: None,
                arousal: None,
                is_resource: pi.is_resource.unwrap_or(false),
            });

        let action = node_json.action.as_ref().map(|a| ActionData {
            innate: a.innate.unwrap_or(false),
            goap: a.goap.unwrap_or(false),
            sub_action_schemas: Vec::new(),
            proficiency_level: a.proficiency_level.unwrap_or(0.0),
            selected: false,
        });

        let observation = node_json.observation.as_ref().map(|o| ObservationData {
            modality: o.modality.as_deref().map(parse_modality),
            about: o.about.clone(),
            novelty_key: o.novelty_key.clone(),
            credibility: o.credibility.unwrap_or(1.0),
            satisfaction: o.satisfaction.unwrap_or(0.0),
            source: o.source.as_deref().map(parse_observation_source),
            ..Default::default()
        });

        let motivation = node_json.motivation.as_ref().map(|m| MotivationData {
            spawned_by: None,
            lookback_window_sec: m.lookback_window_sec.unwrap_or(10.0),
            goal: m.goal.clone(),
            is_chained: m.is_chained.unwrap_or(false),
            chain_target: m.chain_target.clone(),
            target_entity: m.target_entity.clone(),
            critical_period_end: m.critical_period_end,
            is_persistent: false,
            suppressed_by: Vec::new(),
        });

        let meme = node_json.meme.as_ref().map(parse_meme_data);

        let value = node_json.value.unwrap_or(0.0);
        let node = MindNode {
            instance_id: node_json.instance_id.clone(),
            schema_id: node_json.schema_id.clone(),
            label: node_json
                .label
                .clone()
                .unwrap_or_else(|| node_json.schema_id.clone()),
            node_type,
            value,
            value_velocity: node_json.value_velocity.unwrap_or(0.0),
            strength: node_json.strength.unwrap_or(0.5),
            active: node_json.active.unwrap_or(true),
            attended: true,
            suppression: 0.0,
            created_at: 0,
            ttl: node_json.ttl,
            hidden_by_default: node_json.hidden_by_default.unwrap_or(false),
            thresholds,
            costs: Vec::new(),
            observation,
            prior_instinct,
            motivation,
            action,
            meme,
            prev_value: value,
            reality_layer: node_json.reality_layer.unwrap_or(0),
            is_virtual: node_json.is_virtual.unwrap_or(false),
        };

        graph.add_node(node);
    }

    // Load edges
    if let Some(edges) = &mg.edges {
        for edge_json in edges {
            let edge = AssociationEdge {
                edge_id: edge_json.edge_id.clone(),
                source_instance_id: edge_json.source_instance_id.clone(),
                target_instance_id: edge_json.target_instance_id.clone(),
                polarity: parse_polarity(&edge_json.polarity),
                weight: edge_json.weight,
                learnable: edge_json.learnable.unwrap_or(false),
                decay_rate_per_tick: edge_json.decay_rate_per_tick.unwrap_or(0.0),
                learn_type: edge_json
                    .learn_type
                    .as_deref()
                    .map(parse_learn_type)
                    .unwrap_or(LearnType::Classical),
                evidence: Evidence {
                    co_occurrence_count: edge_json
                        .evidence
                        .as_ref()
                        .and_then(|e| e.co_occurrence_count)
                        .unwrap_or(0),
                    last_co_occurred_at: edge_json
                        .evidence
                        .as_ref()
                        .and_then(|e| e.last_co_occurred_at)
                        .unwrap_or(0),
                    window_sec: edge_json
                        .evidence
                        .as_ref()
                        .and_then(|e| e.window_sec)
                        .unwrap_or(10.0),
                },
            };
            graph.add_edge(edge);
        }
    }

    graph
}

fn parse_command_defs(cmd_json: &CommandsJson) -> Vec<CommandDef> {
    cmd_json
        .commands
        .iter()
        .map(|cd| {
            let preconditions = cd
                .preconditions
                .as_ref()
                .map(|pres| pres.iter().filter_map(parse_precondition).collect())
                .unwrap_or_default();

            let effect_templates = cd.effects.iter().filter_map(parse_effect).collect();

            let targeting = match cd.targeting.as_deref() {
                Some("RequiresTarget") => TargetingMode::RequiresTarget,
                Some("NoTarget") => TargetingMode::NoTarget,
                Some("OptionalTarget") => TargetingMode::OptionalTarget,
                _ => TargetingMode::NoTarget,
            };

            CommandDef {
                command_id: cd.command_id.clone(),
                label: cd.label.clone().unwrap_or_default(),
                hotkey: cd.hotkey.clone(),
                targeting,
                preconditions,
                effect_templates,
            }
        })
        .collect()
}

fn parse_precondition(p: &PreconditionJson) -> Option<Precondition> {
    match p.type_.as_str() {
        "EnvHasItem" => Some(Precondition::EnvHasItem {
            item_schema_id: p.item_schema_id.clone()?,
        }),
        "TargetHasNode" => Some(Precondition::TargetHasNode {
            schema_id: p.schema_id.clone()?,
        }),
        "TargetNodeActive" => Some(Precondition::TargetNodeActive {
            schema_id: p.schema_id.clone()?,
        }),
        "TargetNodeValue" => Some(Precondition::TargetNodeValue {
            schema_id: p.schema_id.clone()?,
            op: parse_compare_op(p.op.as_deref().unwrap_or("GTE")),
            threshold: p.threshold.unwrap_or(0.0),
        }),
        "ActorResource" => Some(Precondition::ActorResource {
            resource_schema_id: p.resource_schema_id.clone()?,
            op: parse_compare_op(p.op.as_deref().unwrap_or("GTE")),
            threshold: p.threshold.unwrap_or(0.0),
        }),
        "IsVirtualContext" => Some(Precondition::IsVirtualContext {
            value: p.value.unwrap_or(false),
        }),
        _ => None,
    }
}

fn parse_compare_op(s: &str) -> CompareOp {
    match s {
        "GT" => CompareOp::GT,
        "LT" => CompareOp::LT,
        "GTE" => CompareOp::GTE,
        "LTE" => CompareOp::LTE,
        "EQ" => CompareOp::EQ,
        _ => CompareOp::GTE,
    }
}

fn parse_effect(e: &EffectJson) -> Option<CommandEffect> {
    match e.type_.as_str() {
        "SpawnObservation" => Some(CommandEffect::SpawnObservation {
            schema_id: e.schema_id.clone()?,
            modality: parse_modality(e.modality.as_deref().unwrap_or("Visual")),
            about: e.about.clone()?,
            ttl: e.ttl.unwrap_or(300),
            strength: e.strength.unwrap_or(0.5),
            target_character_id: e.target_character_id.clone(),
        }),
        "ModifyNodeValue" => Some(CommandEffect::ModifyNodeValue {
            schema_id: e.schema_id.clone()?,
            delta: e.delta.unwrap_or(0.0),
            target_character_id: e.target_character_id.clone(),
        }),
        "ConsumeResource" => Some(CommandEffect::ConsumeResource {
            resource_schema_id: e.resource_schema_id.clone()?,
            amount: e.amount.unwrap_or(0.0),
            target_character_id: e.target_character_id.clone(),
        }),
        "ReinforceEdge" => Some(CommandEffect::ReinforceEdge {
            source_schema_id: e.source_schema_id.clone()?,
            target_schema_id: e.target_schema_id.clone()?,
            delta: e.delta.unwrap_or(0.1),
            character_id: e.character_id.clone(),
        }),
        "WeakenEdge" => Some(CommandEffect::WeakenEdge {
            source_schema_id: e.source_schema_id.clone()?,
            target_schema_id: e.target_schema_id.clone()?,
            delta: e.delta.unwrap_or(0.1),
            character_id: e.character_id.clone(),
        }),
        "InjectMeme" => Some(CommandEffect::InjectMeme {
            meme_schema_id: e.meme_schema_id.clone()?,
            target_character_id: e.target_character_id.clone(),
            meme: e.meme.as_ref().map(parse_meme_data).unwrap_or_default(),
        }),
        "DeleteNode" => Some(CommandEffect::DeleteNode {
            schema_id: e.schema_id.clone()?,
            target_character_id: e.target_character_id.clone(),
        }),
        "ModifyResourceRegen" => Some(CommandEffect::ModifyResourceRegen {
            resource_schema_id: e.resource_schema_id.clone()?,
            new_regen_rate: e.new_regen_rate.unwrap_or(0.0),
            target_character_id: e.target_character_id.clone(),
        }),
        "SetVirtualContext" => Some(CommandEffect::SetVirtualContext {
            value: e.value.unwrap_or(false),
        }),
        "SetAssetPrice" => Some(CommandEffect::SetAssetPrice {
            item_id: e.item_id.as_deref().map(extract_local_id)?,
            unit_price: e.unit_price.unwrap_or(1.0).max(0.0),
        }),
        "TradeAsset" => Some(CommandEffect::TradeAsset {
            item_id: e.item_id.as_deref().map(extract_local_id)?,
            buyer_id: e.buyer_id.clone().unwrap_or_else(|| "__target".to_owned()),
            seller_id: e.seller_id.clone().unwrap_or_else(|| "__actor".to_owned()),
            quantity: e.quantity.unwrap_or(1.0).max(0.0),
        }),
        _ => None,
    }
}

fn parse_meme_data(meme: &MemeJson) -> MemeData {
    MemeData {
        binding_sites: meme.binding_sites.clone().unwrap_or_default(),
        is_belief: meme.is_belief.unwrap_or(false),
        is_identity: meme.is_identity.unwrap_or(false),
        is_attention_flood: meme.is_attention_flood.unwrap_or(false),
        is_anti_meme: meme.is_anti_meme.unwrap_or(false),
        is_magic: meme.is_magic.unwrap_or(false),
        overrides_instinct: meme.overrides_instinct.clone().unwrap_or_default(),
        group_id: meme.group_id.clone(),
        conflict_resolution: meme
            .conflict_resolution
            .as_deref()
            .and_then(parse_conflict_resolution),
        resilience: meme.resilience.unwrap_or(0.0),
        flood_node_count: meme.flood_node_count,
        flood_drain_rate_per_tick: meme.flood_drain_rate_per_tick,
        anti_meme_target_pattern: meme.anti_meme_target_pattern.clone(),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::events::WorldEvent;
    use std::path::PathBuf;

    fn assets_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("assets")
            .join("levels")
    }

    #[test]
    fn test_load_pavlov_level() {
        let level_dir = assets_dir().join("pavlov");
        let world = load_level_from_path(&level_dir).expect("Should load pavlov level");

        // Basic structure
        assert_eq!(world.characters.len(), 2, "pavlov has 2 characters");
        assert!(world.characters.contains_key("pavlov"), "has pavlov");
        assert!(world.characters.contains_key("dog"), "has dog");
        assert!(world.items.len() >= 2, "has items");
        assert!(!world.command_defs.is_empty(), "has commands");

        // Dog's mind graph should have nodes
        let dog = &world.characters["dog"];
        assert!(!dog.mind_graph.nodes.is_empty(), "dog has mind nodes");

        // Check that key nodes exist
        let has_hunger = dog
            .mind_graph
            .nodes
            .values()
            .any(|n| n.schema_id == "it:concept/hunger");
        let has_attention = dog
            .mind_graph
            .nodes
            .values()
            .any(|n| n.schema_id == "it:concept/attention");
        assert!(has_hunger, "dog has hunger node");
        assert!(has_attention, "dog has attention node");

        // Check that resource nodes are loaded correctly
        let attention = dog
            .mind_graph
            .find_by_schema("it:concept/attention")
            .unwrap();
        assert!(
            attention.prior_instinct.is_some(),
            "attention has prior_instinct data"
        );
        assert!(
            attention.prior_instinct.as_ref().unwrap().is_resource,
            "attention is a resource"
        );

        println!(
            "Pavlov level loaded: {} chars, {} items, {} commands",
            world.characters.len(),
            world.items.len(),
            world.command_defs.len()
        );
        println!("Dog nodes: {}", dog.mind_graph.nodes.len());
        println!("Dog edges: {}", dog.mind_graph.edges.len());
    }

    #[test]
    fn test_load_all_levels() {
        let levels_dir = assets_dir();
        let mut loaded = 0;
        let mut failed = Vec::new();

        for entry in std::fs::read_dir(&levels_dir).unwrap() {
            let entry = entry.unwrap();
            if entry.file_type().unwrap().is_dir() {
                let level_dir = entry.path();
                let level_id = level_dir.file_name().unwrap().to_str().unwrap().to_string();
                match load_level_from_path(&level_dir) {
                    Ok(world) => {
                        loaded += 1;
                        println!(
                            "✓ {}: {} chars, {} items, {} cmds, {} total nodes",
                            level_id,
                            world.characters.len(),
                            world.items.len(),
                            world.command_defs.len(),
                            world
                                .characters
                                .values()
                                .map(|c| c.mind_graph.nodes.len())
                                .sum::<usize>(),
                        );
                    }
                    Err(e) => {
                        failed.push(format!("{}: {}", level_id, e));
                    }
                }
            }
        }

        println!("\nLoaded {} levels, {} failed", loaded, failed.len());
        for f in &failed {
            eprintln!("  FAIL: {}", f);
        }
        assert!(
            failed.is_empty(),
            "Some levels failed to load: {:?}",
            failed
        );
        assert!(
            loaded >= 3,
            "Should load at least 3 levels (tutorial levels)"
        );
    }

    #[test]
    fn test_simulation_tick() {
        let level_dir = assets_dir().join("pavlov");
        let mut world = load_level_from_path(&level_dir).expect("load pavlov");
        let runner = crate::systems::runner::SimulationRunner::new();

        // Run 10 ticks
        for _ in 0..10 {
            let events = runner.tick(&mut world, 0.5);
            // Should produce at least a TickCompleted event
            assert!(
                events
                    .iter()
                    .any(|e| matches!(e, WorldEvent::TickCompleted { .. })),
                "Each tick should emit TickCompleted"
            );
        }

        assert_eq!(world.tick, 10, "Should have advanced 10 ticks");

        // Check that hunger has increased (velocity > 0)
        let dog = &world.characters["dog"];
        let hunger = dog.mind_graph.find_by_schema("it:concept/hunger").unwrap();
        assert!(
            hunger.value > 0.3,
            "Hunger should have increased from initial 0.3, got {}",
            hunger.value
        );

        println!("After 10 ticks: dog hunger = {:.3}", hunger.value);
    }
}
