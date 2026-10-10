use serde::{Deserialize, Serialize};

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
