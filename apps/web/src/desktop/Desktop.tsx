import { useEffect, useMemo, useRef, useState } from 'react'
import type { AchievementId, AIStatus, GameEvent, GameState, PairingInfo, Quest, ServerSnapshot, UnlockId } from '@moss/shared'
import { achievementArt } from '../lib/assets.ts'
import { ACHIEVEMENT_RULES, UNLOCK_RULES, getPreset, xpToNextLevel } from '@moss/game-engine'
import { getPairing, post, uploadPhoto, ApiError } from '../lib/api.ts'
import { formatClock, useGame, useReducedMotion, useTicker } from '../lib/useGame.ts'
import { VISUAL_PROFILES, useVisualState, type MossVisualState } from '../lib/visualState.ts'
import { prepareImage } from '../lib/image.ts'
import { PhoneIcon, SparkIcon, STAT_LABEL, STAT_META } from '../components/icons.tsx'
import { Scene } from './Scene.tsx'
import { DEMO, useDemoGame, type DemoView } from '../demo/useDemoGame.ts'
import { DemoOverlay } from '../demo/DemoOverlay.tsx'

// /?demo=1 swaps the server connection for the scripted demo; the rest of the UI is unchanged.
const useConnection: () => ReturnType<typeof useGame> & { demo?: DemoView } = DEMO ? useDemoGame : useGame

export default function Desktop() {
  const { snapshot, connection, now, onEvent, demo } = useConnection()
  const reducedMotion = useReducedMotion()
  const derived = useVisualState(snapshot?.state, onEvent)
  // Design review: /?visual=tired forces a visual state.
  const visual = forcedVisual ?? demo?.visualOverride ?? derived
  const [rewardKey, setRewardKey] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [rejection, setRejection] = useState<{ questId: string; reason: string; technical: boolean } | null>(null)
  const [pokeLine, setPokeLine] = useState<string | null>(null)

  useEffect(
    () =>
      onEvent((e: GameEvent) => {
        if (e.kind === 'quest_completed') {
          setRewardKey((k) => k + 1)
          setRejection(null)
          pushToast(setToasts, { id: e.at, kind: 'xp', text: `+${e.result.xpGained} XP` })
        }
        if (e.kind === 'quest_rejected') setRejection({ questId: e.questId, reason: e.reason, technical: e.technical })
        if (e.kind === 'quest_validating') setRejection(null)
        if (e.kind === 'level_up') pushToast(setToasts, { id: e.at + 1, kind: 'level', text: `Level ${e.level}` })
        if (e.kind === 'achievement') {
          const rule = ACHIEVEMENT_RULES.find((r) => r.id === e.achievement)
          pushToast(setToasts, { id: e.at + 10 + ACHIEVEMENT_RULES.indexOf(rule!), kind: 'achievement', text: rule?.title ?? 'Achievement', achievement: e.achievement })
        }
        if (e.kind === 'unlock') {
          const rule = UNLOCK_RULES.find((r) => r.id === e.unlock)
          pushToast(setToasts, { id: e.at + 2 + UNLOCK_RULES.indexOf(rule!), kind: 'unlock', text: rule?.label ?? 'Something grew' })
        }
      }),
    [onEvent],
  )

  if (!snapshot) {
    return (
      <div className="grid h-full place-items-center bg-forest-950 font-display text-moss-300">
        {connection === 'closed' ? 'Moss is waking up… (is the server running?)' : 'Waking Moss…'}
      </div>
    )
  }

  const { state, ai } = snapshot
  const health = averageWellbeing(state)
  const dialogue = pokeLine ? { text: pokeLine, emotion: 'happy' as const, at: -1 } : state.dialogue
  // Moss "heads outside" while a paired phone is carrying an open quest.
  const questOpen = state.quest?.status === 'active' || state.quest?.status === 'validating'
  const away = forcedAway || (snapshot.phoneConnected && !!questOpen)

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <div className="absolute inset-0">
        <Scene
          visual={visual}
          phase={state.timer.phase}
          level={state.creature.level}
          health={health}
          unlocks={state.creature.unlocks}
          dialogue={dialogue}
          rewardKey={rewardKey}
          away={away}
          reducedMotion={reducedMotion}
          onPoke={() => {
            setPokeLine(pokeLines[Math.floor(Math.random() * pokeLines.length)]!)
            setTimeout(() => setPokeLine(null), 2500)
          }}
        />
      </div>

      {/* vignette for HUD legibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(10,14,8,0.55)_100%)]" />

      {/* In the demo the HUD is display-only: nothing may reach a real server. */}
      <div className={demo ? 'pointer-events-none' : 'contents'}>
        <TopLeft state={state} />
        <TopRight ai={ai} phoneConnected={snapshot.phoneConnected} connection={connection} away={away} />
        {ai.state !== 'ready' && ai.state !== 'checking' && <SetupBanner ai={ai} />}
        <Stats state={state} />
        <TimerDock snapshot={snapshot} now={now} highlight={!!demo?.pulse} />
        {state.quest && (state.quest.status !== 'skipped' && state.quest.status !== 'expired') && !(demo && (demo.phone || state.quest.status === 'validating')) && (
          <QuestPanel snapshot={snapshot} quest={state.quest} now={now} rejection={rejection?.questId === state.quest.id ? rejection : null} />
        )}
      </div>
      <Toasts toasts={toasts} />
      {demo && <DemoOverlay demo={demo} quest={state.quest} />}
    </div>
  )
}

// Design review: /?away=1 sends Moss outside.
const forcedAway = new URLSearchParams(window.location.search).get('away') === '1'

const forcedVisual = ((v) => (v && v in VISUAL_PROFILES ? (v as MossVisualState) : null))(
  new URLSearchParams(window.location.search).get('visual'),
)

const pokeLines = ['Hey.', 'I am working too, you know.', 'Boop received.', 'That tickles.', 'Personal space. Please.', 'Hi!']

function averageWellbeing(state: GameState): number {
  const s = state.creature.stats
  return (s.happiness + s.energy + s.nature + s.movement + s.rest) / 500
}

// ---- top bar ----------------------------------------------------------------

const UNLOCK_HINTS: Record<UnlockId, string> = {
  tiny_tree: 'Show Moss a tree',
  grass_patch: 'Find some grass',
  flower_pot: 'Find a flower',
  sun_crystal: 'Show Moss the sky',
  desk_plant: 'Complete 10 quests',
  ecosystem: 'Complete 50 quests',
}

function TopLeft({ state }: { state: GameState }) {
  const { creature } = state
  const need = xpToNextLevel(creature.level)
  const nextUnlock = UNLOCK_RULES.find((r) => !creature.unlocks.includes(r.id))
  return (
    <div className="absolute top-5 left-5 flex flex-col gap-3">
      <div className="hud-glass flex items-center gap-4 rounded-2xl px-4 py-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-moss-500 font-display text-xl font-semibold text-forest-950 shadow-inner">
          {creature.level}
        </div>
        <div className="min-w-44">
          <div className="flex items-baseline justify-between gap-6">
            <span className="font-display text-2xl font-semibold tracking-wide text-parchment">Moss</span>
            {creature.streakDays > 0 && (
              <span className="text-xs font-bold text-ember" title="Days in a row with an outdoor quest">
                {creature.streakDays} day streak
              </span>
            )}
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-forest-950/70">
            <div className="h-full rounded-full bg-gradient-to-r from-moss-500 to-moss-300 transition-[width] duration-700" style={{ width: `${(creature.xp / need) * 100}%` }} />
          </div>
          <div className="mt-1 text-[11px] font-semibold tracking-wide text-parchment/60">
            {creature.xp} / {need} XP
          </div>
        </div>
      </div>
      <div className="hud-glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-parchment/80">
        <span className="font-bold text-moss-300">Ecosystem</span>
        <span className="flex gap-1">
          {UNLOCK_RULES.map((r) => (
            <span
              key={r.id}
              title={creature.unlocks.includes(r.id) ? r.label : UNLOCK_HINTS[r.id]}
              className={`h-2.5 w-2.5 rounded-full ${creature.unlocks.includes(r.id) ? 'bg-moss-400 shadow-[0_0_8px_#9bcb57]' : 'bg-parchment/15'}`}
            />
          ))}
        </span>
        {nextUnlock && <span className="text-parchment/50">Next: {UNLOCK_HINTS[nextUnlock.id]}</span>}
      </div>
      <Achievements earned={creature.achievements} />
    </div>
  )
}

function TopRight({ ai, phoneConnected, connection, away }: { ai: AIStatus; phoneConnected: boolean; connection: string; away: boolean }) {
  const aiColor = ai.state === 'ready' ? 'bg-moss-400' : ai.state === 'checking' ? 'bg-sun' : 'bg-berry'
  return (
    <div className="absolute top-5 right-5 flex items-center gap-2 text-xs font-semibold">
      {connection !== 'open' && <span className="hud-glass rounded-full px-3 py-1.5 text-sun">Reconnecting…</span>}
      <span className="hud-glass flex items-center gap-2 rounded-full px-3 py-1.5" title={ai.message}>
        <span className={`h-2 w-2 rounded-full ${aiColor}`} />
        {ai.state === 'ready' ? `Local ${ai.textModel}` : ai.state === 'checking' ? 'Finding Gemma…' : 'AI offline'}
      </span>
      <span className={`hud-glass flex items-center gap-1.5 rounded-full px-3 py-1.5 ${phoneConnected ? 'text-moss-300' : 'text-parchment/50'}`}>
        <PhoneIcon className="h-3.5 w-3.5" />
        {away ? 'Moss is outside with you' : phoneConnected ? 'Phone paired' : 'No phone'}
      </span>
    </div>
  )
}

function SetupBanner({ ai }: { ai: AIStatus }) {
  return (
    <div className="parchment animate-fade-up absolute top-24 left-1/2 w-[min(560px,92vw)] -translate-x-1/2 rounded-2xl px-5 py-4">
      <div className="font-display text-lg font-semibold">Moss's brain is napping</div>
      <p className="mt-1 text-sm text-ink/80">
        {ai.message} Quests still work with built-in wording, and photo quests can be completed manually.
      </p>
      {ai.fixCommand && (
        <code className="mt-2 inline-block rounded-lg bg-ink px-3 py-1.5 font-mono text-sm text-moss-300 select-all">{ai.fixCommand}</code>
      )}
    </div>
  )
}

// ---- stats ------------------------------------------------------------------

function Stats({ state }: { state: GameState }) {
  return (
    <div className="absolute bottom-6 left-5 flex flex-col gap-2">
      {Object.entries(STAT_META).map(([key, meta]) => {
        const value = state.creature.stats[key as keyof typeof state.creature.stats]
        const low = value < 30
        return (
          <div key={key} className="hud-glass flex w-44 items-center gap-2.5 rounded-full py-1.5 pr-3 pl-2" title={meta!.label}>
            <meta.Icon className={`h-4 w-4 shrink-0 ${low ? 'animate-pulse' : ''}`} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-forest-950/70">
              <div className="h-full rounded-full transition-[width] duration-1000" style={{ width: `${value}%`, background: meta!.color }} />
            </div>
            <span className="w-6 text-right text-[11px] font-bold text-parchment/70 tabular-nums">{value}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---- timer ------------------------------------------------------------------

function TimerDock({ snapshot, now, highlight = false }: { snapshot: ServerSnapshot; now: () => number; highlight?: boolean }) {
  useTicker(250)
  const { timer, quest } = snapshot.state
  const preset = getPreset(timer.presetId)
  const paused = timer.pausedRemainingMs !== null
  const remaining = paused ? timer.pausedRemainingMs! : timer.endsAt ? timer.endsAt - now() : preset.focusMs
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (path: string, body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      await post(path, body)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const label =
    timer.phase === 'focus' ? (paused ? 'Paused' : 'Focus session') : timer.phase === 'break' ? 'Break time' : quest?.status === 'completed' ? 'Ready for the next round' : 'Ready when you are'

  return (
    <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center">
      <div className="text-xs font-bold tracking-[0.25em] text-moss-300 uppercase">{label}</div>
      <div className={`timer-digits text-7xl font-semibold text-parchment ${paused ? 'opacity-60' : ''}`}>
        {formatClock(remaining)}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {timer.phase === 'idle' && (
          <>
            <select
              className="hud-glass rounded-full px-3 py-2.5 text-sm font-semibold text-parchment outline-none"
              value={timer.presetId}
              disabled={busy}
              onChange={(e) => act('/api/settings/preset', { presetId: e.target.value })}
            >
              {snapshot.presets.map((p) => (
                <option key={p.id} value={p.id} className="bg-forest-900">
                  {p.label}
                </option>
              ))}
            </select>
            <button className="btn-leaf rounded-full px-8 py-3 font-display text-lg font-semibold" disabled={busy} onClick={() => act('/api/timer/start')}>
              {quest?.status === 'active' ? 'Back to work' : 'Start focus'}
            </button>
          </>
        )}
        {timer.phase === 'focus' && (
          <>
            {paused ? (
              <button className="btn-leaf rounded-full px-6 py-2.5 font-display font-semibold" disabled={busy} onClick={() => act('/api/timer/resume')}>
                Resume
              </button>
            ) : (
              <button className="btn-ghost rounded-full px-5 py-2.5 text-sm font-semibold" disabled={busy} onClick={() => act('/api/timer/pause')}>
                Pause
              </button>
            )}
            <button className="btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold" disabled={busy} onClick={() => act('/api/timer/extend', { minutes: 5 })}>
              +5 min
            </button>
            <button className="btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold text-parchment/70" disabled={busy} onClick={() => act('/api/timer/stop')}>
              Stop
            </button>
          </>
        )}
        {timer.phase === 'break' &&
          (quest?.status === 'completed' ? (
            <button className={`btn-leaf rounded-full px-8 py-3 font-display text-lg font-semibold ${highlight ? 'animate-pulse ring-4 ring-sun/80' : ''}`} disabled={busy} onClick={() => act('/api/timer/start')}>
              Back to work
            </button>
          ) : (
            <>
              <button className="btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold" disabled={busy} onClick={() => act('/api/timer/extend', { minutes: 5 })}>
                +5 min break
              </button>
              <button className="btn-ghost rounded-full px-4 py-2.5 text-sm font-semibold text-parchment/60" disabled={busy} onClick={() => act('/api/timer/skip-break')}>
                Skip break
              </button>
            </>
          ))}
      </div>
      {error && <div className="mt-2 text-xs font-semibold text-berry">{error}</div>}
    </div>
  )
}

// ---- quest panel ------------------------------------------------------------

function QuestPanel({
  snapshot,
  quest,
  now,
  rejection,
}: {
  snapshot: ServerSnapshot
  quest: Quest
  now: () => number
  rejection: { reason: string; technical: boolean } | null
}) {
  const [pairing, setPairing] = useState<PairingInfo | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const result = snapshot.state.lastResult
  const completed = quest.status === 'completed'

  useEffect(() => {
    if (completed || DEMO) return
    getPairing()
      .then(setPairing)
      .catch((err: Error) => setPairingError(err.message))
  }, [completed])

  const manualAllowed = quest.manualAllowed || quest.attempts >= 2
  const photoQuest = quest.completionType === 'VISION_VALIDATION' || quest.completionType === 'PHOTO'

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      await uploadPhoto(await prepareImage(file), quest.id)
    } catch {
      // the server broadcasts the outcome; errors surface through quest_rejected
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const rewards = useMemo(
    () => [`+${quest.xpReward} XP`, ...quest.affectedStats.map((m) => `+${m.delta} ${STAT_LABEL[m.stat]}`)],
    [quest],
  )

  return (
    <aside className="parchment animate-fade-up absolute top-1/2 right-6 w-[340px] -translate-y-1/2 rounded-3xl p-6">
      <div className="flex items-center justify-between text-[11px] font-bold tracking-[0.2em] text-bark uppercase">
        <span>{completed ? 'Quest complete' : quest.category + ' quest'}</span>
        {snapshot.state.timer.phase === 'break' && snapshot.state.timer.endsAt && <BreakClock endsAt={snapshot.state.timer.endsAt} now={now} />}
      </div>
      <h2 className="mt-2 font-display text-3xl leading-tight font-semibold">{quest.title}</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink/80">{quest.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {rewards.map((r) => (
          <span key={r} className="rounded-full bg-moss-600/15 px-2.5 py-1 text-xs font-bold text-moss-600">
            {r}
          </span>
        ))}
      </div>

      {completed && result ? (
        <div className="mt-5 rounded-2xl bg-moss-600/15 p-4 text-center">
          <div className="font-display text-xl font-semibold text-moss-600">Moss recovered</div>
          <div className="mt-1 text-sm text-ink/70">
            +{result.xpGained} XP{result.manual ? ' (completed manually)' : ''}
            {result.leveledUp ? ' · Level up!' : ''}
          </div>
          <div className="mt-2 text-xs text-ink/60">Head back to your desk when you're ready.</div>
        </div>
      ) : quest.status === 'validating' ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-ink/5 p-4">
          <span className="h-3 w-3 animate-ping rounded-full bg-moss-500" />
          <span className="font-display text-lg">Moss is looking at your photo…</span>
        </div>
      ) : (
        <>
          {rejection && (
            <div className="mt-4 rounded-xl bg-berry/10 px-3 py-2 text-sm text-berry">
              {rejection.technical ? rejection.reason : `Not quite: ${rejection.reason}`}
            </div>
          )}
          <div className="mt-5 flex items-center gap-4">
            <div className="h-32 w-32 shrink-0 rounded-2xl bg-white/70 p-2">
              {pairing ? (
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: pairing.qrSvg }} />
              ) : (
                <div className="grid h-full place-items-center text-center text-[11px] text-ink/50">
                  {DEMO ? <PhoneIcon className="h-12 w-12 text-moss-600" /> : (pairingError ?? 'Making QR…')}
                </div>
              )}
            </div>
            <div>
              <div className="font-display text-lg leading-tight font-semibold">Take Moss outside</div>
              <p className="mt-1 text-xs leading-snug text-ink/70">
                {snapshot.phoneConnected ? 'Moss is on your phone. Go!' : 'Scan with your phone on the same Wi-Fi.'}
              </p>
              {pairing && <div className="mt-1 truncate text-[10px] text-ink/40" title={pairing.url}>{new URL(pairing.url).host}</div>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {photoQuest && (
              <>
                <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <button className="rounded-full bg-ink/8 px-3 py-1.5 font-semibold hover:bg-ink/15" disabled={uploading} onClick={() => fileInput.current?.click()}>
                  {uploading ? 'Sending…' : 'Upload from this computer'}
                </button>
              </>
            )}
            {(manualAllowed || quest.completionType === 'USER_CONFIRMATION') && (
              <button className="rounded-full bg-ink/8 px-3 py-1.5 font-semibold hover:bg-ink/15" onClick={() => post('/api/quest/complete', { questId: quest.id, manual: true })}>
                {quest.completionType === 'USER_CONFIRMATION' ? 'I did it' : 'Complete manually'}
              </button>
            )}
          </div>
          {quest.source === 'ai' && (
            <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-ink/40">
              <SparkIcon className="h-3 w-3" /> Written by local Gemma
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function BreakClock({ endsAt, now }: { endsAt: number; now: () => number }) {
  useTicker(500)
  return <span className="tabular-nums">{formatClock(endsAt - now())}</span>
}

// ---- toasts -----------------------------------------------------------------

interface Toast {
  id: number
  kind: 'xp' | 'level' | 'unlock' | 'achievement'
  text: string
  achievement?: AchievementId
}

function pushToast(set: React.Dispatch<React.SetStateAction<Toast[]>>, toast: Toast) {
  // Let the emotional reward (Moss reacting, energy flowing) land before the number.
  const delay = toast.kind === 'xp' ? 1400 : toast.kind === 'level' ? 2000 : toast.kind === 'unlock' ? 2600 : 3400
  setTimeout(() => {
    set((t) => [...t.filter((x) => x.id !== toast.id), toast])
    setTimeout(() => set((t) => t.filter((x) => x.id !== toast.id)), toast.kind === 'achievement' ? 5200 : 3200)
  }, delay)
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center gap-3">
      {toasts.map((t) =>
        t.kind === 'achievement' && t.achievement ? (
          <div key={t.id} className="parchment animate-pop flex items-center gap-4 rounded-3xl p-3 pr-6">
            <img src={achievementArt(t.achievement)} alt="" className="h-24 w-24 rounded-2xl object-cover" />
            <div>
              <div className="text-[11px] font-bold tracking-[0.2em] text-bark uppercase">Achievement unlocked</div>
              <div className="font-display text-2xl font-semibold">{t.text}</div>
            </div>
          </div>
        ) : (
        <div
          key={t.id}
          className={`animate-rise font-display font-semibold drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)] ${
            t.kind === 'xp' ? 'text-5xl text-moss-300' : t.kind === 'level' ? 'text-6xl text-sun' : 'hud-glass rounded-2xl px-5 py-2 text-xl text-parchment'
          }`}
        >
          {t.kind === 'unlock' ? `New: ${t.text}` : t.text}
        </div>
        ),
      )}
    </div>
  )
}

// ---- achievements -----------------------------------------------------------

function Achievements({ earned }: { earned: AchievementId[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="hud-glass flex items-center gap-2 self-start rounded-xl px-3 py-2 text-xs text-parchment/80" onClick={() => setOpen(true)}>
        <span className="font-bold text-sun">Achievements</span>
        <span className="flex -space-x-1.5">
          {ACHIEVEMENT_RULES.map((r) => (
            <img
              key={r.id}
              src={achievementArt(r.id)}
              alt={r.title}
              title={r.title}
              className={`h-6 w-6 rounded-full border border-forest-900 object-cover ${earned.includes(r.id) ? '' : 'opacity-35 grayscale'}`}
            />
          ))}
        </span>
        <span className="text-parchment/50">
          {earned.length}/{ACHIEVEMENT_RULES.length}
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-forest-950/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="parchment animate-pop w-[min(760px,92vw)] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl font-semibold">Achievements</h2>
              <button className="text-sm font-semibold text-ink/50 hover:text-ink" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {ACHIEVEMENT_RULES.map((r) => {
                const got = earned.includes(r.id)
                return (
                  <div key={r.id} className="text-center">
                    <img src={achievementArt(r.id)} alt="" className={`aspect-square w-full rounded-2xl object-cover ${got ? '' : 'opacity-40 grayscale'}`} />
                    <div className="mt-2 font-display text-lg leading-tight font-semibold">{r.title}</div>
                    <div className="text-xs text-ink/60">{got ? r.description : `Locked: ${r.description.replace(/^Completed|^Took/, (m) => (m === 'Took' ? 'Take' : 'Complete'))}`}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
