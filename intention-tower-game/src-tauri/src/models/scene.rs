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
pub struct Room {
    pub id: String,
    pub label: String,
    pub x_min: f64,
    pub x_max: f64,
    pub platform_ids: Vec<String>,
    #[serde(default)]
    pub background_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Portal {
    pub id: String,
    pub from_room: String,
    pub to_room: String,
    pub from_platform: String,
    pub to_platform: String,
    pub x: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDefinition {
    #[serde(default)]
    pub room_memory: Option<super::room_memory::RoomMemoryConfig>,
    /// Authored pass-through actors; all other characters remain solid.
    #[serde(default)]
    pub non_blocking_characters: Vec<String>,
    pub platforms: Vec<Platform>,
    #[serde(default)]
    pub connectors: Vec<Connector>,
    #[serde(default)]
    pub rooms: Vec<Room>,
    #[serde(default)]
    pub portals: Vec<Portal>,
}

impl Default for SceneDefinition {
    fn default() -> Self {
        Self {
            room_memory: None,
            non_blocking_characters: vec![],
            platforms: vec![Platform {
                id: "ground".into(),
                x_min: 0.0,
                x_max: 800.0,
                y: 300.0,
            }],
            connectors: vec![],
            rooms: vec![],
            portals: vec![],
        }
    }
}

impl SceneDefinition {
    pub fn validate(&self) -> Result<(), String> {
        let mut pass_through_ids = std::collections::HashSet::new();
        if self
            .non_blocking_characters
            .iter()
            .any(|id| id.trim().is_empty() || !pass_through_ids.insert(id))
        {
            return Err("invalid non-blocking character IDs".into());
        }
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
        let mut room_ids = std::collections::HashSet::new();
        let mut assigned = std::collections::HashSet::new();
        for room in &self.rooms {
            if room.id.is_empty()
                || !room_ids.insert(&room.id)
                || !room.x_min.is_finite()
                || !room.x_max.is_finite()
                || room.x_min >= room.x_max
                || room.platform_ids.is_empty()
            {
                return Err("invalid scene room".into());
            }
            for id in &room.platform_ids {
                let p = self
                    .platforms
                    .iter()
                    .find(|p| &p.id == id)
                    .ok_or("room platform missing")?;
                if !assigned.insert(id) || p.x_min < room.x_min || p.x_max > room.x_max {
                    return Err("invalid room platform membership".into());
                }
            }
        }
        if !self.rooms.is_empty() && assigned.len() != self.platforms.len() {
            return Err("every platform needs exactly one room".into());
        }
        for c in &self.connectors {
            if self.platform_room(&c.from_platform) != self.platform_room(&c.to_platform) {
                return Err("connectors must stay inside one room".into());
            }
        }
        let mut portal_ids = std::collections::HashSet::new();
        for portal in &self.portals {
            if portal.id.is_empty()
                || !portal_ids.insert(&portal.id)
                || !portal.x.is_finite()
                || portal.from_room == portal.to_room
                || !room_ids.contains(&portal.from_room)
                || !room_ids.contains(&portal.to_room)
                || self.platform_room(&portal.from_platform) != portal.from_room
                || self.platform_room(&portal.to_platform) != portal.to_room
            {
                return Err("invalid scene portal".into());
            }
            let a = self
                .platforms
                .iter()
                .find(|p| p.id == portal.from_platform)
                .ok_or("portal platform missing")?;
            let b = self
                .platforms
                .iter()
                .find(|p| p.id == portal.to_platform)
                .ok_or("portal platform missing")?;
            let ra = self
                .rooms
                .iter()
                .find(|r| r.id == portal.from_room)
                .unwrap();
            let rb = self.rooms.iter().find(|r| r.id == portal.to_room).unwrap();
            if a.y != b.y
                || !((a.x_max == portal.x
                    && b.x_min == portal.x
                    && ra.x_max == portal.x
                    && rb.x_min == portal.x)
                    || (b.x_max == portal.x
                        && a.x_min == portal.x
                        && rb.x_max == portal.x
                        && ra.x_min == portal.x))
            {
                return Err("portal must join adjacent same-height endpoints".into());
            }
        }
        if let Some(config) = &self.room_memory {
            let unique = |ids: Vec<&str>| {
                let mut seen = std::collections::HashSet::new();
                !ids.is_empty()
                    && ids
                        .into_iter()
                        .all(|id| !id.trim().is_empty() && seen.insert(id))
            };
            if !unique(config.observer_ids.iter().map(String::as_str).collect())
                || !unique(config.witness_ids.iter().map(String::as_str).collect())
                || !unique(config.rooms.iter().map(|r| r.room_id.as_str()).collect())
                || config.fade_after_ticks == 0
                || config.forget_after_ticks <= config.fade_after_ticks
                || config.drug_duration_ticks == 0
                || config.drug_item_id.trim().is_empty()
                || config.observation_schema_id.trim().is_empty()
                || config
                    .observer_ids
                    .iter()
                    .any(|id| config.witness_ids.contains(id))
            {
                return Err("invalid room-memory configuration".into());
            }
            for room in &config.rooms {
                if !self.rooms.iter().any(|r| r.id == room.room_id)
                    || room.variants.len() < 2
                    || !unique(room.variants.iter().map(|v| v.id.as_str()).collect())
                    || !unique(
                        room.variants
                            .iter()
                            .map(|v| v.background_key.as_str())
                            .collect(),
                    )
                {
                    return Err("invalid room-memory variants".into());
                }
            }
            if config.observation_node_ids.iter().any(|(room, id)| {
                id.trim().is_empty() || !config.rooms.iter().any(|r| &r.room_id == room)
            }) || {
                let ids: Vec<_> = config
                    .rooms
                    .iter()
                    .map(|r| {
                        config
                            .observation_node_ids
                            .get(&r.room_id)
                            .cloned()
                            .unwrap_or_else(|| format!("room-memory:{}", r.room_id))
                    })
                    .collect();
                !unique(ids.iter().map(String::as_str).collect())
            } {
                return Err("invalid room-memory observation IDs".into());
            }
        }
        Ok(())
    }
    pub fn platform_room(&self, platform: &str) -> &str {
        self.rooms
            .iter()
            .find(|r| r.platform_ids.iter().any(|id| id == platform))
            .map(|r| r.id.as_str())
            .unwrap_or("main")
    }
    pub fn room_at(&self, x: f64, y: f64) -> &str {
        self.support(x, y)
            .map(|p| self.platform_room(&p.id))
            .or_else(|| {
                self.rooms
                    .iter()
                    .find(|r| x >= r.x_min && x <= r.x_max)
                    .map(|r| r.id.as_str())
            })
            .unwrap_or("main")
    }
    pub fn support_in_room(&self, x: f64, y: f64, room: &str) -> Option<&Platform> {
        self.platforms.iter().find(|p| {
            self.platform_room(&p.id) == room
                && (p.y - y).abs() < 0.01
                && x >= p.x_min
                && x <= p.x_max
        })
    }
    pub fn support(&self, x: f64, y: f64) -> Option<&Platform> {
        self.platforms
            .iter()
            .find(|p| (p.y - y).abs() < 0.01 && x >= p.x_min && x <= p.x_max)
    }
}

pub fn normalize_positions(world: &mut WorldState) {
    let scene = &world.scene;
    for (id, character) in &mut world.characters {
        let position = &mut character.position;
        let room = world
            .character_rooms
            .get(id)
            .filter(|room| {
                scene.rooms.is_empty() && room.as_str() == "main"
                    || scene.rooms.iter().any(|r| &r.id == *room)
            })
            .map(String::as_str)
            .unwrap_or_else(|| scene.room_at(position.x, position.y))
            .to_owned();
        let platform = scene
            .support_in_room(position.x, position.y, &room)
            .or_else(|| {
                scene
                    .platforms
                    .iter()
                    .find(|p| scene.platform_room(&p.id) == room)
            })
            .unwrap_or(&scene.platforms[0]);
        position.x = position.x.clamp(platform.x_min, platform.x_max);
        position.y = platform.y;
        world
            .character_rooms
            .insert(id.clone(), scene.platform_room(&platform.id).to_owned());
    }
    world
        .character_rooms
        .retain(|id, _| world.characters.contains_key(id));
    world
        .item_rooms
        .retain(|id, _| world.items.contains_key(id));
    for (id, item) in &world.items {
        let inferred = scene.room_at(item.position.x, item.position.y).to_owned();
        let room = world
            .item_rooms
            .entry(id.clone())
            .or_insert(inferred.clone());
        if !scene.rooms.is_empty() && !scene.rooms.iter().any(|r| &r.id == room) {
            *room = inferred;
        }
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
    let mut placed: Vec<(f64, f64, String)> = vec![];
    for id in ids {
        let room = world.entity_room(&id).unwrap_or("main").to_owned();
        let character = world.characters.get_mut(&id).expect("listed character");
        let platform = world
            .scene
            .support_in_room(character.position.x, character.position.y, &room)
            .expect("normalized support");
        let origin = character.position.x;
        let mut candidate = origin;
        for index in 0..100 {
            let offset = ((index + 1) / 2) as f64 * 40.0;
            candidate = origin + if index % 2 == 0 { offset } else { -offset };
            if candidate < platform.x_min || candidate > platform.x_max {
                continue;
            }
            if placed.iter().all(|(x, y, r)| {
                r != &room || (candidate - x).hypot(character.position.y - y) >= 32.0
            }) {
                break;
            }
        }
        character.position.x = candidate.clamp(platform.x_min, platform.x_max);
        placed.push((character.position.x, character.position.y, room));
    }
}
