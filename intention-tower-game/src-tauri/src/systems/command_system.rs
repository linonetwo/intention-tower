use super::System;
use crate::models::commands::CommandEffect;
use crate::models::economy::EconomyTransaction;
use crate::models::events::WorldEvent;
use crate::models::mind_node::*;
use crate::models::world_state::WorldState;

/// System #4: Processes player commands from the pending command queue.
/// Each command is a declarative DTO with preconditions and effects.
pub struct CommandSystem;

/// Resolve data placeholders against the command context. Commands without a
/// target naturally affect their actor; targeted commands naturally affect the target.
fn resolve_target<'a>(
    explicit: Option<&'a str>,
    target_id: Option<&'a str>,
    actor_id: &'a str,
) -> Option<&'a str> {
    match explicit {
        Some("__actor") => Some(actor_id),
        Some("__target") | None => target_id.or(Some(actor_id)),
        Some(id) => Some(id),
    }
}

impl System for CommandSystem {
    fn name(&self) -> &'static str {
        "CommandSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        let commands = std::mem::take(&mut state.pending_commands);

        for cmd in commands {
            state
                .progress
                .record_command(&cmd.command_id, cmd.target_id.as_deref());
            // Emit command executed event
            state.pending_events.push(WorldEvent::CommandExecuted {
                actor_id: cmd.actor_id.clone(),
                command_id: cmd.command_id.clone(),
                target_id: cmd.target_id.clone(),
            });

            // Process each effect
            for effect in &cmd.effects {
                match effect {
                    CommandEffect::SpawnObservation {
                        schema_id,
                        modality,
                        about,
                        ttl,
                        strength,
                        target_character_id,
                    } => {
                        let target_char = resolve_target(
                            target_character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                // Use persistent schema-based ID (no tick suffix) so conditioning
                                // can accumulate over time and edges remain valid across rerings.
                                let sanitized = schema_id.replace([':', '/'], "_");
                                let instance_id = format!("obs_{}", sanitized);
                                let already_exists =
                                    character.mind_graph.nodes.contains_key(&instance_id);
                                let node = MindNode {
                                    instance_id: instance_id.clone(),
                                    schema_id: schema_id.clone(),
                                    label: schema_id.clone(),
                                    node_type: NodeType::Observation,
                                    value: 1.0,
                                    value_velocity: 0.0,
                                    strength: *strength,
                                    active: true,
                                    attended: true,
                                    suppression: 0.0,
                                    created_at: state.tick, // reset TTL on re-ring
                                    ttl: Some(*ttl),
                                    hidden_by_default: false,
                                    thresholds: Vec::new(),
                                    costs: Vec::new(),
                                    observation: Some(ObservationData {
                                        modality: Some(*modality),
                                        about: Some(about.clone()),
                                        novelty_key: Some(format!(
                                            "{}-{}",
                                            modality_str(*modality),
                                            about
                                        )),
                                        credibility: 1.0,
                                        satisfaction: 0.0,
                                        source: Some(if state.in_virtual_context {
                                            ObservationSource::Virtual
                                        } else {
                                            ObservationSource::Environment
                                        }),
                                        is_signal: *modality == Modality::Social,
                                        signal_type: social_signal_type(schema_id),
                                        emitter_id: Some(cmd.actor_id.clone()),
                                        group_context: social_group_context(schema_id),
                                        ..Default::default()
                                    }),
                                    prior_instinct: None,
                                    motivation: None,
                                    action: None,
                                    meme: None,
                                    prev_value: 0.0,
                                    reality_layer: state
                                        .virtual_context_stack
                                        .len()
                                        .min(u8::MAX as usize)
                                        as u8,
                                    is_virtual: state.in_virtual_context,
                                };
                                character.mind_graph.add_node(node);
                                if already_exists {
                                    // Refreshed an existing obs node
                                    state.pending_events.push(WorldEvent::NodeValueChanged {
                                        character_id: char_id.to_string(),
                                        instance_id,
                                        old_value: 0.0,
                                        new_value: 1.0,
                                    });
                                } else {
                                    state.pending_events.push(WorldEvent::NodeSpawned {
                                        character_id: char_id.to_string(),
                                        instance_id,
                                        schema_id: schema_id.clone(),
                                        node_type: "Observation".to_string(),
                                    });
                                }
                            }
                        }
                    }
                    CommandEffect::ModifyNodeValue {
                        schema_id,
                        delta,
                        target_character_id,
                    } => {
                        let target_char = resolve_target(
                            target_character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(node) =
                                    character.mind_graph.find_by_schema_mut(schema_id)
                                {
                                    let old = node.value;
                                    node.value = (node.value + delta).clamp(0.0, 1.0);
                                    state.pending_events.push(WorldEvent::NodeValueChanged {
                                        character_id: char_id.to_string(),
                                        instance_id: node.instance_id.clone(),
                                        old_value: old,
                                        new_value: node.value,
                                    });
                                }
                            }
                        }
                    }
                    CommandEffect::ConsumeResource {
                        resource_schema_id,
                        amount,
                        target_character_id,
                    } => {
                        let target_char = resolve_target(
                            target_character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                character
                                    .mind_graph
                                    .consume_resource(resource_schema_id, *amount);
                                state.pending_events.push(WorldEvent::ResourceConsumed {
                                    character_id: char_id.to_string(),
                                    resource_schema_id: resource_schema_id.clone(),
                                    amount: *amount,
                                    remaining: character
                                        .mind_graph
                                        .resource_value(resource_schema_id),
                                });
                            }
                        }
                    }
                    CommandEffect::ReinforceEdge {
                        source_schema_id,
                        target_schema_id,
                        delta,
                        character_id,
                    } => {
                        let char_id = resolve_target(
                            character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(cid) = char_id {
                            if let Some(character) = state.characters.get_mut(cid) {
                                // Find edge between nodes with those schemas
                                let edge_id = character
                                    .mind_graph
                                    .edges
                                    .values()
                                    .find(|e| {
                                        let src =
                                            character.mind_graph.nodes.get(&e.source_instance_id);
                                        let tgt =
                                            character.mind_graph.nodes.get(&e.target_instance_id);
                                        src.is_some_and(|s| s.schema_id == *source_schema_id)
                                            && tgt.is_some_and(|t| t.schema_id == *target_schema_id)
                                    })
                                    .map(|e| e.edge_id.clone());

                                if let Some(eid) = edge_id {
                                    if let Some(edge) = character.mind_graph.edges.get_mut(&eid) {
                                        let old = edge.weight;
                                        edge.weight = (edge.weight + delta).clamp(0.0, 1.0);
                                        state.pending_events.push(WorldEvent::EdgeWeightChanged {
                                            character_id: cid.to_string(),
                                            edge_id: eid,
                                            old_weight: old,
                                            new_weight: edge.weight,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    CommandEffect::WeakenEdge {
                        source_schema_id,
                        target_schema_id,
                        delta,
                        character_id,
                    } => {
                        let char_id = resolve_target(
                            character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(cid) = char_id {
                            if let Some(character) = state.characters.get_mut(cid) {
                                let edge_id = character
                                    .mind_graph
                                    .edges
                                    .values()
                                    .find(|e| {
                                        let src =
                                            character.mind_graph.nodes.get(&e.source_instance_id);
                                        let tgt =
                                            character.mind_graph.nodes.get(&e.target_instance_id);
                                        src.is_some_and(|s| s.schema_id == *source_schema_id)
                                            && tgt.is_some_and(|t| t.schema_id == *target_schema_id)
                                    })
                                    .map(|e| e.edge_id.clone());

                                if let Some(eid) = edge_id {
                                    if let Some(edge) = character.mind_graph.edges.get_mut(&eid) {
                                        let old = edge.weight;
                                        edge.weight = (edge.weight - delta.abs()).clamp(0.0, 1.0);
                                        state.pending_events.push(WorldEvent::EdgeWeightChanged {
                                            character_id: cid.to_string(),
                                            edge_id: eid,
                                            old_weight: old,
                                            new_weight: edge.weight,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    CommandEffect::InjectMeme {
                        meme_schema_id,
                        target_character_id,
                        meme,
                    } => {
                        let target_char = resolve_target(
                            target_character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(existing) =
                                    character.mind_graph.nodes.values_mut().find(|node| {
                                        node.schema_id == *meme_schema_id
                                            && node.node_type == NodeType::Meme
                                    })
                                {
                                    let old_value = existing.value;
                                    existing.value = (existing.value + 0.2).min(1.0);
                                    existing.strength = (existing.strength + 0.1).min(1.0);
                                    existing.active = true;
                                    state.pending_events.push(WorldEvent::NodeValueChanged {
                                        character_id: char_id.to_string(),
                                        instance_id: existing.instance_id.clone(),
                                        old_value,
                                        new_value: existing.value,
                                    });
                                } else {
                                    let sanitized = meme_schema_id.replace([':', '/'], "_");
                                    let instance_id = format!("meme_{sanitized}");
                                    let node = MindNode {
                                        instance_id: instance_id.clone(),
                                        schema_id: meme_schema_id.clone(),
                                        label: meme_schema_id.clone(),
                                        node_type: NodeType::Meme,
                                        value: 0.35,
                                        value_velocity: 0.0,
                                        strength: (0.5 + meme.resilience * 0.3).min(1.0),
                                        active: true,
                                        attended: true,
                                        suppression: 0.0,
                                        created_at: state.tick,
                                        ttl: None,
                                        hidden_by_default: false,
                                        thresholds: Vec::new(),
                                        costs: Vec::new(),
                                        observation: None,
                                        prior_instinct: None,
                                        motivation: None,
                                        action: None,
                                        meme: Some(meme.clone()),
                                        prev_value: 0.0,
                                        reality_layer: 0,
                                        is_virtual: false,
                                    };
                                    character.mind_graph.add_node(node);
                                    state.pending_events.push(WorldEvent::NodeSpawned {
                                        character_id: char_id.to_string(),
                                        instance_id,
                                        schema_id: meme_schema_id.clone(),
                                        node_type: "Meme".to_string(),
                                    });
                                }
                            }
                        }
                    }
                    CommandEffect::DeleteNode {
                        schema_id,
                        target_character_id,
                    } => {
                        let target_char = resolve_target(
                            target_character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(node) = character.mind_graph.find_by_schema(schema_id) {
                                    let iid = node.instance_id.clone();
                                    let resilience = node
                                        .meme
                                        .as_ref()
                                        .map_or(0.0, |meme| meme.resilience.clamp(0.0, 1.0));
                                    if resilience >= 0.9 {
                                        state.pending_events.push(
                                            WorldEvent::NodeDeletionResisted {
                                                character_id: char_id.to_string(),
                                                instance_id: iid,
                                                remaining_resilience: resilience,
                                            },
                                        );
                                    } else if resilience > 0.0 {
                                        if let Some(node) = character.mind_graph.nodes.get_mut(&iid)
                                        {
                                            if let Some(meme) = node.meme.as_mut() {
                                                meme.resilience = (meme.resilience - 0.35).max(0.0);
                                                node.strength = (node.strength - 0.2).max(0.0);
                                                node.value = (node.value - 0.2).max(0.0);
                                                state.pending_events.push(
                                                    WorldEvent::NodeDeletionResisted {
                                                        character_id: char_id.to_string(),
                                                        instance_id: iid,
                                                        remaining_resilience: meme.resilience,
                                                    },
                                                );
                                            }
                                        }
                                    } else {
                                        character.mind_graph.remove_node(&iid);
                                        state.pending_events.push(WorldEvent::NodeDespawned {
                                            character_id: char_id.to_string(),
                                            instance_id: iid,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    CommandEffect::ModifyResourceRegen {
                        resource_schema_id,
                        new_regen_rate,
                        target_character_id,
                    } => {
                        let target_char = resolve_target(
                            target_character_id.as_deref(),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        );
                        if let Some(char_id) = target_char {
                            if let Some(character) = state.characters.get_mut(char_id) {
                                if let Some(node) =
                                    character.mind_graph.find_by_schema_mut(resource_schema_id)
                                {
                                    node.value_velocity = *new_regen_rate;
                                }
                            }
                        }
                    }
                    CommandEffect::SetVirtualContext { value } => {
                        if *value {
                            let depth = state.virtual_context_stack.len() + 1;
                            state
                                .virtual_context_stack
                                .push(format!("virtual-layer-{depth}"));
                        } else {
                            state.virtual_context_stack.pop();
                        }
                        state.in_virtual_context = !state.virtual_context_stack.is_empty();
                        state
                            .pending_events
                            .push(WorldEvent::VirtualContextChanged {
                                value: state.in_virtual_context,
                                depth: state.virtual_context_stack.len().min(u8::MAX as usize)
                                    as u8,
                            });
                    }
                    CommandEffect::SetAssetPrice {
                        item_id,
                        unit_price,
                    } => {
                        if let Some(asset) = state.economy.assets.get_mut(item_id) {
                            let old_price = asset.unit_price;
                            asset.unit_price = unit_price.max(0.0);
                            if let Some(item) = state.items.get_mut(item_id) {
                                item.unit_price = asset.unit_price;
                            }
                            state.pending_events.push(WorldEvent::AssetPriceChanged {
                                item_id: item_id.clone(),
                                old_price,
                                new_price: asset.unit_price,
                            });
                        }
                    }
                    CommandEffect::TradeAsset {
                        item_id,
                        buyer_id,
                        seller_id,
                        quantity,
                    } => {
                        let buyer =
                            resolve_target(Some(buyer_id), cmd.target_id.as_deref(), &cmd.actor_id)
                                .unwrap_or(&cmd.actor_id)
                                .to_owned();
                        let seller = resolve_target(
                            Some(seller_id),
                            cmd.target_id.as_deref(),
                            &cmd.actor_id,
                        )
                        .unwrap_or(&cmd.actor_id)
                        .to_owned();
                        let asset = state.economy.assets.get(item_id).cloned();
                        let total_price = asset
                            .as_ref()
                            .map_or(0.0, |asset| asset.unit_price * quantity.max(0.0));
                        let buyer_balance = state
                            .economy
                            .accounts
                            .get(&buyer)
                            .copied()
                            .unwrap_or_default();
                        let rejection = match asset.as_ref() {
                            None => Some("asset_not_found"),
                            Some(_) if *quantity <= 0.0 => Some("invalid_quantity"),
                            Some(asset)
                                if asset
                                    .owner_id
                                    .as_deref()
                                    .is_some_and(|owner| owner != seller) =>
                            {
                                Some("seller_does_not_own_asset")
                            }
                            Some(asset) if asset.supply < *quantity => Some("insufficient_supply"),
                            Some(_) if buyer_balance < total_price => Some("insufficient_funds"),
                            _ => None,
                        };

                        if let Some(reason) = rejection {
                            state.pending_events.push(WorldEvent::AssetTradeRejected {
                                item_id: item_id.clone(),
                                buyer_id: buyer,
                                reason: reason.to_owned(),
                            });
                        } else {
                            if let Some(asset) = state.economy.assets.get_mut(item_id) {
                                asset.supply -= *quantity;
                            }
                            *state.economy.accounts.entry(buyer.clone()).or_default() -=
                                total_price;
                            *state.economy.accounts.entry(seller.clone()).or_default() +=
                                total_price;
                            *state
                                .economy
                                .holdings
                                .entry(buyer.clone())
                                .or_default()
                                .entry(item_id.clone())
                                .or_default() += *quantity;
                            if let Some(holding) = state
                                .economy
                                .holdings
                                .entry(seller.clone())
                                .or_default()
                                .get_mut(item_id)
                            {
                                *holding = (*holding - *quantity).max(0.0);
                            }
                            state.economy.transactions.push(EconomyTransaction {
                                tick: state.tick,
                                item_id: item_id.clone(),
                                seller_id: seller.clone(),
                                buyer_id: buyer.clone(),
                                quantity: *quantity,
                                total_price,
                            });
                            if state.economy.transactions.len() > 500 {
                                state.economy.transactions.remove(0);
                            }
                            state.pending_events.push(WorldEvent::AssetTraded {
                                item_id: item_id.clone(),
                                seller_id: seller,
                                buyer_id: buyer,
                                quantity: *quantity,
                                total_price,
                            });
                        }
                    }
                    // Effects that are just world-level events
                    CommandEffect::EmitWorldEvent { event } => {
                        state.pending_events.push(event.clone());
                    }
                }
            }
        }
    }
}

fn modality_str(m: Modality) -> &'static str {
    match m {
        Modality::Visual => "visual",
        Modality::Auditory => "auditory",
        Modality::Olfactory => "olfactory",
        Modality::Gustatory => "gustatory",
        Modality::Tactile => "tactile",
        Modality::Interoceptive => "interoceptive",
        Modality::Chemical => "chemical",
        Modality::Social => "social",
    }
}

fn social_signal_type(schema_id: &str) -> Option<SignalType> {
    if schema_id.contains("approval") {
        Some(SignalType::Approval)
    } else if schema_id.contains("rejection") {
        Some(SignalType::Rejection)
    } else if schema_id.contains("threat") {
        Some(SignalType::Threat)
    } else if schema_id.contains("status") {
        Some(SignalType::Status)
    } else {
        None
    }
}

fn social_group_context(schema_id: &str) -> Option<String> {
    if schema_id.contains("social-approval") || schema_id.contains("social-rejection") {
        Some("the-wave".to_string())
    } else if schema_id.contains("status") {
        Some("court".to_string())
    } else {
        None
    }
}
