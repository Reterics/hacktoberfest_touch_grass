// Shared types for the Moss game state and the laptop <-> phone protocol.
// Everything here is plain data so it can travel over WebSockets and be persisted as JSON.

export const STAT_KEYS = [
  'happiness',
  'energy',
  'nature',
  'movement',
  'rest',
  'curiosity',
  'hunger',
  'bathroom',
] as const
export type StatKey = (typeof STAT_KEYS)[number]

/** 0..100, higher means the need is satisfied. */
export type Stats = Record<StatKey, number>

export interface StatModifier {
  stat: StatKey
  delta: number
}

export type QuestCategory = 'movement' | 'nature' | 'recovery' | 'curiosity' | 'playful'

/** MVP completion types (see docs/GAME-DESIGN.md#quest-requirements). */
export type CompletionType = 'PHOTO' | 'TIMER' | 'USER_CONFIRMATION' | 'VISION_VALIDATION'

/** Broad concepts the vision model is allowed to check for. */
export type VisionTarget =
  | 'tree'
  | 'grass'
  | 'flower'
  | 'sky'
  | 'leaf'
  | 'plant'
  | 'yellow object'

export type QuestStatus = 'active' | 'validating' | 'completed' | 'skipped' | 'expired'

export interface Quest {
  id: string
  templateId: string
  need: StatKey
  category: QuestCategory
  title: string
  description: string
  /** Short in-character line Moss says when the quest appears. */
  mossLine: string
  completionType: CompletionType
  visionTarget?: VisionTarget
  /** For TIMER quests: how long the activity lasts. */
  timerMs?: number
  /** For TIMER quests: when the user started the activity on the phone. */
  timerStartedAt?: number
  xpReward: number
  affectedStats: StatModifier[]
  /** Whether wording came from the local model or the deterministic fallback. */
  source: 'ai' | 'fallback'
  status: QuestStatus
  /** Number of rejected / failed validation attempts. */
  attempts: number
  /** Set when a technical validation failure happened, unlocking manual completion. */
  manualAllowed: boolean
  createdAt: number
}

export type TimerPhase = 'idle' | 'focus' | 'break'

export interface TimerPreset {
  id: string
  label: string
  focusMs: number
  breakMs: number
}

export interface TimerState {
  phase: TimerPhase
  presetId: string
  startedAt: number | null
  endsAt: number | null
  /** When paused, the remaining time in the current phase. */
  pausedRemainingMs: number | null
}

export type UnlockId = 'tiny_tree' | 'grass_patch' | 'flower_pot' | 'sun_crystal' | 'desk_plant' | 'ecosystem'

export type AchievementId = 'touched_grass' | 'forest_friend' | 'photosynthesis' | 'chlorophyll_addict' | 'outdoor_engineer'

export interface CreatureState {
  name: string
  level: number
  /** XP accumulated toward the next level. */
  xp: number
  totalXp: number
  stats: Stats
  unlocks: UnlockId[]
  achievements: AchievementId[]
  skippedBreaksInRow: number
  /** Consecutive local days with at least one completed quest. */
  streakDays: number
  lastQuestDay: string | null
  focusSessionsCompleted: number
  questsCompleted: number
  /** Completed quest counts by template id, used for unlocks and achievements. */
  questCounts: Record<string, number>
  recentTemplateIds: string[]
  recentNeeds: StatKey[]
}

export type MossEmotion = 'neutral' | 'happy' | 'excited' | 'tired' | 'concerned' | 'annoyed' | 'curious' | 'sleepy'

export interface Dialogue {
  text: string
  emotion: MossEmotion
  at: number
}

export type AIStatusState = 'checking' | 'ready' | 'ollama_offline' | 'model_missing' | 'no_vision' | 'error'

export interface AIStatus {
  state: AIStatusState
  message: string
  host: string
  textModel: string
  visionModel: string
  /** Exact command the user can run to fix a missing model. */
  fixCommand?: string
}

export interface GameState {
  creature: CreatureState
  timer: TimerState
  quest: Quest | null
  dialogue: Dialogue | null
  /** Outcome of the most recent quest, kept until the next focus session. */
  lastResult: QuestResult | null
}

export interface QuestResult {
  questId: string
  title: string
  success: boolean
  xpGained: number
  statChanges: StatModifier[]
  leveledUp: boolean
  newUnlocks: UnlockId[]
  newAchievements: AchievementId[]
  manual: boolean
  at: number
}

/** Ephemeral events used by the UI for one-shot animations. Not persisted. */
export type GameEvent =
  | { kind: 'focus_started'; at: number }
  | { kind: 'focus_completed'; at: number; xpGained: number }
  | { kind: 'break_started'; at: number; questId: string }
  | { kind: 'break_ended'; at: number; questCompleted: boolean }
  | { kind: 'break_skipped'; at: number; debuffApplied: boolean }
  | { kind: 'quest_updated'; at: number; questId: string }
  | { kind: 'quest_validating'; at: number; questId: string }
  | { kind: 'quest_rejected'; at: number; questId: string; reason: string; technical: boolean }
  | { kind: 'quest_completed'; at: number; result: QuestResult }
  | { kind: 'level_up'; at: number; level: number }
  | { kind: 'unlock'; at: number; unlock: UnlockId }
  | { kind: 'achievement'; at: number; achievement: AchievementId }

export interface PairingInfo {
  url: string
  qrSvg: string
  expiresAt: number
}

export interface ServerSnapshot {
  state: GameState
  ai: AIStatus
  presets: TimerPreset[]
  serverNow: number
  phoneConnected: boolean
}

export type ServerMessage =
  | { type: 'snapshot'; snapshot: ServerSnapshot }
  | { type: 'event'; event: GameEvent }
