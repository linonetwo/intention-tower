# Opt-in layered worlds

`scene.json.layered_world` enables generic actor-local context semantics. Levels
without it keep legacy `SetVirtualContext` behavior. No runtime branch depends
on the level directory name.

Configuration uses snake_case, like other scene data:

```json
{
  "actor_ids": ["player"],
  "contexts": [
    {
      "id": "reality",
      "room_ids": ["workshop", "garden"],
      "arrival": {"x": 300, "y": 300},
      "arrival_room": "workshop",
      "entry_item_id": "terminal",
      "return_item_id": null,
      "cue_item_id": "clock",
      "cue_fact": "layer.fact.reality"
    }
  ],
  "interaction_range": 60,
  "need_schema_id": "it:concept/hunger",
  "meal_item_id": "real-meal",
  "need_relief": 0.6,
  "need_max": 0.25
}
```

The example shows one context's fields; a valid configuration contains 2–8
ordered contexts, root first. Entry from N goes only to N+1. Every non-root
context has a return terminal; the last context has no next entry. Each room
belongs to one context. Ordinary portals must stay inside that context. Cue
items and facts are distinct. The finite real meal belongs to the root.
Physical need is an existing actor PriorInstinct, not a virtual reward.

All six effects are unit variants: `EnterLayer`, `ExitLayer`, `ObserveLayer`,
`CompareLayers`, `EarnLayerReward`, `SatisfyLayerNeed`. Author them as NoTarget
commands with `ActorIs` restrictions. Actor eligibility is enforced again by
the effects. A supplied target must be absent or the actor (ordinary NoTarget
normalization ignores selected UI targets). Proximity requires the same room
and horizontal distance no greater than `interaction_range`, at most 60.
Items can be drawn above the floor without requiring the actor to fly.
Availability and execution use the same checks; compound commands stage all
effects and roll back on failure.

`world.layered_world` maps actor IDs to state:

- `context_id`, `stack`: saved parent context, room, position and entry tick.
- `transitions`: immutable entry/return receipts including source and
  destination context, room, position and tick. Validation replays this log
  to substantiate stack, `max_depth` and `unwind_count`.
- `observations`: context-ID keyed records with stable ID
  `layer-observation:<actor>:<context>`, local item/fact/room/position,
  `depth`, `is_virtual`, and `observed_at_tick`. Permanent Observation nodes
  retain the matching identity and provenance across context changes.
- `comparison`: actual observation-ID references and comparison tick.
- `rewards`: at most one per virtual context, never physical relief.
- `need_receipt`: consumed item, before/after physical need and tick.
- `legacy_virtual_context_stack`, `legacy_in_virtual_context`: archive only;
  these never count as evidence.

Transitions, observations, comparison and need receipts each contain an actor-local
`sequence`. `next_sequence` stores the last allocated sequence (zero initially).
The shared validator combines all four kinds in contiguous sequence order and
requires nondecreasing ticks. Each note must have been recorded while its actor
was resident in that context; comparison must follow all referenced local notes;
the real meal must follow comparison and a complete unwind. This distinguishes
legitimate same-tick commands without treating an arbitrary earlier entry or a
later final state as proof of a historical action. Duplicate, missing or reordered
sequence receipts reject. Nonempty layered histories without sequence provenance
are not silently upgraded into valid causal evidence.

`LayeredWorldChanged` events include `actor_id`, `context_id`, `depth`, `kind`
and `fact`. Entry/return facts contain the transition receipt; observation,
comparison, reward and need facts contain their immutable historical payload.
Renderers must not reconstruct old facts from the actor's current mutable
room or context. Sensory observations are stamped from the perceiving actor's
context, never the default actor's global flag. Legacy global virtual fields
are derived only from the default actor for compatibility.

Objective predicate:

```json
{"type":"layeredJourney","characterId":"player","complete":true}
```

`complete:false` requires reaching the deepest configured context and a valid
comparison of all contexts. `complete:true` also requires a complete unwind,
current root context, one consumed real meal with at least 0.5 actual need
reduction, and current physical need no higher than `need_max`. Historical
command counters cannot substitute for these receipts. Required layered
predicates are rechecked at victory, even if their objective was latched.

Shared restore validation runs before position normalization so bad current
rooms/coordinates, stack frames, references and future timestamps cannot be
silently repaired. Missing actor state initializes in the root without
inventing visits or observations; old virtual flags are archived only. This
is structural consistency, not cryptographic authentication of edited saves.

## Explicit migration from a single-map authored scene

Desktop `load_save` and MCP `restore_snapshot` resolve current level authoring
using their existing resource lookup, after validating the saved level ID as a
bounded ASCII lowercase/digit/hyphen/underscore identifier. The shared
`prepare_restored_world_with_authoring` checks the loaded author's level ID
against the saved ID. Migration runs only when current authoring opts into
layered worlds and the saved scene does not. Other levels and already-layered
snapshots keep their existing restore behavior.

Migration is in-memory and never overwrites the source save file. It starts
from the authored real spawn, scene, items, commands and objective rules, with
empty causal layered history. Existing characters' mind graphs retain their
nodes, edges and personality; missing authored node schemas, such as the real
hunger instinct, are added. Unsupported old completion is not credited.

`world.layered_world_migration` stores `level_id`, `migrated_at_tick`,
`legacy_in_virtual_context`, `legacy_virtual_context_stack`, `legacy_progress`
(including command counts and old objective status), and
`message_key: "layer.migration.legacy-reset"`. A `LayeredWorldChanged` event
with `kind: "migrated"`, root context/depth zero and this immutable receipt as
`fact` announces the reset. UI text must explain that old single-map progress
cannot establish actual nested visits. The archive never supplies observations,
comparison references, visit receipts or victory evidence. Missing actors,
malformed source topology, future legacy timestamps, mismatched IDs and
path-traversal IDs reject atomically before replacing the active world.
