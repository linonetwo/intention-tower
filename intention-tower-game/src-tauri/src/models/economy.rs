use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EconomyAsset {
    pub item_id: String,
    pub owner_id: Option<String>,
    pub supply: f64,
    pub unit_price: f64,
    pub demand: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EconomyTransaction {
    pub tick: u64,
    pub item_id: String,
    pub seller_id: String,
    pub buyer_id: String,
    pub quantity: f64,
    pub total_price: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EconomyState {
    pub accounts: HashMap<String, f64>,
    pub holdings: HashMap<String, HashMap<String, f64>>,
    pub assets: HashMap<String, EconomyAsset>,
    pub transactions: Vec<EconomyTransaction>,
}
