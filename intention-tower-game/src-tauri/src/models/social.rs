use serde::{Deserialize, Serialize};

pub fn member(graph: &super::mind_graph::MindGraph, group: &str) -> bool {
    graph.nodes.values().any(|node| {
        node.active
            && node.node_type == super::mind_node::NodeType::Meme
            && node.effective_strength().is_finite()
            && node.effective_strength() > 0.0
            && node
                .meme
                .as_ref()
                .is_some_and(|m| m.is_identity && m.group_id.as_deref() == Some(group))
    })
}

/// Live eligibility, never aggregate membership or preseeded weights.
pub fn exclusion_learning(
    graph: &super::mind_graph::MindGraph,
    effect: &super::mind_node::ActionPhysicalEffect,
) -> Option<(String, String, f64)> {
    use super::mind_node::{ActionPhysicalEffect, LearnType, Polarity};
    let ActionPhysicalEffect::SocialExclusion {
        group_id,
        identity_schema_id,
        minimum_social_weight,
        minimum_need_value,
        ..
    } = effect
    else {
        return None;
    };
    graph.edges.values().find_map(|edge| {
        let identity = graph.nodes.get(&edge.target_instance_id)?;
        let need = graph.nodes.get(&edge.source_instance_id)?;
        (identity.active
            && identity.node_type == super::mind_node::NodeType::Meme
            && identity.effective_strength().is_finite()
            && identity.effective_strength() > 0.0
            && identity.schema_id == *identity_schema_id
            && identity.meme.as_ref().is_some_and(|m| {
                m.is_identity
                    && m.group_id.as_ref() == Some(group_id)
                    && m.social_need_bindings
                        .iter()
                        .any(|b| b.need_schema_id == need.schema_id)
            })
            && need.active
            && need.node_type == super::mind_node::NodeType::PriorInstinct
            && need.attended
            && need.value.is_finite()
            && need.value >= *minimum_need_value
            && need.prior_instinct.as_ref().is_some_and(|n| !n.is_resource)
            && edge.learnable
            && edge.learn_type == LearnType::Social
            && edge.polarity == Polarity::Excitatory
            && edge.weight.is_finite()
            && edge.weight > 0.0
            && edge.weight >= *minimum_social_weight
            && edge.evidence.co_occurrence_count > 0
            && edge.evidence.social_dopamine_spent.is_finite()
            && edge.evidence.social_dopamine_spent > 0.0)
            .then(|| {
                (
                    identity.instance_id.clone(),
                    edge.edge_id.clone(),
                    edge.evidence.social_dopamine_spent,
                )
            })
    })
}

pub fn exclusion_stimulus(
    world: &super::world_state::WorldState,
    actor: &str,
    action: &str,
) -> Option<super::mind_graph::ActionStimulus> {
    let graph = &world.characters.get(actor)?.mind_graph;
    let effect = graph
        .nodes
        .get(action)?
        .action
        .as_ref()?
        .physical_effect
        .as_ref()?;
    let super::mind_node::ActionPhysicalEffect::SocialExclusion {
        group_id,
        target_need_schema_id,
        ..
    } = effect
    else {
        return graph.action_stimulus(action, world.tick);
    };
    exclusion_learning(graph, effect)?;
    graph
        .action_stimuli(action, world.tick)
        .into_iter()
        .filter(|stimulus| {
            stimulus.presentation_count > 0
                && stimulus.emitter_id.as_deref().is_some_and(|target| {
                    target != actor
                        && world.characters.get(target).is_some_and(|c| {
                            !member(&c.mind_graph, group_id)
                                && c.mind_graph.nodes.values().any(|n| {
                                    n.schema_id == *target_need_schema_id
                                        && n.node_type == super::mind_node::NodeType::PriorInstinct
                                        && n.value.is_finite()
                                        && n.prior_instinct.as_ref().is_some_and(|p| !p.is_resource)
                                })
                        })
                })
        })
        .max_by_key(|s| (s.presented_at, s.presentation_count))
}

pub fn exclusion_drive(
    graph: &super::mind_graph::MindGraph,
    effect: &super::mind_node::ActionPhysicalEffect,
) -> f64 {
    let Some((identity, edge, _)) = exclusion_learning(graph, effect) else {
        return 0.0;
    };
    let edge = &graph.edges[&edge];
    (edge.weight
        * graph.nodes[&edge.source_instance_id].value
        * graph.nodes[&identity].effective_strength())
    .clamp(0.0, 1.0)
}

/// Cross-character aggregate derived from identity memes each tick. Keeping the
/// aggregate in WorldState makes group mechanics inspectable, saveable, and
/// available to future level conditions without coupling them to one scenario.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SocialGroupState {
    pub group_id: String,
    pub members: Vec<String>,
    pub cohesion: f64,
    pub consensus_action: Option<String>,
}
