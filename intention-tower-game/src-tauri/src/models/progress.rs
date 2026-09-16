use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::commands::CompareOp;
use super::world_state::{WorldCharacter, WorldState};

/// Authoritative lifecycle of the currently loaded level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum LevelStatus {
    #[default]
    InProgress,
    Won,
    Lost,
}

/// A data-driven predicate used by objectives and failure rules.
/// Stable schema IDs keep level logic independent from runtime node IDs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum LevelCondition {
    CommandUsed {
        command_id: String,
        #[serde(default = "one")]
        min_count: u32,
        #[serde(default)]
        distinct_targets: u32,
    },
    NodeValue {
        #[serde(default)]
        character_id: Option<String>,
        schema_id: String,
        op: CompareOp,
        value: f64,
    },
    NodePresent {
        #[serde(default)]
        character_id: Option<String>,
        schema_id: String,
    },
    NodeSuppression {
        #[serde(default)]
        character_id: Option<String>,
        schema_id: String,
        op: CompareOp,
        value: f64,
    },
    EdgeWeight {
        #[serde(default)]
        character_id: Option<String>,
        source_schema_id: String,
        target_schema_id: String,
        op: CompareOp,
        value: f64,
    },
    VirtualContext {
        value: bool,
    },
    SocialGroup {
        group_id: String,
        #[serde(default = "one")]
        min_members: u32,
        #[serde(default)]
        min_cohesion: f64,
    },
    AssetTransactions {
        item_id: String,
        #[serde(default = "one")]
        min_count: u32,
        #[serde(default)]
        distinct_buyers: u32,
    },
    TickAtLeast {
        tick: u64,
    },
    All {
        conditions: Vec<LevelCondition>,
    },
    Any {
        conditions: Vec<LevelCondition>,
    },
}

const fn one() -> u32 {
    1
}

impl LevelCondition {
    pub fn evaluate(&self, world: &WorldState) -> bool {
        match self {
            Self::CommandUsed {
                command_id,
                min_count,
                distinct_targets,
            } => {
                let total = world
                    .progress
                    .command_counts
                    .get(command_id)
                    .copied()
                    .unwrap_or_default();
                total >= *min_count
                    && (*distinct_targets == 0
                        || world
                            .progress
                            .command_targets
                            .get(command_id)
                            .is_some_and(|targets| targets.len() as u32 >= *distinct_targets))
            }
            Self::NodeValue {
                character_id,
                schema_id,
                op,
                value,
            } => matching_characters(world, character_id.as_deref()).any(|character| {
                character
                    .mind_graph
                    .find_by_schema(schema_id)
                    .is_some_and(|node| op.evaluate(node.value, *value))
            }),
            Self::NodePresent {
                character_id,
                schema_id,
            } => matching_characters(world, character_id.as_deref())
                .any(|character| character.mind_graph.find_by_schema(schema_id).is_some()),
            Self::NodeSuppression {
                character_id,
                schema_id,
                op,
                value,
            } => matching_characters(world, character_id.as_deref()).any(|character| {
                character
                    .mind_graph
                    .find_by_schema(schema_id)
                    .is_some_and(|node| op.evaluate(node.suppression, *value))
            }),
            Self::EdgeWeight {
                character_id,
                source_schema_id,
                target_schema_id,
                op,
                value,
            } => matching_characters(world, character_id.as_deref()).any(|character| {
                character.mind_graph.edges.values().any(|edge| {
                    let source = character.mind_graph.nodes.get(&edge.source_instance_id);
                    let target = character.mind_graph.nodes.get(&edge.target_instance_id);
                    source.is_some_and(|node| node.schema_id == *source_schema_id)
                        && target.is_some_and(|node| node.schema_id == *target_schema_id)
                        && op.evaluate(edge.weight, *value)
                })
            }),
            Self::VirtualContext { value } => world.in_virtual_context == *value,
            Self::SocialGroup {
                group_id,
                min_members,
                min_cohesion,
            } => world.social_groups.get(group_id).is_some_and(|group| {
                group.members.len() as u32 >= *min_members && group.cohesion >= *min_cohesion
            }),
            Self::AssetTransactions {
                item_id,
                min_count,
                distinct_buyers,
            } => {
                let matching: Vec<_> = world
                    .economy
                    .transactions
                    .iter()
                    .filter(|transaction| transaction.item_id == *item_id)
                    .collect();
                let buyers: HashSet<&str> = matching
                    .iter()
                    .map(|transaction| transaction.buyer_id.as_str())
                    .collect();
                matching.len() as u32 >= *min_count
                    && buyers.len() as u32 >= *distinct_buyers
            }
            Self::TickAtLeast { tick } => world.tick >= *tick,
            Self::All { conditions } => {
                !conditions.is_empty()
                    && conditions.iter().all(|condition| condition.evaluate(world))
            }
            Self::Any { conditions } => {
                conditions.iter().any(|condition| condition.evaluate(world))
            }
        }
    }
}

fn matching_characters<'a>(
    world: &'a WorldState,
    character_id: Option<&str>,
) -> Box<dyn Iterator<Item = &'a WorldCharacter> + 'a> {
    match character_id {
        Some(id) if id != "__any" => Box::new(world.characters.get(id).into_iter()),
        _ => Box::new(world.characters.values()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectiveState {
    pub objective_id: String,
    pub label: String,
    pub condition: LevelCondition,
    #[serde(default = "yes")]
    pub required: bool,
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub completed_at_tick: Option<u64>,
}

const fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureRule {
    pub rule_id: String,
    pub label: String,
    pub condition: LevelCondition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LevelProgress {
    #[serde(default)]
    pub status: LevelStatus,
    #[serde(default)]
    pub objectives: Vec<ObjectiveState>,
    #[serde(default)]
    pub failure_rules: Vec<FailureRule>,
    #[serde(default)]
    pub command_counts: HashMap<String, u32>,
    #[serde(default)]
    pub command_targets: HashMap<String, HashSet<String>>,
    #[serde(default)]
    pub completed_at_tick: Option<u64>,
    #[serde(default)]
    pub outcome_label: Option<String>,
}

impl Default for LevelProgress {
    fn default() -> Self {
        Self {
            status: LevelStatus::InProgress,
            objectives: Vec::new(),
            failure_rules: Vec::new(),
            command_counts: HashMap::new(),
            command_targets: HashMap::new(),
            completed_at_tick: None,
            outcome_label: None,
        }
    }
}

impl LevelProgress {
    pub fn record_command(&mut self, command_id: &str, target_id: Option<&str>) {
        *self
            .command_counts
            .entry(command_id.to_string())
            .or_default() += 1;
        if let Some(target_id) = target_id {
            self.command_targets
                .entry(command_id.to_string())
                .or_default()
                .insert(target_id.to_string());
        }
    }
}
