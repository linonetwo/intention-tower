use super::mind_node::{AssociationEdge, MindNode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A character's personal mind graph (their "Intention Tower")
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindGraph {
    pub character_id: String,
    pub nodes: HashMap<String, MindNode>,
    pub edges: HashMap<String, AssociationEdge>,
}

impl MindGraph {
    pub fn new(character_id: String) -> Self {
        Self {
            character_id,
            nodes: HashMap::new(),
            edges: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, node: MindNode) {
        self.nodes.insert(node.instance_id.clone(), node);
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
