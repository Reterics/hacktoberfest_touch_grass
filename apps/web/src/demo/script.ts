import type { GameEvent, GameState } from '@moss/shared'
import {
  applyVisionVerdict,
  createInitialState,
  markValidating,
  setDialogue,
  setPreset,
  startFocus,
  tick,
  type EngineResult,
} from '@moss/game-engine'
import recorded from './gemma-verdict.json'

/*
 * "Moss Needs a Tree" (docs/DEMO-SCENE.md) as data.
 *
 * Every state change goes through the real game engine on a scripted clock, so the XP, stat changes,
 * the chosen quest and the unlock are exactly what the game would produce. Only the timing and Moss's
 * voiced lines are scripted. The photo verdict replays a real local Gemma run on the same photo
 * (apps/server/scripts/verify-demo-photo.ts).
 */

export const GEMMA_VERDICT = recorded

const MIN = 60_000
/** The demo opens on the last seconds of a 45-minute focus session. */
export const FOCUS_LEFT_MS = 7_000

/** Moss's lines; each has a matching voiced clip in /assets/demo/audio. */
export const LINES = {
  staring: "We've been staring at this screen long enough.",
  findTree: 'Find me a tree.',
  acceptable: 'Acceptable tree.',
  backToWork: 'Fine. Back to work.',
} as const

/** Quest wording from the demo script; requirements and rewards stay the engine's. */
export const QUEST_WORDING = { title: 'Find me a tree 🌳', description: 'Find a living tree and show it to Moss.' }

/** Opening narration (the problem), with each sentence's start time in the voiced clip. */
export const INTRO: { at: number; text: string }[] = [
  { at: 0, text: 'We spend most of our day in front of screens.' },
  { at: 3.4, text: 'Deep work matters, but so do the moments when we stand up, look away and step outside.' },
  { at: 11.35, text: "When we're focused, those are the first moments we skip." },
  { at: 16.2, text: 'So we built Moss.' },
]
/** The idea, shown as a card while the narrator says it. */
export const TAGLINE = { at: 18.6, text: 'Moss is an AI companion that works with you, and occasionally makes you leave your desk.' }

/** End-card narration, with each sentence's start time in the voiced clip (a breathing pause follows each sentence). */
export const NARRATION: { at: number; text: string }[] = [
  { at: 0, text: 'Open innovation lets us combine what already exists to create what doesn’t.' },
  { at: 6.2, text: 'Local AI understands the world.' },
  { at: 9.8, text: 'Open technologies connect devices.' },
  { at: 13.7, text: 'Community tools accelerate creation.' },
  { at: 18.3, text: 'The result: an AI companion designed to get you away from AI.' },
  { at: 24.4, text: 'Moss uses technology to reconnect you with the world outside your screen.' },
]

/**
 * A few days into using Moss: one grass quest done (so the ecosystem meter starts at one of six),
 * and energy is the lowest need, so the engine's own need/template selection asks for a tree.
 */
export function createDemoState(now: number): GameState {
  const base = createInitialState()
  let state: GameState = {
    ...base,
    creature: {
      ...base.creature,
      level: 2,
      xp: 60,
      totalXp: 160,
      stats: { happiness: 70, energy: 30, nature: 52, movement: 64, rest: 60, curiosity: 66, hunger: 72, bathroom: 70 },
      unlocks: ['grass_patch'],
      achievements: ['touched_grass'],
      streakDays: 3,
      lastQuestDay: null,
      focusSessionsCompleted: 6,
      questsCompleted: 4,
      questCounts: { grass: 1, walk: 1, water: 1, leaf: 1 },
      recentTemplateIds: ['walk', 'grass', 'leaf'],
      recentNeeds: ['movement', 'bathroom', 'nature'],
    },
  }
  state = setPreset(state, '45-5')
  return startFocus(state, now - (45 * MIN - FOCUS_LEFT_MS)).state
}

/** The focus timer runs out: the engine drains stats and picks Moss's need and quest. */
export function endFocus(state: GameState, now: number): EngineResult {
  const result = tick(state, now)
  const quest = result.state.quest
  if (!quest) return result
  return {
    ...result,
    state: setDialogue({ ...result.state, quest: { ...quest, ...QUEST_WORDING } }, LINES.staring, 'concerned', now),
  }
}

export function sayLine(state: GameState, line: keyof typeof LINES, now: number): GameState {
  return setDialogue(state, LINES[line], line === 'acceptable' ? 'happy' : 'neutral', now)
}

export function photoTaken(state: GameState, now: number): EngineResult {
  return markValidating(state, now)
}

/** Applies the recorded Gemma verdict; the engine decides whether it passes. */
export function photoChecked(state: GameState, now: number): EngineResult {
  const { success, confidence, reason } = GEMMA_VERDICT.verdict
  const result = applyVisionVerdict(state, { success, confidence, reason }, now)
  // Moss reacts with the scripted line a moment later, once it is back at the desk.
  return { ...result, state: { ...result.state, dialogue: null } }
}

export function backToWork(state: GameState, now: number): EngineResult {
  const result = startFocus(state, now)
  return { ...result, state: sayLine(result.state, 'backToWork', now) }
}

export type { GameEvent }
