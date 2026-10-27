use intention_tower_game_lib::models::commands::{CommandDTO, CommandDef, TargetingMode};
use intention_tower_game_lib::models::world_state::WorldState;

/// Register an explicitly synthetic fixture command, never replace an authored
/// level definition. Queue an untrusted DTO with no executable payload.
pub fn queue_fixture_command(world: &mut WorldState, command: CommandDTO) {
    assert!(
        !world
            .command_defs
            .iter()
            .any(|def| def.command_id == command.command_id),
        "fixture must not overwrite authored command {}",
        command.command_id
    );
    world.command_defs.push(CommandDef {
        command_id: command.command_id.clone(),
        label: format!("test.{}", command.command_id),
        hotkey: None,
        targeting: if command.target_id.is_some() {
            TargetingMode::RequiresTarget
        } else {
            TargetingMode::NoTarget
        },
        preconditions: Vec::new(),
        effect_templates: command.effects.clone(),
    });
    world.pending_commands.push(CommandDTO {
        effects: Vec::new(),
        ..command
    });
}
