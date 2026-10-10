import { describe, expect, it } from 'vitest'
import type { GameState } from '@moss/shared'
import {
  EngineError,
  INITIAL_STATS,
  PRESETS,
  addXp,
  applyStatModifiers,
  applyVisionVerdict,
  completeQuest,
  createInitialState,
  extend,
  focusDrain,
  markValidating,
  pause,
  recordValidationFailure,
  recoverAfterRestart,
  resume,
  selectNeed,
  selectTemplate,
  setPreset,
  skipBreak,
  startFocus,
  startQuestTimer,
  stop,
  tick,
  xpToNextLevel,
} from './index.ts'

const T0 = new Date(2026, 9, 10, 9, 0, 0).getTime()
const MIN = 60_000

function demoState(): GameState {
  return setPreset(createInitialState(), 'demo')
}

/** Runs a focus session to completion and returns the state at the start of the break. */
function toBreak(state: GameState, now = T0): GameState {
  const focused = startFocus(state, now).state
  return tick(focused, focused.timer.endsAt!).state
}

/** Completes whatever quest is open, regardless of its completion type. */
function finishQuest(state: GameState, now: number): GameState {
  const q = state.quest!
  if (q.completionType === 'TIMER') {
    const started = startQuestTimer(state, now).state
    return completeQuest(started, now + q.timerMs!, { manual: false }).state
  }
  if (q.completionType === 'USER_CONFIRMATION') return completeQuest(state, now, { manual: true }).state
  return completeQuest(recordValidationFailure(state, 'x', now).state, now, { manual: true }).state
}

describe('timer transitions', () => {
  it('starts focus with the preset duration', () => {
    const { state, events } = startFocus(createInitialState(), T0)
    expect(state.timer.phase).toBe('focus')
    expect(state.timer.endsAt).toBe(T0 + 45 * MIN)
    expect(events.map((e) => e.kind)).toEqual(['focus_started'])
  })

  it('does nothing before the phase ends', () => {
    const s = startFocus(createInitialState(), T0).state
    expect(tick(s, T0 + 10 * MIN).state).toBe(s)
  })

  it('moves focus -> break with a quest, then break -> idle', () => {
    const s = startFocus(demoState(), T0).state
    const brk = tick(s, T0 + 30_000)
    expect(brk.state.timer.phase).toBe('break')
    expect(brk.state.quest?.status).toBe('active')
    expect(brk.events.map((e) => e.kind)).toContain('break_started')

    const idle = tick(brk.state, brk.state.timer.endsAt!)
    expect(idle.state.timer.phase).toBe('idle')
    // Quest stays open after the break timer so a late photo still counts.
    expect(idle.state.quest?.status).toBe('active')
  })

  it('catches up after a restart past the end time', () => {
    const s = startFocus(demoState(), T0).state
    const later = tick(s, T0 + 10 * MIN)
    expect(later.state.timer.phase).toBe('break')
  })

  it('pauses, resumes and extends', () => {
    let s = startFocus(createInitialState(), T0).state
    s = pause(s, T0 + 5 * MIN)
    expect(s.timer.pausedRemainingMs).toBe(40 * MIN)
    expect(tick(s, T0 + 999 * MIN).state.timer.phase).toBe('focus')
    s = resume(s, T0 + 20 * MIN)
    expect(s.timer.endsAt).toBe(T0 + 60 * MIN)
    s = extend(s, 5 * MIN)
    expect(s.timer.endsAt).toBe(T0 + 65 * MIN)
    expect(stop(s).timer.phase).toBe('idle')
  })

  it('rejects invalid commands', () => {
    expect(() => pause(createInitialState(), T0)).toThrow(EngineError)
    const s = startFocus(createInitialState(), T0).state
    expect(() => startFocus(s, T0)).toThrow(EngineError)
    expect(() => setPreset(s, 'demo')).toThrow(EngineError)
  })
})

describe('stats and XP', () => {
  it('drains needs at completion, scaled by session length', () => {
    const drain = focusDrain(45 * MIN)
    expect(drain.find((d) => d.stat === 'energy')?.delta).toBe(-8)
    expect(drain.find((d) => d.stat === 'movement')?.delta).toBe(-12)
    expect(focusDrain(90 * MIN).find((d) => d.stat === 'movement')?.delta).toBe(-24)
  })

  it('clamps stats to 0..100', () => {
    const s = applyStatModifiers(INITIAL_STATS, [
      { stat: 'energy', delta: 500 },
      { stat: 'nature', delta: -500 },
    ])
    expect(s.energy).toBe(100)
    expect(s.nature).toBe(0)
  })

  it('awards focus XP', () => {
    const brk = toBreak(createInitialState())
    expect(brk.creature.xp).toBe(30)
    expect(brk.creature.stats.energy).toBe(INITIAL_STATS.energy - 8)
  })

  it('levels up with carry-over', () => {
    const c = createInitialState().creature
    const { creature, leveledUp } = addXp(c, xpToNextLevel(1) + xpToNextLevel(2) + 10)
    expect(leveledUp).toBe(true)
    expect(creature.level).toBe(3)
    expect(creature.xp).toBe(10)
  })
})

describe('quest selection', () => {
  it('picks the tree quest for the first break', () => {
    const brk = toBreak(createInitialState())
    expect(brk.quest?.templateId).toBe('tree')
    expect(brk.quest?.visionTarget).toBe('tree')
  })

  it('picks the lowest need', () => {
    const c = createInitialState().creature
    expect(selectNeed({ ...c, stats: { ...c.stats, bathroom: 5 } })).toBe('bathroom')
  })

  it('penalises recently requested needs', () => {
    const c = createInitialState().creature
    const stats = { ...c.stats, energy: 40, movement: 45 }
    expect(selectNeed({ ...c, stats })).toBe('energy')
    expect(selectNeed({ ...c, stats, recentNeeds: ['energy'] })).toBe('movement')
  })

  it('does not repeat recent templates', () => {
    const c = createInitialState().creature
    expect(selectTemplate({ ...c, recentTemplateIds: ['tree'] }, 'energy').id).toBe('sky')
  })

  it('caps timer quests to the break length', () => {
    let s = demoState()
    s = { ...s, creature: { ...s.creature, stats: { ...s.creature.stats, movement: 1 } } }
    const brk = toBreak(s)
    expect(brk.quest?.templateId).toBe('walk')
    expect(brk.quest?.timerMs).toBe(Math.round(PRESETS.find((p) => p.id === 'demo')!.breakMs * 0.6))
  })
})

describe('quest completion', () => {
  it('completes a vision quest only when the verdict passes the threshold', () => {
    const brk = toBreak(createInitialState())
    const validating = markValidating(brk, T0 + 46 * MIN).state

    const lowConfidence = applyVisionVerdict(validating, { success: true, confidence: 0.3, reason: 'blurry' }, T0 + 47 * MIN)
    expect(lowConfidence.state.quest?.status).toBe('active')
    expect(lowConfidence.state.quest?.attempts).toBe(1)
    expect(lowConfidence.events[0]?.kind).toBe('quest_rejected')

    const pass = applyVisionVerdict(markValidating(lowConfidence.state, T0).state, { success: true, confidence: 0.9, reason: 'tree' }, T0 + 48 * MIN)
    expect(pass.state.quest?.status).toBe('completed')
    expect(pass.state.lastResult?.xpGained).toBe(40)
    expect(pass.state.creature.stats.energy).toBe(INITIAL_STATS.energy - 8 + 20)
    expect(pass.state.creature.unlocks).toContain('tiny_tree')
    expect(pass.events.map((e) => e.kind)).toEqual(['quest_completed', 'unlock'])
  })

  it('only allows manual photo completion after a technical failure, for half XP', () => {
    const brk = toBreak(createInitialState())
    expect(() => completeQuest(brk, T0, { manual: true })).toThrow(EngineError)
    const failed = recordValidationFailure(markValidating(brk, T0).state, 'timeout', T0).state
    expect(failed.quest?.manualAllowed).toBe(true)
    const done = completeQuest(failed, T0, { manual: true })
    expect(done.state.lastResult?.xpGained).toBe(20)
  })

  it('requires timer quests to run their full duration', () => {
    let s = demoState()
    s = { ...s, creature: { ...s.creature, stats: { ...s.creature.stats, movement: 1 } } }
    const brk = toBreak(s)
    expect(() => completeQuest(brk, T0 + MIN, { manual: false })).toThrow(EngineError)
    const started = startQuestTimer(brk, T0 + MIN).state
    expect(() => completeQuest(started, T0 + MIN + 1000, { manual: false })).toThrow(EngineError)
    const done = completeQuest(started, T0 + MIN + started.quest!.timerMs!, { manual: false })
    expect(done.state.quest?.status).toBe('completed')
  })

  it('tracks a daily streak', () => {
    const day1 = toBreak(createInitialState(), T0)
    const done1 = finishQuest(day1, T0 + 50 * MIN)
    expect(done1.creature.streakDays).toBe(1)
    const nextDay = T0 + 24 * 60 * MIN
    const day2 = toBreak(done1, nextDay)
    const done2 = finishQuest(day2, nextDay + 50 * MIN)
    expect(done2.creature.streakDays).toBe(2)
  })
})

describe('break skipping', () => {
  it('applies the sedentary debuff every third skip and resets on completion', () => {
    let s = demoState()
    let now = T0
    const happinessBefore = s.creature.stats.happiness
    for (let i = 0; i < 3; i++) {
      s = toBreak(s, now)
      now += 31_000
      s = skipBreak(s, now).state
      s = stop(s)
    }
    expect(s.creature.skippedBreaksInRow).toBe(3)
    // 3 demo sessions drain happiness by 1 each (0.5x of -2) plus the -20 debuff.
    expect(s.creature.stats.happiness).toBe(happinessBefore - 3 - 20)

    s = toBreak(s, now)
    s = finishQuest(s, now)
    expect(s.creature.skippedBreaksInRow).toBe(0)
  })

  it('counts an unfinished quest as skipped when the next focus starts', () => {
    const brk = toBreak(demoState())
    const idle = tick(brk, brk.timer.endsAt!).state
    const next = startFocus(idle, brk.timer.endsAt! + 1000)
    expect(next.state.creature.skippedBreaksInRow).toBe(1)
    expect(next.state.quest).toBeNull()
  })
})

describe('restart recovery', () => {
  it('unsticks a photo check that was in flight when the server stopped', () => {
    const validating = markValidating(toBreak(createInitialState()), T0).state
    const recovered = recoverAfterRestart(validating)
    expect(recovered.quest?.status).toBe('active')
    expect(recovered.quest?.manualAllowed).toBe(true)
    expect(completeQuest(recovered, T0, { manual: true }).state.quest?.status).toBe('completed')
  })

  it('leaves other states untouched', () => {
    const s = toBreak(createInitialState())
    expect(recoverAfterRestart(s)).toBe(s)
  })
})

describe('achievements', () => {
  it('awards Actually Touched Grass for the first grass quest, once', () => {
    let s = createInitialState()
    s = { ...s, creature: { ...s.creature, stats: { ...s.creature.stats, bathroom: 1 } } }
    const brk = toBreak(s)
    expect(brk.quest?.templateId).toBe('grass')
    const done = completeQuest(recordValidationFailure(brk, 'x', T0).state, T0, { manual: true })
    expect(done.state.creature.achievements).toEqual(['touched_grass'])
    expect(done.state.lastResult?.newAchievements).toEqual(['touched_grass'])
    expect(done.events).toContainEqual({ kind: 'achievement', at: T0, achievement: 'touched_grass' })

    const again = { ...done.state, creature: { ...done.state.creature, stats: { ...done.state.creature.stats, bathroom: 1 } } }
    const brk2 = toBreak(again, T0 + 60 * MIN)
    const done2 = completeQuest(recordValidationFailure(brk2, 'x', T0).state, T0, { manual: true })
    expect(done2.state.lastResult?.newAchievements).toEqual([])
  })

  it('fills achievements for saves from before they existed', () => {
    const s = createInitialState()
    const old = { ...s, creature: { ...s.creature, achievements: undefined as unknown as [] } }
    expect(recoverAfterRestart(old).creature.achievements).toEqual([])
  })
})
