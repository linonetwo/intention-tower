use super::mind_node::{AssociationEdge, MindNode};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A character's personal mind graph (their "Intention Tower")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindGraph {
    pub character_id: String,
    // Stable traversal is part of snapshot determinism: floating-point sums,
    // resource allocation and tied selections must not depend on a map's
    // randomized hash seed (which changes when a saved graph is restored).
    pub nodes: BTreeMap<String, MindNode>,
    pub edges: BTreeMap<String, AssociationEdge>,
    #[serde(default)]
    pub conditioning_trials: Vec<ConditioningTrial>,
    #[serde(default)]
    pub conditioning_stats: BTreeMap<String, ConditioningStats>,
    #[serde(default)]
    pub action_episodes: Vec<ActionEpisode>,
    #[serde(default)]
    pub consumed_action_stimuli: Vec<ConsumedActionStimulus>,
    #[serde(skip)]
    pub pending_action_request: Option<ActionExecutionRequest>,
    /// Survives percept TTL expiry so a short cue cannot bypass the quiet window.
    #[serde(default)]
    pub last_external_observation_at: Option<u64>,
}

/// Durable evidence of one motor response, not of persistent selection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionEpisode {
    #[serde(default)]
    pub stimulus: Option<ActionStimulus>,
    #[serde(default)]
    pub physical_outcome: Option<ActionPhysicalOutcome>,
    pub action_id: String,
    pub action_schema_id: String,
    pub executed_at: u64,
    pub contexts: Vec<ActionContext>,
    pub autonomous: bool,
    /// Reward delivery is consumed even when no learning resource is available.
    #[serde(default)]
    pub reward_consumed_at: Option<u64>,
    /// Only paid positive updates constitute successful reinforcement.
    #[serde(default)]
    pub reinforcement_dopamine_spent: f64,
    pub rewarded_at: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActionStimulus {
    pub observation_instance_id: String,
    pub observation_schema_id: String,
    pub emitter_id: Option<String>,
    pub group_context: Option<String>,
    pub presented_at: u64,
    pub presentation_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumedActionStimulus {
    pub action_id: String,
    pub stimulus: ActionStimulus,
}

#[derive(Debug, Clone)]
pub struct ActionExecutionRequest {
    pub action_id: String,
    pub stimulus: Option<ActionStimulus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ActionPhysicalOutcome {
    ActorPosture {
        from: super::scene::CharacterPosture,
        to: super::scene::CharacterPosture,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionContext {
    pub instance_id: String,
    pub schema_id: String,
    pub value: f64,
}

/// One presentation, not one simulation tick, is a learning trial.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditioningTrial {
    pub source_id: String,
    pub target_id: String,
    pub started_at: u64,
    pub deadline: u64,
    pub prediction: f64,
    pub reward: f64,
    pub responded: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ConditioningStats {
    pub paired_trials: u32,
    pub independent_responses: u32,
    pub omitted_rewards: u32,
}

impl MindGraph {
    /// Only evidenced associations with currently attended sources provide learned motor drive.
    pub fn learned_action_drive(&self, action_id: &str) -> f64 {
        self.edges
            .values()
            .filter(|edge| {
                edge.learnable
                    && edge.evidence.co_occurrence_count > 0
                    && edge.target_instance_id == action_id
            })
            .map(|edge| {
                self.nodes
                    .get(&edge.source_instance_id)
                    .filter(|source| source.active && source.attended)
                    .map_or(0.0, |source| match edge.polarity {
                        super::mind_node::Polarity::Excitatory => edge.weight * source.value,
                        super::mind_node::Polarity::Inhibitory => -edge.weight * source.value,
                    })
            })
            .sum::<f64>()
            .clamp(0.0, 1.0)
    }

    pub fn new(character_id: String) -> Self {
        Self {
            character_id,
            nodes: BTreeMap::new(),
            edges: BTreeMap::new(),
            conditioning_trials: Vec::new(),
            conditioning_stats: BTreeMap::new(),
            action_episodes: Vec::new(),
            consumed_action_stimuli: Vec::new(),
            pending_action_request: None,
            last_external_observation_at: None,
        }
    }

    /// Snapshot the exact attended external presentation; durable receipts prevent replay.
    pub fn action_stimulus(&self, action_id: &str, tick: u64) -> Option<ActionStimulus> {
        let cue = self
            .nodes
            .get(action_id)?
            .action
            .as_ref()?
            .instruction_cue
            .as_ref()?;
        self.nodes
            .values()
            .filter_map(|node| {
                let observation = node.observation.as_ref()?;
                if node.node_type != super::mind_node::NodeType::Observation
                    || !node.active
                    || !node.attended
                    || !node.value.is_finite()
                    || node.value < cue.min_value
                    || node.created_at > tick
                    || tick - node.created_at > cue.max_age_ticks
                    || !cue.observation_schema_ids.contains(&node.schema_id)
                    || observation.emitter_id.as_ref() == Some(&self.character_id)
                    || observation.emitter_id.is_none()
                    || cue
                        .emitter_id
                        .as_ref()
                        .is_some_and(|id| observation.emitter_id.as_ref() != Some(id))
                    || cue
                        .group_context
                        .as_ref()
                        .is_some_and(|id| observation.group_context.as_ref() != Some(id))
                {
                    return None;
                }
                let stimulus = ActionStimulus {
                    observation_instance_id: node.instance_id.clone(),
                    observation_schema_id: node.schema_id.clone(),
                    emitter_id: observation.emitter_id.clone(),
                    group_context: observation.group_context.clone(),
                    presented_at: node.created_at,
                    presentation_count: observation.presentation_count,
                };
                (!self
                    .consumed_action_stimuli
                    .iter()
                    .any(|receipt| receipt.action_id == action_id && receipt.stimulus == stimulus))
                .then_some(stimulus)
            })
            .max_by_key(|stimulus| (stimulus.presented_at, stimulus.presentation_count))
    }

    pub fn add_node(&mut self, node: MindNode) {
        self.nodes.insert(node.instance_id.clone(), node);
    }

    pub fn next_presentation_count(&self, instance_id: &str, tick: u64) -> u32 {
        let Some(node) = self.nodes.get(instance_id) else {
            return 1;
        };
        let count = node
            .observation
            .as_ref()
            .map_or(0, |observation| observation.presentation_count);
        if count > 0 && node.created_at == tick {
            count
        } else {
            count.saturating_add(1)
        }
    }

    pub fn remove_node(&mut self, instance_id: &str) -> Option<MindNode> {
        let node = self.nodes.remove(instance_id);
        // Also remove all edges connected to this node
        self.edges.retain(|_, edge| {
            edge.source_instance_id != instance_id && edge.target_instance_id != instance_id
        });
        node
    }

    pub fn add_edge(&mut self, edge: AssociationEdge) {
        self.edges.insert(edge.edge_id.clone(), edge);
    }

    pub fn remove_edge(&mut self, edge_id: &str) -> Option<AssociationEdge> {
        self.edges.remove(edge_id)
    }

    pub fn get_node(&self, instance_id: &str) -> Option<&MindNode> {
        self.nodes.get(instance_id)
    }

    pub fn get_node_mut(&mut self, instance_id: &str) -> Option<&mut MindNode> {
        self.nodes.get_mut(instance_id)
    }

    /// Find a node by its schema_id
    pub fn find_by_schema(&self, schema_id: &str) -> Option<&MindNode> {
        self.nodes.values().find(|n| n.schema_id == schema_id)
    }

    pub fn find_by_schema_mut(&mut self, schema_id: &str) -> Option<&mut MindNode> {
        self.nodes.values_mut().find(|n| n.schema_id == schema_id)
    }

    /// Get all active Observation nodes
    pub fn active_observations(&self) -> Vec<&MindNode> {
        self.nodes
            .values()
            .filter(|n| n.node_type == super::mind_node::NodeType::Observation && n.active)
            .collect()
    }

    /// Get all resource nodes (attention, dopamine, health)
    pub fn resource_nodes(&self) -> Vec<&MindNode> {
        self.nodes.values().filter(|n| n.is_resource()).collect()
    }

    /// Get the current value of a resource node by schema_id
    pub fn resource_value(&self, schema_id: &str) -> f64 {
        self.find_by_schema(schema_id).map_or(0.0, |n| n.value)
    }

    /// Consume a resource. Returns true if successful (enough resource).
    pub fn consume_resource(&mut self, schema_id: &str, amount: f64) -> bool {
        if let Some(node) = self.find_by_schema_mut(schema_id) {
            if node.value >= amount {
                node.value -= amount;
                return true;
            }
        }
        false
    }

    /// Get outgoing edges from a node
    pub fn outgoing_edges(&self, instance_id: &str) -> Vec<&AssociationEdge> {
        self.edges
            .values()
            .filter(|e| e.source_instance_id == instance_id)
            .collect()
    }

    /// Get incoming edges to a node
    pub fn incoming_edges(&self, instance_id: &str) -> Vec<&AssociationEdge> {
        self.edges
            .values()
            .filter(|e| e.target_instance_id == instance_id)
            .collect()
    }
}
