import type { AchievementId, Stats, StatKey, TimerPreset, UnlockId } from '@moss/shared'

/*
 * The single balance table for Moss.
 *
 * Decisions for the questions left open in docs/GAME-DESIGN.md#balance-decisions-still-open:
 * - Stats range 0..100. Needs drain only when a focus session completes, scaled by session length
 *   (45 min = 1x, clamped to 0.5x..2x). No passive decay while the app is closed: no guilt for being away.
 * - Hydration is not a separate stat. Drink-water style quests restore Hunger.
 * - Level N -> N+1 costs 100 + 50 * (N - 1) XP.
 * - Skipping breaks: every 3rd consecutive skip applies a -20 Happiness "sedentary debuff".
 *   Completing any quest resets the counter.
 * - A quest stays open after the break timer ends; it only counts as skipped when the next focus starts.
 * - Manual completion of a photo quest (after a technical failure or repeated rejections) restores stats
 *   but grants half XP.
 * - Streak = consecutive local days with at least one completed quest.
 */

export const STAT_MIN = 0
export const STAT_MAX = 100

export const INITIAL_STATS: Stats = {
  happiness: 75,
  energy: 58,
  nature: 66,
  movement: 72,
  rest: 78,
  curiosity: 74,
  hunger: 82,
  bathroom: 76,
}

const MIN = 60_000

export const PRESETS: TimerPreset[] = [
  { id: '25-5', label: '25 / 5', focusMs: 25 * MIN, breakMs: 5 * MIN },
  { id: '45-5', label: '45 / 5', focusMs: 45 * MIN, breakMs: 5 * MIN },
  { id: '50-10', label: '50 / 10', focusMs: 50 * MIN, breakMs: 10 * MIN },
  { id: '90-15', label: '90 / 15', focusMs: 90 * MIN, breakMs: 15 * MIN },
  // Short loop for development and live demos.
  { id: 'demo', label: 'Demo 30s / 2m', focusMs: 30_000, breakMs: 2 * MIN },
]
export const DEFAULT_PRESET_ID = '45-5'

/** Stat drain per 45 minutes of focus. */
export const FOCUS_DRAIN_PER_45_MIN: Record<StatKey, number> = {
  happiness: -2,
  energy: -8,
  movement: -12,
  curiosity: -3,
  nature: -6,
  rest: -6,
  bathroom: -8,
  hunger: -5,
}
export const FOCUS_XP_PER_45_MIN = 30
export const FOCUS_XP_MIN = 15
export const FOCUS_SCALE_MIN = 0.5
export const FOCUS_SCALE_MAX = 2

export const QUEST_COMPLETION_HAPPINESS = 3
export const MANUAL_PHOTO_XP_FACTOR = 0.5
/** Rejections after which manual completion becomes available. */
export const MANUAL_AFTER_REJECTIONS = 2
/** Minimum confidence for a vision verdict to pass. */
export const VISION_CONFIDENCE_THRESHOLD = 0.6

export const SKIP_DEBUFF_EVERY = 3
export const SKIP_DEBUFF_HAPPINESS = -20

/** Recently used needs get this score penalty so Moss varies its requests. */
export const RECENT_NEED_PENALTY = 20
export const RECENT_NEED_WINDOW = 2
export const RECENT_TEMPLATE_WINDOW = 3

/** TIMER quests never take more than this share of the break. */
export const TIMER_QUEST_MAX_BREAK_SHARE = 0.6

export function xpToNextLevel(level: number): number {
  return 100 + 50 * (level - 1)
}

export interface UnlockRule {
  id: UnlockId
  /** Shown in the UI when unlocked. */
  label: string
  isUnlocked: (counts: Record<string, number>, questsCompleted: number) => boolean
}

export const UNLOCK_RULES: UnlockRule[] = [
  { id: 'tiny_tree', label: 'A tiny tree sprouted next to Moss', isUnlocked: (c) => (c.tree ?? 0) >= 1 },
  { id: 'grass_patch', label: 'A patch of real grass appeared', isUnlocked: (c) => (c.grass ?? 0) >= 1 },
  { id: 'flower_pot', label: 'A flower pot appeared', isUnlocked: (c) => (c.flower ?? 0) >= 1 },
  { id: 'sun_crystal', label: 'Moss stored some sunlight', isUnlocked: (c) => (c.sky ?? 0) >= 1 },
  { id: 'desk_plant', label: 'The desk plant grew bigger', isUnlocked: (_c, n) => n >= 10 },
  { id: 'ecosystem', label: 'A lush miniature ecosystem', isUnlocked: (_c, n) => n >= 50 },
]

export interface AchievementRule {
  id: AchievementId
  title: string
  description: string
  isEarned: (counts: Record<string, number>, questsCompleted: number) => boolean
}

const PLANT_QUESTS = ['tree', 'grass', 'flower', 'leaf']

/** Achievements are deterministic milestones; the art lives in apps/web/public/assets/achievements. */
export const ACHIEVEMENT_RULES: AchievementRule[] = [
  {
    id: 'touched_grass',
    title: 'Actually Touched Grass',
    description: 'Completed your first grass quest.',
    isEarned: (c) => (c.grass ?? 0) >= 1,
  },
  {
    id: 'forest_friend',
    title: 'Forest Friend',
    description: 'Completed 10 tree quests.',
    isEarned: (c) => (c.tree ?? 0) >= 10,
  },
  {
    id: 'photosynthesis',
    title: 'Photosynthesis',
    description: 'Completed 7 sunlight quests.',
    isEarned: (c) => (c.sky ?? 0) >= 7,
  },
  {
    id: 'chlorophyll_addict',
    title: 'Chlorophyll Addict',
    description: 'Completed 50 plant quests.',
    isEarned: (c) => PLANT_QUESTS.reduce((n, id) => n + (c[id] ?? 0), 0) >= 50,
  },
  {
    id: 'outdoor_engineer',
    title: 'Outdoor Engineer',
    description: 'Took 100 breaks outside.',
    isEarned: (_c, n) => n >= 100,
  },
]
