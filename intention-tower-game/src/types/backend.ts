/**
 * TypeScript types matching Rust serialized structures (serde snake_case).
 * These mirror the Rust models exactly as they appear in JSON.
 */

// ── Geometry ──

export interface Position {
  x: number;
  y: number;
}

export type CharacterPosture = 'standing' | 'sitting';
export interface ScenePlatform { id: string; x_min: number; x_max: number; y: number }
export interface SceneConnector { id: string; kind: 'stairs' | 'ladder'; from_platform: string; to_platform: string; from_x: number; to_x: number }
export interface SceneDefinition { platforms: ScenePlatform[]; connectors: SceneConnector[] }

// ── World State ──

export interface WorldState {
  tick: number;
  time_speed: number;
  paused: boolean;
  seed: number;
  /** The level directory ID, e.g. "pavlov" */
  level_id: string;
  level_label: string;
  level_description: string;
  initial_mode: 'observe' | 'micro' | 'graph';
  default_actor_id: string | null;
  default_target_id: string | null;
  characters: Record<string, WorldCharacter>;
  scene?: SceneDefinition;
  character_postures?: Record<string, CharacterPosture>;
  items: Record<string, WorldItem>;
  event_log: WorldEvent[];
  command_defs: CommandDef[];
  pending_commands: PendingCommand[];
  in_virtual_context: boolean;
  virtual_context_stack: string[];
  social_groups: Record<string, SocialGroupState>;
  economy: EconomyState;
  progress: LevelProgress;
}

export interface SocialGroupState {
  group_id: string;
  members: string[];
  cohesion: number;
  consensus_action: string | null;
}

export interface EconomyAsset {
  item_id: string;
  owner_id: string | null;
  supply: number;
  unit_price: number;
  demand: number;
}

export interface EconomyTransaction {
  tick: number;
  item_id: string;
  seller_id: string;
  buyer_id: string;
  quantity: number;
  total_price: number;
}

export interface EconomyState {
  accounts: Record<string, number>;
  holdings: Record<string, Record<string, number>>;
  assets: Record<string, EconomyAsset>;
  transactions: EconomyTransaction[];
}

export type LevelStatus = 'InProgress' | 'Won' | 'Lost';

export interface LevelProgress {
  status: LevelStatus;
  objectives: ObjectiveState[];
  failure_rules: FailureRule[];
  command_counts: Record<string, number>;
  command_targets: Record<string, string[]>;
  completed_at_tick: number | null;
  outcome_label: string | null;
}

export interface ObjectiveState {
  objective_id: string;
  label: string;
  condition: LevelCondition;
  required: boolean;
  completed: boolean;
  completed_at_tick: number | null;
}

export interface FailureRule {
  rule_id: string;
  label: string;
  condition: LevelCondition;
}

export type LevelCondition = Record<string, unknown>;

export interface ActionEpisodesCondition {
  type: 'actionEpisodes';
  characterId: string;
  actionSchemaId: string;
  minCount?: number;
  rewarded?: boolean;
  autonomous?: boolean;
}

export interface ImprintedTargetCondition {
  type: 'imprintedTarget';
  characterId: string;
  motivationSchemaId: string;
  targetEntity: string;
}

export interface FollowedTargetCondition {
  type: 'followedTarget';
  characterId: string;
  motivationSchemaId: string;
  targetEntity: string;
  minDistance: number;
  minTicks: number;
  minSeparationDistance: number;
  maxTargetDistance: number;
}

/** A command queued for execution on the next tick. */
export interface PendingCommand {
  command_id: string;
  actor_id: string;
  target_id: string | null;
}

export interface WorldCharacter {
  id: string;
  label: string;
  position: Position;
  mind_graph: MindGraph;
}

export interface WorldItem {
  id: string;
  schema_type: string;
  label: string;
  position: Position;
  abstract_type: string | null;
  owner_id: string | null;
  quantity: number;
  unit_price: number;
}

// ── Mind Graph ──

export interface MindGraph {
  character_id: string;
  nodes: Record<string, MindNode>;
  edges: Record<string, AssociationEdge>;
  conditioning_trials?: ConditioningTrial[];
  conditioning_stats?: Record<string, ConditioningStats>;
  action_episodes?: ActionEpisode[];
  last_external_observation_at?: number | null;
}

export interface ActionEpisode {
  action_id: string;
  action_schema_id: string;
  executed_at: number;
  contexts: { instance_id: string; schema_id: string; value: number }[];
  autonomous: boolean;
  reward_consumed_at?: number | null;
  reinforcement_dopamine_spent?: number;
  rewarded_at: number | null;
}

export interface ConditioningTrial {
  source_id: string;
  target_id: string;
  started_at: number;
  deadline: number;
  prediction: number;
  reward: number;
  responded: boolean;
}

export interface ConditioningStats {
  paired_trials: number;
  independent_responses: number;
  omitted_rewards: number;
}

export type NodeType = 'Observation' | 'PriorInstinct' | 'Motivation' | 'Action' | 'Meme';

export interface MindNode {
  instance_id: string;
  schema_id: string;
  label: string;
  node_type: NodeType;
  value: number;
  value_velocity: number;
  strength: number;
  active: boolean;
  attended: boolean;
  suppression: number;
  created_at: number;
  ttl: number | null;
  hidden_by_default: boolean;
  thresholds: ThresholdTrigger[];
  costs: ResourceCost[];
  observation: ObservationData | null;
  prior_instinct: PriorInstinctData | null;
  motivation: MotivationData | null;
  action: ActionData | null;
  meme: MemeData | null;
  prev_value: number;
  reality_layer: number;
  is_virtual: boolean;
}

export interface ThresholdTrigger {
  trigger_id: string;
  spawn_schema_id: string;
  spawn_node_type: NodeType;
  activate_on_rising_above: number;
  deactivate_on_falling_below: number;
  managed_instance_id: string | null;
}

export interface ResourceCost {
  resource_schema_id: string;
  amount: number;
}

export interface ObservationData {
  presentation_count?: number;
  social_consumed_at?: number | null;
  modality: string | null;
  about: string | null;
  novelty_key: string | null;
  credibility: number;
  satisfaction: number;
  source: string | null;
  is_signal?: boolean;
  signal_type?: SignalType | null;
  emitter_id?: string | null;
  group_context?: string | null;
  replica_of?: string | null;
}

export type SignalType = 'Status' | 'Belonging' | 'Threat' | 'Approval' | 'Rejection' | 'Chemical';

export interface SocialNeedBinding {
  need_schema_id: string;
  relief: number;
}

export interface PriorInstinctData {
  set_point: number;
  satisfied_by_about: string[];
  brain_region: string | null;
  overridable_by_meme: boolean;
  is_mood: boolean;
  is_resource: boolean;
}

export interface MotivationData {
  goal: string | null;
  is_chained: boolean;
  chain_target: string | null;
  target_entity: string | null;
  critical_period_end: number | null;
  lookback_window_sec: number;
  imprinting?: ImprintingConfig | null;
  imprinting_evidence?: ImprintingEvidence | null;
}

export interface ImprintingConfig {
  observation_schemas: string[];
  follow_action_schema: string;
  separation_instinct_schema: string;
  follow_speed: number;
  comfort_radius: number;
}

export interface ImprintingEvidence {
  target_entity: string;
  source_id: string;
  imprinted_at: number;
  dopamine_spent: number;
  followed_distance: number;
  follow_ticks: number;
  max_separation_distance: number;
}

export interface ActionData {
  sub_action_schemas?: string[];
  emitted_observation_schemas?: string[];
  autonomous_need_schema_ids?: string[];
  autonomous_need_min_value?: number | null;
  innate: boolean;
  goap: boolean;
  proficiency_level: number;
  selected: boolean;
}

export interface MemeData {
  social_need_bindings?: SocialNeedBinding[];
  constituent_schemas: string[];
  binding_sites: string[];
  spread_vector: string | null;
  is_belief: boolean;
  is_identity: boolean;
  is_attention_flood: boolean;
  is_anti_meme: boolean;
  is_magic: boolean;
  overrides_instinct: string[];
  conflict_resolution: string | null;
  group_id: string | null;
  reinforced_by: string[];
  resilience: number;
  flood_node_count: number | null;
  flood_drain_rate_per_tick: number | null;
  anti_meme_target_pattern: string | null;
}

// ── Edges ──

export interface AssociationEdge {
  edge_id: string;
  source_instance_id: string;
  target_instance_id: string;
  polarity: 'Excitatory' | 'Inhibitory';
  weight: number;
  learnable: boolean;
  decay_rate_per_tick: number;
  learn_type: string;
  evidence: Evidence;
}

export interface Evidence {
  co_occurrence_count: number;
  last_co_occurred_at: number;
  window_sec: number;
}

// ── Commands ──

export interface CommandDef {
  command_id: string;
  label: string;
  hotkey: string | null;
  targeting: 'RequiresTarget' | 'NoTarget' | 'OptionalTarget';
  preconditions: Precondition[];
  effect_templates: CommandEffect[];
}

export type Precondition =
  | { ActorIs: { character_ids: string[] } }
  | { TargetIs: { character_ids: string[] } }
  | 'TargetIsNotActor'
  | { EnvHasItem: { item_schema_id: string } }
  | { TargetHasNode: { schema_id: string } }
  | { TargetNodeActive: { schema_id: string } }
  | { TargetActionSelected: { schema_id: string } }
  | { TargetActionExecuted: { schema_id: string } }
  | { TargetNodeValue: { schema_id: string; op: string; threshold: number } }
  | { ActorResource: { resource_schema_id: string; op: string; threshold: number } }
  | { IsVirtualContext: { value: boolean } };

export type CommandEffect =
  | { SpawnObservation: { schema_id: string; modality: string; about: string; ttl: number; strength: number; signal_type?: SignalType | null; group_context?: string | null; target_character_id: string | null } }
  | { ModifyNodeValue: { schema_id: string; delta: number; target_character_id: string | null } }
  | { ConsumeResource: { resource_schema_id: string; amount: number; target_character_id: string | null } }
  | { ReinforceEdge: { source_schema_id: string; target_schema_id: string; delta: number; character_id: string | null } }
  | { WeakenEdge: { source_schema_id: string; target_schema_id: string; delta: number; character_id: string | null } }
  | { InjectMeme: { meme_schema_id: string; target_character_id: string | null; meme: MemeData } }
  | { DeleteNode: { schema_id: string; target_character_id: string | null } }
  | { ModifyResourceRegen: { resource_schema_id: string; new_regen_rate: number; target_character_id: string | null } }
  | { MoveCharacter: { delta_x: number; delta_y: number; target_character_id: string | null } }
  | { SetVirtualContext: { value: boolean } }
  | { SetAssetPrice: { item_id: string; unit_price: number } }
  | { TradeAsset: { item_id: string; buyer_id: string; seller_id: string; quantity: number } };

// ── Events ──
// Rust tagged enum serialized by serde: {"VariantName": {fields}}

export type WorldEvent =
  | { NodeSpawned: { character_id: string; instance_id: string; schema_id: string; node_type: string } }
  | { NodeDespawned: { character_id: string; instance_id: string } }
  | { NodeValueChanged: { character_id: string; instance_id: string; old_value: number; new_value: number } }
  | { NodeActivated: { character_id: string; instance_id: string } }
  | { NodeDeactivated: { character_id: string; instance_id: string } }
  | { NodeAttentionChanged: { character_id: string; instance_id: string; attended: boolean } }
  | { NodeSuppressionChanged: { character_id: string; instance_id: string; suppression: number } }
  | { ActionSelected: { character_id: string; instance_id: string } }
  | { ActionExecuted: { character_id: string; instance_id: string; executed_at: number; autonomous: boolean } }
  | { CharacterMoved: { character_id: string; from_x: number; from_y: number; to_x: number; to_y: number } }
  | { SocialGroupUpdated: { group_id: string; member_count: number; cohesion: number; consensus_action: string | null } }
  | { AssetPriceChanged: { item_id: string; old_price: number; new_price: number } }
  | { AssetTraded: { item_id: string; seller_id: string; buyer_id: string; quantity: number; total_price: number } }
  | { AssetTradeRejected: { item_id: string; buyer_id: string; reason: string } }
  | { EdgeCreated: { character_id: string; edge_id: string; source_id: string; target_id: string; weight: number } }
  | { EdgeWeightChanged: { character_id: string; edge_id: string; old_weight: number; new_weight: number } }
  | { LearningUpdated: { character_id: string; edge_id: string; source_id: string; target_id: string; reward: number; prediction: number; prediction_error: number; dopamine_spent: number; old_weight: number; new_weight: number; phase: 'created' | 'reinforced' | 'extinguished' } }
  | { EdgeRemoved: { character_id: string; edge_id: string } }
  | { ResourceConsumed: { character_id: string; resource_schema_id: string; amount: number; remaining: number } }
  | { CommandExecuted: { actor_id: string; command_id: string; target_id: string | null } }
  | { CommandRejected: { actor_id: string; command_id: string; target_id: string | null; reason: string } }
  | { NodeDeletionResisted: { character_id: string; instance_id: string; remaining_resilience: number } }
  | { SoundEmitted: { source_entity_id: string; about: string; modality: string } }
  | { FoodPresented: { source_entity_id: string; about: string } }
  | { ThresholdCrossed: { character_id: string; instance_id: string; trigger_id: string; direction: string } }
  | { VirtualContextChanged: { value: boolean; depth: number } }
  | { ObjectiveCompleted: { objective_id: string; label: string } }
  | { LevelWon: { level_id: string; tick: number } }
  | { LevelLost: { level_id: string; tick: number; reason: string } }
  | { TickCompleted: { tick: number } };

// ── Save / Load ──

export interface SaveMeta {
  slot: string;
  level_id: string;
  tick: number;
  timestamp: string;
}

/** Helper: get the event type name */
export function eventType(e: WorldEvent): string {
  return Object.keys(e)[0];
}

/** Helper: get the event payload */
export function eventPayload(e: WorldEvent): Record<string, unknown> {
  return Object.values(e)[0] as Record<string, unknown>;
}
