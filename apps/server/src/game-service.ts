import type { AIStatus, GameEvent, GameState, Quest, ServerMessage, ServerSnapshot } from '@moss/shared'
import {
  PRESETS,
  applyQuestWording,
  applyVisionVerdict,
  completeQuest,
  createInitialState,
  extend,
  getPreset,
  getTemplate,
  markValidating,
  pause,
  recordValidationFailure,
  recoverAfterRestart,
  resume,
  setDialogue,
  setPreset,
  skipBreak,
  startFocus,
  startQuestTimer,
  stop,
  tick,
  type EngineResult,
} from '@moss/game-engine'
import {
  reactToCompletion,
  validateEvidence,
  warmUp,
  writeQuestWording,
  type AIProvider,
  type QuestWording,
  type VisionResult,
} from '@moss/ai'
import type { MossDb } from './db.ts'

type Listener = (message: ServerMessage) => void

export type PhotoOutcome =
  | { outcome: 'completed'; detected: string[]; reason: string }
  | { outcome: 'rejected'; reason: string; manualAllowed: boolean }
  | { outcome: 'error'; reason: string; manualAllowed: boolean }

/** How long before focus ends we pre-write the upcoming quest with the model. */
const PREFETCH_LEAD_MS = 25_000

/**
 * Owns the authoritative game state. All mutations go through the deterministic engine;
 * the AI only supplies wording, verdicts and reactions, which are validated first.
 */
export class GameService {
  private state: GameState
  private ai: AIStatus
  private listeners = new Set<Listener>()
  private timer: NodeJS.Timeout | null = null
  private prefetchTimer: NodeJS.Timeout | null = null
  private aiPoll: NodeJS.Timeout | null = null
  private prefetched: { templateId: string; wording: Promise<QuestWording | null> } | null = null
  private phoneClients = 0

  constructor(
    private readonly db: MossDb,
    private readonly provider: AIProvider,
    private readonly log: { info: (msg: string) => void; warn: (msg: string) => void },
  ) {
    const saved = db.loadState()
    this.state = saved ? recoverAfterRestart(saved) : createInitialState()
    this.ai = { state: 'checking', message: 'Looking for Ollama…', host: '', textModel: '', visionModel: '' }
  }

  start(): void {
    // Catch up on anything that expired while Moss was not running.
    this.commit(tick(this.state, Date.now()))
    this.schedule()
    void this.refreshAiStatus()
  }

  shutdown(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
    if (this.aiPoll) clearTimeout(this.aiPoll)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener({ type: 'snapshot', snapshot: this.snapshot() })
    return () => this.listeners.delete(listener)
  }

  setPhoneConnected(delta: 1 | -1): void {
    this.phoneClients = Math.max(0, this.phoneClients + delta)
    this.broadcastSnapshot()
  }

  snapshot(): ServerSnapshot {
    return {
      state: this.state,
      ai: this.ai,
      presets: PRESETS,
      serverNow: Date.now(),
      phoneConnected: this.phoneClients > 0,
    }
  }

  // ---- commands -------------------------------------------------------------

  startFocus(): void {
    this.commit(startFocus(this.state, Date.now()))
  }

  pause(): void {
    this.commitState(pause(this.state, Date.now()))
  }

  resume(): void {
    this.commitState(resume(this.state, Date.now()))
  }

  stop(): void {
    this.commitState(stop(this.state))
  }

  extend(minutes: number): void {
    this.commitState(extend(this.state, Math.max(1, Math.min(30, minutes)) * 60_000))
  }

  skipBreak(): void {
    this.commit(skipBreak(this.state, Date.now()))
  }

  setPreset(presetId: string): void {
    this.commitState(setPreset(this.state, presetId))
  }

  startQuestTimer(questId?: string): void {
    this.commit(startQuestTimer(this.state, Date.now(), questId))
  }

  /** Completes TIMER and USER_CONFIRMATION quests, or photo quests after a technical failure. */
  completeQuest(opts: { manual: boolean; questId?: string }): void {
    this.commit(completeQuest(this.state, Date.now(), opts))
  }

  async submitPhoto(image: Buffer, questId?: string): Promise<PhotoOutcome> {
    this.commit(markValidating(this.state, Date.now(), questId))
    const quest = this.state.quest!

    // Free-form photo quests are accepted as-is.
    if (quest.completionType === 'PHOTO') {
      this.commit(completeQuest(this.state, Date.now(), { manual: false, questId: quest.id }))
      return { outcome: 'completed', detected: [], reason: 'Moss loves it.' }
    }

    if (this.ai.state !== 'ready') {
      const reason =
        this.ai.state === 'no_vision' ? "Moss's model can't see photos right now." : "Moss can't reach its brain (Ollama) right now."
      this.commit(recordValidationFailure(this.state, reason, Date.now(), quest.id))
      return { outcome: 'error', reason, manualAllowed: true }
    }

    let verdict: VisionResult
    try {
      verdict = await validateEvidence(this.provider, image.toString('base64'), quest.visionTarget ?? 'outdoor environment')
    } catch (err) {
      const reason = `Couldn't inspect the photo: ${(err as Error).message}.`
      this.log.warn(reason)
      this.safeCommit(() => recordValidationFailure(this.state, reason, Date.now(), quest.id))
      return { outcome: 'error', reason, manualAllowed: true }
    }

    this.log.info(`Vision verdict for ${quest.visionTarget}: ${JSON.stringify(verdict)}`)
    const result = this.safeCommit(() => applyVisionVerdict(this.state, verdict, Date.now(), quest.id))
    if (!result) return { outcome: 'error', reason: 'The quest ended while Moss was looking.', manualAllowed: false }
    if (result.events.some((e) => e.kind === 'quest_completed')) {
      this.reactAsync(quest, verdict.detected, false)
      return { outcome: 'completed', detected: verdict.detected, reason: verdict.reason }
    }
    return { outcome: 'rejected', reason: verdict.reason, manualAllowed: this.state.quest?.manualAllowed ?? false }
  }

  // ---- internals ------------------------------------------------------------

  private commitState(state: GameState): void {
    this.commit({ state, events: [] })
  }

  /** Commits unless the state moved on (e.g. the quest was skipped while the model was thinking). */
  private safeCommit(fn: () => EngineResult): EngineResult | null {
    try {
      const result = fn()
      this.commit(result)
      return result
    } catch (err) {
      this.log.warn(`Discarded stale AI result: ${(err as Error).message}`)
      return null
    }
  }

  private commit(result: EngineResult): void {
    const previous = this.state
    this.state = result.state
    this.db.saveState(this.state)
    this.schedule()
    this.broadcastSnapshot()
    for (const event of result.events) {
      this.broadcast({ type: 'event', event })
      this.onEvent(event, previous)
    }
  }

  private onEvent(event: GameEvent, previous: GameState): void {
    const now = event.at
    switch (event.kind) {
      case 'focus_completed':
        this.db.recordFocusSession(previous.timer.startedAt ?? now, now, previous.timer.presetId, event.xpGained)
        break
      case 'break_started':
        if (this.state.quest) {
          this.db.upsertQuest(this.state.quest, now)
          void this.phraseQuest(this.state.quest)
        }
        break
      case 'quest_completed':
        if (this.state.quest) {
          this.db.upsertQuest(this.state.quest, now, event.result.xpGained, event.result.manual)
          // Photo-validated quests already trigger a reaction with what Gemma saw.
          if (event.result.manual || this.state.quest.completionType !== 'VISION_VALIDATION') {
            this.reactAsync(this.state.quest, [], event.result.manual)
          }
        }
        break
      case 'break_skipped':
        if (previous.quest) this.db.upsertQuest({ ...previous.quest, status: 'skipped' }, now)
        break
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.prefetchTimer) clearTimeout(this.prefetchTimer)
    this.timer = null
    this.prefetchTimer = null
    const { endsAt, phase } = this.state.timer
    if (endsAt === null) return
    const delay = Math.max(0, endsAt - Date.now()) + 20
    this.timer = setTimeout(() => this.commit(tick(this.state, Date.now())), delay)
    if (phase === 'focus') {
      this.prefetchTimer = setTimeout(() => this.prefetchQuest(endsAt), Math.max(0, endsAt - PREFETCH_LEAD_MS - Date.now()))
    }
  }

  /** Predicts the next quest deterministically and asks the model to word it before the break starts. */
  private prefetchQuest(endsAt: number): void {
    if (this.ai.state !== 'ready') return
    const predicted = tick(this.state, endsAt).state.quest
    if (!predicted) return
    if (this.prefetched?.templateId === predicted.templateId) return
    this.prefetched = { templateId: predicted.templateId, wording: this.requestWording(predicted) }
  }

  private requestWording(quest: Quest): Promise<QuestWording | null> {
    const template = getTemplate(quest.templateId)
    if (!template) return Promise.resolve(null)
    return writeQuestWording(this.provider, {
      need: quest.need,
      category: quest.category,
      completionType: quest.completionType,
      visionTarget: quest.visionTarget,
      durationMinutes: quest.timerMs ? Math.max(1, Math.round(quest.timerMs / 60_000)) : template.durationMinutes,
      environment: template.environment,
      baseTitle: template.title,
      baseDescription: template.description,
      level: this.state.creature.level,
      recentQuests: this.state.creature.recentTemplateIds.slice(0, -1).map((id) => getTemplate(id)?.title ?? id),
      focusMinutes: Math.round(getPreset(this.state.timer.presetId).focusMs / 60_000),
    }).then((out) => {
      if (out.ok) return out.wording
      this.log.warn(`Quest wording fell back: ${out.error}`)
      return null
    })
  }

  private async phraseQuest(quest: Quest): Promise<void> {
    if (this.ai.state !== 'ready') return
    const pending =
      this.prefetched?.templateId === quest.templateId ? this.prefetched.wording : this.requestWording(quest)
    this.prefetched = null
    const wording = await pending
    if (wording) this.commit(applyQuestWording(this.state, quest.id, wording, Date.now()))
    if (this.state.quest) this.db.upsertQuest(this.state.quest, Date.now())
  }

  private reactAsync(quest: Quest, detected: string[], manual: boolean): void {
    const result = this.state.lastResult
    if (this.ai.state !== 'ready' || !result) return
    void reactToCompletion(
      this.provider,
      {
        questTitle: quest.title,
        questDescription: quest.description,
        detected,
        xpGained: result.xpGained,
        leveledUp: result.leveledUp,
        level: this.state.creature.level,
        manual,
      },
      this.state.creature.questsCompleted,
    ).then((reaction) => {
      // Only replace the line if nothing newer happened meanwhile.
      if (this.state.lastResult?.questId !== quest.id) return
      this.commitState(setDialogue(this.state, reaction.dialogue, reaction.emotion, Date.now()))
    })
  }

  private async refreshAiStatus(): Promise<void> {
    const previous = this.ai.state
    try {
      this.ai = await this.provider.checkStatus()
    } catch (err) {
      this.ai = { ...this.ai, state: 'error', message: (err as Error).message }
    }
    if (this.ai.state !== previous) {
      this.log.info(`AI status: ${this.ai.state} - ${this.ai.message}`)
      this.broadcastSnapshot()
      if (this.ai.state === 'ready') {
        warmUp(this.provider)
          .then(() => this.log.info('Gemma warmed up'))
          .catch((err: Error) => this.log.warn(`Warm-up failed: ${err.message}`))
      }
    }
    this.aiPoll = setTimeout(() => void this.refreshAiStatus(), this.ai.state === 'ready' ? 60_000 : 10_000)
  }

  private broadcastSnapshot(): void {
    this.broadcast({ type: 'snapshot', snapshot: this.snapshot() })
  }

  private broadcast(message: ServerMessage): void {
    for (const listener of this.listeners) listener(message)
  }
}
