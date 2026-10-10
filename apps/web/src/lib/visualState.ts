import { useEffect, useRef, useState } from 'react'
import type { GameEvent, GameState } from '@moss/shared'

/** Every visual state the renderer supports. Game state maps onto these deterministically. */
export type MossVisualState =
  | 'idle'
  | 'working'
  | 'thinking'
  | 'happy'
  | 'tired'
  | 'restless'
  | 'nature_deprived'
  | 'needs_bathroom'
  | 'quest_ready'
  | 'quest_success'
  | 'quest_failed'
  | 'waiting_for_user'
  | 'level_up'
  | 'sleeping'

/** How a visual state looks; the renderer reads only this, never raw game state. */
export interface VisualProfile {
  /** Eye openness 0..1. */
  eyes: number
  mouth: 'smile' | 'flat' | 'open' | 'frown' | 'grin'
  /** Vertical bob amplitude. */
  bob: number
  /** Bob speed multiplier. */
  speed: number
  /** Side-to-side wiggle amplitude. */
  wiggle: number
  /** Hop height for excited states. */
  hop: number
  /** Look direction: 0 = camera, 1 = window. */
  look: number
  /** Lean toward the tiny laptop. */
  lean: number
  /** Body saturation multiplier (nature deprivation looks washed out). */
  vibrance: number
  zzz: boolean
}

export const VISUAL_PROFILES: Record<MossVisualState, VisualProfile> = {
  idle: { eyes: 1, mouth: 'smile', bob: 0.04, speed: 1, wiggle: 0, hop: 0, look: 0, lean: 0, vibrance: 1, zzz: false },
  working: { eyes: 0.8, mouth: 'flat', bob: 0.015, speed: 2.2, wiggle: 0, hop: 0, look: 0.15, lean: 1, vibrance: 1, zzz: false },
  thinking: { eyes: 0.9, mouth: 'flat', bob: 0.02, speed: 0.8, wiggle: 0.05, hop: 0, look: -0.3, lean: 0, vibrance: 1, zzz: false },
  happy: { eyes: 0.15, mouth: 'grin', bob: 0.06, speed: 1.6, wiggle: 0.06, hop: 0, look: 0, lean: 0, vibrance: 1.1, zzz: false },
  tired: { eyes: 0.4, mouth: 'flat', bob: 0.02, speed: 0.5, wiggle: 0, hop: 0, look: 0, lean: 0, vibrance: 0.8, zzz: false },
  restless: { eyes: 1, mouth: 'frown', bob: 0.03, speed: 2.5, wiggle: 0.12, hop: 0.08, look: 0.5, lean: 0, vibrance: 0.95, zzz: false },
  nature_deprived: { eyes: 0.6, mouth: 'frown', bob: 0.02, speed: 0.6, wiggle: 0, hop: 0, look: 0.7, lean: 0, vibrance: 0.55, zzz: false },
  needs_bathroom: { eyes: 1, mouth: 'frown', bob: 0.02, speed: 3, wiggle: 0.08, hop: 0.04, look: 0.4, lean: 0, vibrance: 0.95, zzz: false },
  quest_ready: { eyes: 1, mouth: 'open', bob: 0.04, speed: 1.8, wiggle: 0.04, hop: 0.12, look: 0.85, lean: 0, vibrance: 1, zzz: false },
  quest_success: { eyes: 0.15, mouth: 'grin', bob: 0.05, speed: 2, wiggle: 0.1, hop: 0.35, look: 0, lean: 0, vibrance: 1.25, zzz: false },
  quest_failed: { eyes: 0.7, mouth: 'frown', bob: 0.02, speed: 0.8, wiggle: 0.03, hop: 0, look: 0, lean: 0, vibrance: 0.9, zzz: false },
  waiting_for_user: { eyes: 1, mouth: 'smile', bob: 0.03, speed: 1, wiggle: 0, hop: 0.05, look: 0.6, lean: 0, vibrance: 1, zzz: false },
  level_up: { eyes: 0.15, mouth: 'grin', bob: 0.06, speed: 2.4, wiggle: 0.08, hop: 0.45, look: 0, lean: 0, vibrance: 1.3, zzz: false },
  sleeping: { eyes: 0, mouth: 'flat', bob: 0.03, speed: 0.4, wiggle: 0, hop: 0, look: 0, lean: 0, vibrance: 0.9, zzz: true },
}

/** Deterministic priority: transient celebrations beat breaks, which beat needs, which beat work. */
export function deriveVisualState(state: GameState, transient: 'quest_success' | 'level_up' | 'quest_failed' | null, hour: number): MossVisualState {
  if (transient) return transient
  const { timer, quest, creature } = state
  const questOpen = quest && (quest.status === 'active' || quest.status === 'validating')

  if (quest?.status === 'validating') return 'thinking'
  if (timer.phase === 'break' && questOpen) return 'quest_ready'
  if (timer.phase === 'break' && quest?.status === 'completed') return 'happy'
  if (questOpen) return 'waiting_for_user'

  const s = creature.stats
  const urgent = ([
    ['bathroom', 'needs_bathroom'],
    ['nature', 'nature_deprived'],
    ['movement', 'restless'],
    ['energy', 'tired'],
    ['rest', 'tired'],
  ] as const).find(([stat]) => s[stat] < 25)

  if (timer.phase === 'focus') {
    if (timer.pausedRemainingMs !== null) return 'idle'
    return urgent && s[urgent[0]] < 15 ? urgent[1] : 'working'
  }
  if (urgent) return urgent[1]
  if (hour >= 23 || hour < 6) return 'sleeping'
  return 'idle'
}

const TRANSIENT_MS: Record<'quest_success' | 'level_up' | 'quest_failed', number> = {
  quest_success: 4200,
  level_up: 4200,
  quest_failed: 2200,
}
/** Non-transient states are held at least this long to avoid flicker. */
const MIN_STATE_MS = 1500

/**
 * The Visual State Controller: turns game state + one-shot events into a stable visual state.
 */
export function useVisualState(
  state: GameState | undefined,
  onEvent: (fn: (e: GameEvent) => void) => () => void,
): MossVisualState {
  const [transient, setTransient] = useState<'quest_success' | 'level_up' | 'quest_failed' | null>(null)
  const [stable, setStable] = useState<MossVisualState>('idle')
  const changedAt = useRef(0)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = onEvent((e) => {
      const kind =
        e.kind === 'quest_completed' ? 'quest_success' : e.kind === 'level_up' ? 'level_up' : e.kind === 'quest_rejected' ? 'quest_failed' : null
      if (!kind) return
      setTransient((current) => (current === 'level_up' && kind === 'quest_success' ? current : kind))
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => setTransient(null), TRANSIENT_MS[kind])
    })
    return () => {
      unsubscribe()
      if (timeout) clearTimeout(timeout)
    }
  }, [onEvent])

  const target = state ? deriveVisualState(state, transient, new Date().getHours()) : 'idle'

  useEffect(() => {
    if (target === stable) return
    const wait = transient ? 0 : Math.max(0, MIN_STATE_MS - (Date.now() - changedAt.current))
    const id = setTimeout(() => {
      changedAt.current = Date.now()
      setStable(target)
    }, wait)
    return () => clearTimeout(id)
  }, [target, stable, transient])

  return stable
}
