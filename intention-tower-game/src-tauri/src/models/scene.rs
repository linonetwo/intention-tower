use super::world_state::WorldState;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CharacterPosture {
    #[default]
    Standing,
    Sitting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Platform {
    pub id: String,
    pub x_min: f64,
    pub x_max: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectorKind {
    Stairs,
    Ladder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connector {
    pub id: String,
    pub kind: ConnectorKind,
    pub from_platform: String,
    pub to_platform: String,
    pub from_x: f64,
    pub to_x: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDefinition {
    pub platforms: Vec<Platform>,
    #[serde(default)]
    pub connectors: Vec<Connector>,
}

impl Default for SceneDefinition {
    fn default() -> Self {
        Self {
            platforms: vec![Platform {
                id: "ground".into(),
                x_min: 0.0,
                x_max: 800.0,
                y: 300.0,
            }],
            connectors: vec![],
        }
    }
}

impl SceneDefinition {
    pub fn validate(&self) -> Result<(), String> {
        if self.platforms.is_empty() {
            return Err("scene needs a platform".into());
        }
        let mut ids = std::collections::HashSet::new();
        for p in &self.platforms {
            if p.id.is_empty()
                || !ids.insert(&p.id)
                || !p.x_min.is_finite()
                || !p.x_max.is_finite()
                || !p.y.is_finite()
                || p.x_min >= p.x_max
            {
                return Err("invalid scene platform".into());
            }
        }
        let mut connector_ids = std::collections::HashSet::new();
        for c in &self.connectors {
            if c.id.is_empty() || !connector_ids.insert(&c.id) || c.from_platform == c.to_platform {
                return Err("invalid scene connector".into());
            }
            for (id, x) in [(&c.from_platform, c.from_x), (&c.to_platform, c.to_x)] {
                let p = self
                    .platforms
                    .iter()
                    .find(|p| &p.id == id)
                    .ok_or("connector platform missing")?;
                if !x.is_finite() || x < p.x_min || x > p.x_max {
                    return Err("connector endpoint outside platform".into());
                }
            }
        }
        Ok(())
    }
    pub fn support(&self, x: f64, y: f64) -> Option<&Platform> {
        self.platforms
            .iter()
            .find(|p| (p.y - y).abs() < 0.01 && x >= p.x_min && x <= p.x_max)
    }
}

pub fn normalize_positions(world: &mut WorldState) {
    let scene = &world.scene;
    for position in world.characters.values_mut().map(|c| &mut c.position) {
        let platform = scene
            .support(position.x, position.y)
            .unwrap_or(&scene.platforms[0]);
        position.x = position.x.clamp(platform.x_min, platform.x_max);
        position.y = platform.y;
    }
    world
        .character_postures
        .retain(|id, _| world.characters.contains_key(id));
    for id in world.characters.keys() {
        world.character_postures.entry(id.clone()).or_default();
    }
}

/// Resolve legacy decorative vertical rows only when loading authored levels.
/// Snapshots preserve exact coordinates and never silently rearrange actors.
pub fn resolve_spawn_overlaps(world: &mut WorldState) {
    let mut ids: Vec<_> = world.characters.keys().cloned().collect();
    ids.sort();
    let mut placed: Vec<(f64, f64)> = vec![];
    for id in ids {
        let character = world.characters.get_mut(&id).expect("listed character");
        let platform = world
            .scene
            .support(character.position.x, character.position.y)
            .expect("normalized support");
        let origin = character.position.x;
        let mut candidate = origin;
        for index in 0..100 {
            let offset = ((index + 1) / 2) as f64 * 40.0;
            candidate = origin + if index % 2 == 0 { offset } else { -offset };
            if candidate < platform.x_min || candidate > platform.x_max {
                continue;
            }
            if placed
                .iter()
                .all(|(x, y)| (candidate - x).hypot(character.position.y - y) >= 32.0)
            {
                break;
            }
        }
        character.position.x = candidate.clamp(platform.x_min, platform.x_max);
        placed.push((character.position.x, character.position.y));
    }
}
