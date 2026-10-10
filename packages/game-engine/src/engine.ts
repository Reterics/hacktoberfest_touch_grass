import {
  STAT_KEYS,
  type CreatureState,
  type Dialogue,
  type GameEvent,
  type GameState,
  type MossEmotion,
  type Quest,
  type QuestResult,
  type StatKey,
  type StatModifier,
  type Stats,
  type TimerPreset,
  type UnlockId,
  type AchievementId,
} from '@moss/shared'
import {
  ACHIEVEMENT_RULES,
  DEFAULT_PRESET_ID,
  FOCUS_DRAIN_PER_45_MIN,
  FOCUS_SCALE_MAX,
  FOCUS_SCALE_MIN,
  FOCUS_XP_MIN,
  FOCUS_XP_PER_45_MIN,
  INITIAL_STATS,
  MANUAL_AFTER_REJECTIONS,
  MANUAL_PHOTO_XP_FACTOR,
  PRESETS,
  QUEST_COMPLETION_HAPPINESS,
  RECENT_NEED_PENALTY,
  RECENT_NEED_WINDOW,
  RECENT_TEMPLATE_WINDOW,
  SKIP_DEBUFF_EVERY,
  SKIP_DEBUFF_HAPPINESS,
  STAT_MAX,
  STAT_MIN,
  TIMER_QUEST_MAX_BREAK_SHARE,
  UNLOCK_RULES,
  VISION_CONFIDENCE_THRESHOLD,
  xpToNextLevel,
} from './balance.ts'
import { QUEST_TEMPLATES, type QuestTemplate } from './quests.ts'

export interface EngineResult {
  state: GameState
  events: GameEvent[]
}

/** Thrown when a command is not valid in the current state. */
export class EngineError extends Error {}

const FOCUS_REFERENCE_MS = 45 * 60_000

export function createInitialState(): GameState {
  return {
    creature: {
      name: 'Moss',
      level: 1,
      xp: 0,
      totalXp: 0,
      stats: { ...INITIAL_STATS },
      unlocks: [],
      achievements: [],
      skippedBreaksInRow: 0,
      streakDays: 0,
      lastQuestDay: null,
      focusSessionsCompleted: 0,
      questsCompleted: 0,
      questCounts: {},
      recentTemplateIds: [],
      recentNeeds: [],
    },
    timer: { phase: 'idle', presetId: DEFAULT_PRESET_ID, startedAt: null, endsAt: null, pausedRemainingMs: null },
    quest: null,
    dialogue: null,
    lastResult: null,
  }
}

export function getPreset(id: string): TimerPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
}

function clampStat(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)))
}

export function applyStatModifiers(stats: Stats, mods: StatModifier[]): Stats {
  const next = { ...stats }
  for (const m of mods) next[m.stat] = clampStat(next[m.stat] + m.delta)
  return next
}

function say(text: string, emotion: MossEmotion, at: number): Dialogue {
  return { text, emotion, at }
}

/** Local calendar day, used for streaks. */
export function dayKey(now: number): string {
  const d = new Date(now)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function previousDayKey(now: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return dayKey(d.getTime())
}

/** Adds XP and resolves any level-ups. */
export function addXp(creature: CreatureState, amount: number): { creature: CreatureState; leveledUp: boolean } {
  let { level, xp } = creature
  xp += amount
  let leveledUp = false
  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level)
    level += 1
    leveledUp = true
  }
  return { creature: { ...creature, level, xp, totalXp: creature.totalXp + amount }, leveledUp }
}

function focusScale(focusMs: number): number {
  return Math.max(FOCUS_SCALE_MIN, Math.min(FOCUS_SCALE_MAX, focusMs / FOCUS_REFERENCE_MS))
}

export function focusDrain(focusMs: number): StatModifier[] {
  const scale = focusScale(focusMs)
  return STAT_KEYS.map((stat) => ({ stat, delta: Math.round(FOCUS_DRAIN_PER_45_MIN[stat] * scale) }))
}

export function focusXp(focusMs: number): number {
  return Math.max(FOCUS_XP_MIN, Math.round(FOCUS_XP_PER_45_MIN * focusScale(focusMs)))
}

/** Picks the most pressing need, de-prioritising needs Moss asked for recently. */
export function selectNeed(creature: CreatureState): StatKey {
  const needsWithQuests = new Set(QUEST_TEMPLATES.map((t) => t.need))
  const recent = creature.recentNeeds.slice(-RECENT_NEED_WINDOW)
  let best: StatKey | null = null
  let bestScore = Infinity
  for (const stat of STAT_KEYS) {
    if (!needsWithQuests.has(stat)) continue
    const score = creature.stats[stat] + (recent.includes(stat) ? RECENT_NEED_PENALTY : 0)
    if (score < bestScore) {
      best = stat
      bestScore = score
    }
  }
  return best ?? 'energy'
}

/** Picks a template for the need, avoiding recently used templates. */
export function selectTemplate(creature: CreatureState, need: StatKey): QuestTemplate {
  const forNeed = QUEST_TEMPLATES.filter((t) => t.need === need)
  const recent = creature.recentTemplateIds.slice(-RECENT_TEMPLATE_WINDOW)
  const fresh = forNeed.filter((t) => !recent.includes(t.id))
  if (fresh.length > 0) return fresh[creature.focusSessionsCompleted % fresh.length]!
  // Everything was used recently: take the one used longest ago.
  return [...forNeed].sort((a, b) => recent.lastIndexOf(a.id) - recent.lastIndexOf(b.id))[0]!
}

export function buildQuest(template: QuestTemplate, preset: TimerPreset, now: number): Quest {
  const timerMs =
    template.completionType === 'TIMER' && template.durationMinutes
      ? Math.min(template.durationMinutes * 60_000, Math.round(preset.breakMs * TIMER_QUEST_MAX_BREAK_SHARE))
      : undefined
  return {
    id: `q-${now.toString(36)}-${template.id}`,
    templateId: template.id,
    need: template.need,
    category: template.category,
    title: template.title,
    description: template.description,
    mossLine: template.mossLine,
    completionType: template.completionType,
    visionTarget: template.visionTarget,
    timerMs,
    xpReward: template.xpReward,
    affectedStats: template.affectedStats,
    source: 'fallback',
    status: 'active',
    attempts: 0,
    manualAllowed: template.completionType === 'USER_CONFIRMATION',
    createdAt: now,
  }
}

function isQuestOpen(quest: Quest | null): quest is Quest {
  return !!quest && (quest.status === 'active' || quest.status === 'validating')
}

/** Marks an open quest as skipped and applies the gentle skip rules. */
function skipOpenQuest(state: GameState, now: number): EngineResult {
  if (!isQuestOpen(state.quest)) return { state, events: [] }
  let creature = { ...state.creature, skippedBreaksInRow: state.creature.skippedBreaksInRow + 1 }
  const debuffApplied = creature.skippedBreaksInRow % SKIP_DEBUFF_EVERY === 0
  if (debuffApplied) {
    creature = {
      ...creature,
      stats: applyStatModifiers(creature.stats, [{ stat: 'happiness', delta: SKIP_DEBUFF_HAPPINESS }]),
    }
  }
  return {
    state: { ...state, creature, quest: { ...state.quest, status: 'skipped' } },
    events: [{ kind: 'break_skipped', at: now, debuffApplied }],
  }
}

export function setPreset(state: GameState, presetId: string): GameState {
  if (!PRESETS.some((p) => p.id === presetId)) throw new EngineError(`Unknown preset ${presetId}`)
  if (state.timer.phase !== 'idle') throw new EngineError('Change the preset between sessions')
  return { ...state, timer: { ...state.timer, presetId } }
}

export function startFocus(state: GameState, now: number): EngineResult {
  if (state.timer.phase === 'focus') throw new EngineError('Focus session already running')
  const skipped = skipOpenQuest(state, now)
  const preset = getPreset(state.timer.presetId)
  const debuff = skipped.events.some((e) => e.kind === 'break_skipped' && e.debuffApplied)
  return {
    state: {
      ...skipped.state,
      timer: { ...state.timer, phase: 'focus', startedAt: now, endsAt: now + preset.focusMs, pausedRemainingMs: null },
      quest: null,
      lastResult: null,
      dialogue: debuff
        ? say("Three breaks ignored. I'm not mad. I'm just... indoors.", 'annoyed', now)
        : say('Working beside you. Quietly. Mostly.', 'neutral', now),
    },
    events: [...skipped.events, { kind: 'focus_started', at: now }],
  }
}

/** Skipping the break immediately starts the next focus session. */
export function skipBreak(state: GameState, now: number): EngineResult {
  if (state.timer.phase !== 'break' && !isQuestOpen(state.quest)) throw new EngineError('No break to skip')
  return startFocus(state, now)
}

export function pause(state: GameState, now: number): GameState {
  const { timer } = state
  if (timer.phase === 'idle' || timer.endsAt === null || timer.pausedRemainingMs !== null) {
    throw new EngineError('Nothing to pause')
  }
  return { ...state, timer: { ...timer, pausedRemainingMs: Math.max(0, timer.endsAt - now), endsAt: null } }
}

export function resume(state: GameState, now: number): GameState {
  const { timer } = state
  if (timer.pausedRemainingMs === null) throw new EngineError('Not paused')
  return { ...state, timer: { ...timer, endsAt: now + timer.pausedRemainingMs, pausedRemainingMs: null } }
}

export function extend(state: GameState, ms: number): GameState {
  const { timer } = state
  if (timer.phase === 'idle') throw new EngineError('Nothing to extend')
  if (timer.pausedRemainingMs !== null) return { ...state, timer: { ...timer, pausedRemainingMs: timer.pausedRemainingMs + ms } }
  return { ...state, timer: { ...timer, endsAt: (timer.endsAt ?? 0) + ms } }
}

/** Stops the current session without rewards. An open quest is kept so the user can still finish it. */
export function stop(state: GameState): GameState {
  return { ...state, timer: { ...state.timer, phase: 'idle', startedAt: null, endsAt: null, pausedRemainingMs: null } }
}

function completeFocusSession(state: GameState, now: number): EngineResult {
  const preset = getPreset(state.timer.presetId)
  const xpGained = focusXp(preset.focusMs)
  let creature: CreatureState = {
    ...state.creature,
    stats: applyStatModifiers(state.creature.stats, focusDrain(preset.focusMs)),
  }
  const xpResult = addXp(creature, xpGained)
  creature = xpResult.creature

  const need = selectNeed(creature)
  const template = selectTemplate(creature, need)
  const quest = buildQuest(template, preset, now)
  creature = {
    ...creature,
    focusSessionsCompleted: creature.focusSessionsCompleted + 1,
    recentNeeds: [...creature.recentNeeds, need].slice(-5),
    recentTemplateIds: [...creature.recentTemplateIds, template.id].slice(-5),
  }

  const events: GameEvent[] = [
    { kind: 'focus_completed', at: now, xpGained },
    { kind: 'break_started', at: now, questId: quest.id },
  ]
  if (xpResult.leveledUp) events.push({ kind: 'level_up', at: now, level: creature.level })

  return {
    state: {
      ...state,
      creature,
      timer: { ...state.timer, phase: 'break', startedAt: now, endsAt: now + preset.breakMs, pausedRemainingMs: null },
      quest,
      lastResult: null,
      dialogue: say(quest.mossLine, 'concerned', now),
    },
    events,
  }
}

/** Advances timers. Safe to call at any time, including right after a restart. */
export function tick(state: GameState, now: number): EngineResult {
  const { timer } = state
  if (timer.endsAt === null || now < timer.endsAt) return { state, events: [] }

  if (timer.phase === 'focus') return completeFocusSession(state, now)

  if (timer.phase === 'break') {
    const questCompleted = state.quest?.status === 'completed'
    return {
      state: {
        ...state,
        timer: { ...timer, phase: 'idle', startedAt: null, endsAt: null, pausedRemainingMs: null },
        dialogue: questCompleted
          ? say('Break over. I feel like a whole forest. Ready when you are.', 'happy', now)
          : say("Break's over. The quest is still open if you're out there.", 'neutral', now),
      },
      events: [{ kind: 'break_ended', at: now, questCompleted }],
    }
  }
  return { state, events: [] }
}

function requireOpenQuest(state: GameState, questId?: string): Quest {
  const quest = state.quest
  if (!isQuestOpen(quest)) throw new EngineError('No open quest')
  if (questId && quest.id !== questId) throw new EngineError('Quest is no longer current')
  return quest
}

/** Replaces quest wording with AI-written text. Rewards and requirements are never touched. */
export function applyQuestWording(
  state: GameState,
  questId: string,
  wording: { title: string; description: string; mossLine: string },
  now: number,
): EngineResult {
  const quest = state.quest
  if (!quest || quest.id !== questId) return { state, events: [] }
  const updated: Quest = { ...quest, ...wording, source: 'ai' }
  const dialogue = state.dialogue && state.dialogue.text === quest.mossLine ? say(wording.mossLine, 'concerned', now) : state.dialogue
  return { state: { ...state, quest: updated, dialogue }, events: [{ kind: 'quest_updated', at: now, questId }] }
}

export function startQuestTimer(state: GameState, now: number, questId?: string): EngineResult {
  const quest = requireOpenQuest(state, questId)
  if (quest.completionType !== 'TIMER') throw new EngineError('Not a timer quest')
  if (quest.timerStartedAt) return { state, events: [] }
  return {
    state: { ...state, quest: { ...quest, timerStartedAt: now } },
    events: [{ kind: 'quest_updated', at: now, questId: quest.id }],
  }
}

export function markValidating(state: GameState, now: number, questId?: string): EngineResult {
  const quest = requireOpenQuest(state, questId)
  if (quest.status === 'validating') throw new EngineError('Already checking a photo')
  if (quest.completionType !== 'VISION_VALIDATION' && quest.completionType !== 'PHOTO') {
    throw new EngineError('This quest does not take a photo')
  }
  return {
    state: { ...state, quest: { ...quest, status: 'validating' } },
    events: [{ kind: 'quest_validating', at: now, questId: quest.id }],
  }
}

export interface VisionVerdict {
  success: boolean
  confidence: number
  reason: string
}

/** The engine, not the model, decides whether evidence passes. */
export function verdictPasses(verdict: VisionVerdict): boolean {
  return verdict.success && verdict.confidence >= VISION_CONFIDENCE_THRESHOLD
}

export function canCompleteManually(quest: Quest): boolean {
  return quest.manualAllowed || quest.attempts >= MANUAL_AFTER_REJECTIONS
}

/** Applies a validated vision verdict to the current quest. */
export function applyVisionVerdict(state: GameState, verdict: VisionVerdict, now: number, questId?: string): EngineResult {
  const quest = requireOpenQuest(state, questId)
  if (verdictPasses(verdict)) return completeQuest(state, now, { manual: false, questId: quest.id })
  const attempts = quest.attempts + 1
  return {
    state: {
      ...state,
      quest: { ...quest, status: 'active', attempts, manualAllowed: quest.manualAllowed || attempts >= MANUAL_AFTER_REJECTIONS },
    },
    events: [{ kind: 'quest_rejected', at: now, questId: quest.id, reason: verdict.reason, technical: false }],
  }
}

/** A technical failure (model down, timeout, bad output) unlocks manual completion. */
export function recordValidationFailure(state: GameState, reason: string, now: number, questId?: string): EngineResult {
  const quest = requireOpenQuest(state, questId)
  return {
    state: { ...state, quest: { ...quest, status: 'active', manualAllowed: true } },
    events: [{ kind: 'quest_rejected', at: now, questId: quest.id, reason, technical: true }],
  }
}

export function completeQuest(
  state: GameState,
  now: number,
  opts: { manual: boolean; questId?: string },
): EngineResult {
  const quest = requireOpenQuest(state, opts.questId)

  if (opts.manual && quest.completionType !== 'USER_CONFIRMATION' && !canCompleteManually(quest)) {
    throw new EngineError('Manual completion is not available for this quest yet')
  }
  if (quest.completionType === 'TIMER') {
    if (!quest.timerStartedAt) throw new EngineError('Start the timer first')
    if (now - quest.timerStartedAt < (quest.timerMs ?? 0)) throw new EngineError('Timer is still running')
  }

  const photoQuest = quest.completionType === 'VISION_VALIDATION' || quest.completionType === 'PHOTO'
  const xpGained = opts.manual && photoQuest ? Math.round(quest.xpReward * MANUAL_PHOTO_XP_FACTOR) : quest.xpReward
  const statChanges: StatModifier[] = [...quest.affectedStats, { stat: 'happiness', delta: QUEST_COMPLETION_HAPPINESS }]

  const today = dayKey(now)
  const c = state.creature
  const streakDays = c.lastQuestDay === today ? c.streakDays : c.lastQuestDay === previousDayKey(now) ? c.streakDays + 1 : 1
  const questCounts = { ...c.questCounts, [quest.templateId]: (c.questCounts[quest.templateId] ?? 0) + 1 }
  const questsCompleted = c.questsCompleted + 1

  let creature: CreatureState = {
    ...c,
    stats: applyStatModifiers(c.stats, statChanges),
    skippedBreaksInRow: 0,
    streakDays,
    lastQuestDay: today,
    questCounts,
    questsCompleted,
  }
  const xpResult = addXp(creature, xpGained)
  creature = xpResult.creature

  const newUnlocks: UnlockId[] = UNLOCK_RULES.filter(
    (r) => !creature.unlocks.includes(r.id) && r.isUnlocked(questCounts, questsCompleted),
  ).map((r) => r.id)
  const newAchievements: AchievementId[] = ACHIEVEMENT_RULES.filter(
    (r) => !creature.achievements.includes(r.id) && r.isEarned(questCounts, questsCompleted),
  ).map((r) => r.id)
  creature = {
    ...creature,
    unlocks: [...creature.unlocks, ...newUnlocks],
    achievements: [...creature.achievements, ...newAchievements],
  }

  const result: QuestResult = {
    questId: quest.id,
    title: quest.title,
    success: true,
    xpGained,
    statChanges,
    leveledUp: xpResult.leveledUp,
    newUnlocks,
    newAchievements,
    manual: opts.manual,
    at: now,
  }
  const events: GameEvent[] = [{ kind: 'quest_completed', at: now, result }]
  if (xpResult.leveledUp) events.push({ kind: 'level_up', at: now, level: creature.level })
  for (const unlock of newUnlocks) events.push({ kind: 'unlock', at: now, unlock })
  for (const achievement of newAchievements) events.push({ kind: 'achievement', at: now, achievement })

  return {
    state: {
      ...state,
      creature,
      quest: { ...quest, status: 'completed' },
      lastResult: result,
      dialogue: say('Perfect. I needed that.', 'happy', now),
    },
    events,
  }
}

/**
 * Repairs state loaded after a restart: fills fields added in newer versions, and treats a photo
 * check that was in flight as a technical failure (retry or complete manually).
 */
export function recoverAfterRestart(state: GameState): GameState {
  let next = state
  if (!Array.isArray(next.creature.achievements)) next = { ...next, creature: { ...next.creature, achievements: [] } }
  if (next.quest?.status === 'validating') next = { ...next, quest: { ...next.quest, status: 'active', manualAllowed: true } }
  return next
}

/** Sets a reaction line, e.g. from the AI after a quest completes. */
export function setDialogue(state: GameState, text: string, emotion: MossEmotion, now: number): GameState {
  return { ...state, dialogue: say(text, emotion, now) }
}
