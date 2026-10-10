import { describe, expect, it } from 'vitest'
import { FOCUS_LEFT_MS, GEMMA_VERDICT, backToWork, createDemoState, endFocus, photoChecked, photoTaken } from './script.ts'

const T0 = Date.UTC(2026, 9, 10, 14, 0, 0)

describe('demo script', () => {
  it('runs "Moss Needs a Tree" through the real engine', () => {
    let s = createDemoState(T0)
    expect(s.timer.phase).toBe('focus')
    expect(s.timer.endsAt).toBe(T0 + FOCUS_LEFT_MS)

    const brk = endFocus(s, T0 + FOCUS_LEFT_MS)
    s = brk.state
    // The engine itself picks the tree quest from Moss's lowest need.
    expect(s.quest?.templateId).toBe('tree')
    expect(s.quest?.visionTarget).toBe('tree')
    expect(s.timer.phase).toBe('break')

    s = photoTaken(s, T0 + 20_000).state
    expect(s.quest?.status).toBe('validating')

    const done = photoChecked(s, T0 + 25_000)
    s = done.state
    expect(GEMMA_VERDICT.passes).toBe(true)
    expect(s.quest?.status).toBe('completed')
    expect(done.events.map((e) => e.kind)).toEqual(['quest_completed', 'unlock'])
    expect(s.creature.unlocks).toEqual(['grass_patch', 'tiny_tree'])

    s = backToWork(s, T0 + 40_000).state
    expect(s.timer.phase).toBe('focus')
    expect(s.timer.endsAt! - s.timer.startedAt!).toBe(45 * 60_000)
  })
})
