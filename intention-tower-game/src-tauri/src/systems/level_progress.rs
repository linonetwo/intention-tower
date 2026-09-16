use crate::models::events::WorldEvent;
use crate::models::progress::LevelStatus;
use crate::models::world_state::WorldState;

use super::System;

/// Evaluates data-driven objectives after every simulation mutation.
/// This is intentionally the final gameplay system so conditions observe a settled tick.
pub struct LevelProgressSystem;

impl System for LevelProgressSystem {
    fn name(&self) -> &'static str {
        "LevelProgressSystem"
    }

    fn run(&self, state: &mut WorldState, _dt: f64) {
        if state.progress.status != LevelStatus::InProgress {
            return;
        }

        let failed = state
            .progress
            .failure_rules
            .iter()
            .find(|rule| rule.condition.evaluate(state))
            .map(|rule| rule.label.clone());
        if let Some(reason) = failed {
            state.progress.status = LevelStatus::Lost;
            state.progress.completed_at_tick = Some(state.tick);
            state.progress.outcome_label = Some(reason.clone());
            state.pending_events.push(WorldEvent::LevelLost {
                level_id: state.level_id.clone(),
                tick: state.tick,
                reason,
            });
            return;
        }

        let newly_completed: Vec<(usize, String, String)> = state
            .progress
            .objectives
            .iter()
            .enumerate()
            .filter(|(_, objective)| !objective.completed && objective.condition.evaluate(state))
            .map(|(index, objective)| {
                (
                    index,
                    objective.objective_id.clone(),
                    objective.label.clone(),
                )
            })
            .collect();

        for (index, objective_id, label) in newly_completed {
            let objective = &mut state.progress.objectives[index];
            objective.completed = true;
            objective.completed_at_tick = Some(state.tick);
            state.pending_events.push(WorldEvent::ObjectiveCompleted {
                objective_id,
                label,
            });
        }

        let has_required = state
            .progress
            .objectives
            .iter()
            .any(|objective| objective.required);
        let all_required_complete = has_required
            && state
                .progress
                .objectives
                .iter()
                .filter(|objective| objective.required)
                .all(|objective| objective.completed);

        if all_required_complete {
            state.progress.status = LevelStatus::Won;
            state.progress.completed_at_tick = Some(state.tick);
            state.pending_events.push(WorldEvent::LevelWon {
                level_id: state.level_id.clone(),
                tick: state.tick,
            });
        }
    }
}
