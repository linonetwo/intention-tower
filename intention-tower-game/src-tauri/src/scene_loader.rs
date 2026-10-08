use crate::{
    level_loader::LoadError,
    models::{scene, world_state::WorldState},
};

pub fn load_scene_from_path(
    world: &mut WorldState,
    level_dir: &std::path::Path,
) -> Result<(), LoadError> {
    let path = level_dir.join("scene.json");
    if path.exists() {
        world.scene = serde_json::from_str(&std::fs::read_to_string(path).map_err(LoadError::Io)?)
            .map_err(LoadError::Json)?;
    } else {
        let max_x = world
            .characters
            .values()
            .map(|c| c.position.x)
            .chain(world.items.values().map(|i| i.position.x))
            .filter(|x| x.is_finite())
            .fold(800.0, f64::max);
        world.scene.platforms[0].x_max = max_x.max(800.0);
    }
    world.scene.validate().map_err(LoadError::NotFound)?;
    scene::normalize_positions(world);
    scene::resolve_spawn_overlaps(world);
    Ok(())
}
