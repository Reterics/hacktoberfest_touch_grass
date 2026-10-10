import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEvent, GameState, ServerSnapshot } from '@moss/shared'
import { PRESETS, type EngineResult } from '@moss/game-engine'
import type { GameConnection } from '../lib/useGame.ts'
import type { MossVisualState } from '../lib/visualState.ts'
import { DemoAudio, type DemoClip } from './audio.ts'
import { GEMMA_VERDICT, INTRO, NARRATION, TAGLINE, backToWork, createDemoState, endFocus, photoChecked, photoTaken, sayLine } from './script.ts'

/** /?demo=1 plays the scripted "Moss Needs a Tree" scene instead of connecting to the server. */
export const DEMO = new URLSearchParams(window.location.search).has('demo')

export type PhoneScreen = 'quest' | 'camera' | 'flash' | 'checking' | 'found'

export interface DemoView {
  stage: 'title' | 'intro' | 'running' | 'end'
  /** Opening shot: wide and dim, before the camera pushes in on Moss. */
  wide: boolean
  /** How many intro lines have been spoken (the latest one is shown as a subtitle). */
  introLine: number
  tagline: boolean
  phone: PhoneScreen | null
  caption: string | null
  visualOverride: MossVisualState | null
  /** Draws attention to the "back to work" button just before it is pressed. */
  pulse: boolean
  /** How many narration lines are showing on the end card. */
  narration: number
  finale: boolean
  start: () => void
}

/** How long the phone shows "looking…": the recorded Gemma latency, kept readable. */
const CHECK_SECONDS = Math.min(2.5, Math.max(1.2, GEMMA_VERDICT.latencyMs / 1000))
/** The opening narration (the problem, then the idea). The game starts once the tagline is on screen. */
const INTRO_DELAY = 0.4
const INTRO_SECONDS = INTRO_DELAY + TAGLINE.at + 1
/** The end card fades in over 1 s; the narrator starts once it has settled. */
const NARRATOR_AT = 43.3
const NARRATOR_SECONDS = 29.3

/**
 * The demo director. Returns the same shape as useGame(), so the real desktop UI renders the demo,
 * plus a DemoView for the overlay (title card, phone, captions, end card).
 */
export function useDemoGame(): GameConnection & { demo: DemoView } {
  const [snapshot, setSnapshot] = useState<ServerSnapshot>(() => toSnapshot(createDemoState(Date.now()), false))
  const [view, setView] = useState<Omit<DemoView, 'start'>>(INITIAL_VIEW)
  const listeners = useRef(new Set<(e: GameEvent) => void>())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const audio = useRef<DemoAudio | null>(null)
  const game = useRef({ state: snapshot.state, phone: false })

  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    audio.current?.stopAll()
  }
  useEffect(() => clear, [])

  const start = useCallback(() => {
    clear()
    audio.current ??= new DemoAudio()
    const sound = audio.current
    const play = (clip: DemoClip) => sound.play(clip)

    const commit = (state: GameState, phone = game.current.phone) => {
      game.current = { state, phone }
      setSnapshot(toSnapshot(state, phone))
    }
    const apply = (result: EngineResult) => {
      commit(result.state)
      for (const e of result.events) for (const fn of listeners.current) fn(e)
    }
    const patch = (p: Partial<Omit<DemoView, 'start'>>) => setView((v) => ({ ...v, ...p }))
    const atIntro = (seconds: number, fn: () => void) => timers.current.push(setTimeout(fn, seconds * 1000))
    // Gameplay cues are timed from the end of the intro.
    const at = (seconds: number, fn: () => void) => atIntro(INTRO_SECONDS + seconds, fn)
    const now = () => Date.now()

    // Problem → idea: the narrator over a wide, dim shot of Moss working beside the laptop.
    const opening = createDemoState(now() + INTRO_SECONDS * 1000)
    commit({ ...opening, dialogue: null }, false)
    setView({ ...INITIAL_VIEW, stage: 'intro', wide: true })
    atIntro(INTRO_DELAY, () => play('narrator-intro'))
    INTRO.forEach((line, i) => atIntro(INTRO_DELAY + line.at, () => patch({ introLine: i + 1 })))
    // "So we built Moss": the camera pushes in and Moss looks up at the viewer.
    atIntro(INTRO_DELAY + INTRO[INTRO.length - 1]!.at, () => {
      patch({ wide: false, visualOverride: 'idle' })
      sound.startMusic()
    })
    atIntro(INTRO_DELAY + TAGLINE.at, () => patch({ tagline: true }))
    at(0, () => patch({ stage: 'running', visualOverride: null }))
    // The tagline and Moss's speech bubble share the top of the screen, so the bubble waits.
    at(4.5, () => {
      patch({ tagline: false })
      commit({ ...game.current.state, dialogue: opening.dialogue })
    })

    // Work → interruption: the session ends and Moss's fronds droop.
    at(3, () => patch({ visualOverride: 'tired' }))
    at(7, () => {
      patch({ visualOverride: null })
      apply(endFocus(game.current.state, now()))
      play('sfx-pop')
    })
    at(7.5, () => play('moss-staring'))
    at(11.6, () => {
      commit(sayLine(game.current.state, 'findTree', now()))
      play('moss-find-tree')
    })

    // Real world: Moss heads out with the phone, the player photographs a tree.
    at(15, () => {
      commit(game.current.state, true)
      patch({ phone: 'quest' })
    })
    at(18, () => patch({ phone: 'camera' }))
    at(21, () => {
      play('sfx-shutter')
      patch({ phone: 'flash' })
    })
    at(21.25, () => {
      apply(photoTaken(game.current.state, now()))
      patch({ phone: 'checking' })
    })
    at(21.25 + CHECK_SECONDS, () => {
      patch({ phone: 'found' })
      play('sfx-success')
    })

    // Game consequence: back at the desk, the engine applies the verdict.
    at(24.4, () => {
      commit({ ...game.current.state, dialogue: null }, false)
      patch({ phone: null })
    })
    let xp = 0
    at(26.9, () => {
      const result = photoChecked(game.current.state, now())
      xp = result.state.lastResult?.xpGained ?? 0
      apply(result)
      play('sfx-frond-spring')
    })
    at(27.6, () => play('sfx-leaf-gust'))
    at(30, () => {
      commit(sayLine(game.current.state, 'acceptable', now()))
      play('moss-acceptable-tree')
    })
    at(32, () => patch({ caption: `+${xp} XP · New discovery added to Moss's ecosystem` }))
    at(35.6, () => patch({ caption: null }))

    // Back to work.
    at(36, () => patch({ pulse: true }))
    at(37.2, () => {
      patch({ pulse: false })
      apply(backToWork(game.current.state, now()))
      play('moss-back-to-work')
    })

    // End card.
    at(42, () => {
      patch({ stage: 'end' })
      sound.music('duck', 1.25)
    })
    at(NARRATOR_AT, () => play('narrator-open-innovation'))
    NARRATION.forEach((line, i) => at(NARRATOR_AT + line.at, () => patch({ narration: i + 1 })))
    at(NARRATOR_AT + NARRATOR_SECONDS + 0.6, () => {
      patch({ finale: true })
      sound.music('out', 4)
    })
  }, [])

  const now = useCallback(() => Date.now(), [])
  const onEvent = useCallback((fn: (e: GameEvent) => void) => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])

  return { snapshot, connection: 'open', now, onEvent, demo: { ...view, start } }
}

const INITIAL_VIEW: Omit<DemoView, 'start'> = {
  stage: 'title',
  wide: true,
  introLine: 0,
  tagline: false,
  phone: null,
  caption: null,
  visualOverride: null,
  pulse: false,
  narration: 0,
  finale: false,
}

function toSnapshot(state: GameState, phoneConnected: boolean): ServerSnapshot {
  const model = GEMMA_VERDICT.model
  return {
    state,
    ai: { state: 'ready', message: 'Demo replay', host: 'local', textModel: model, visionModel: model },
    presets: PRESETS,
    serverNow: Date.now(),
    phoneConnected,
  }
}
