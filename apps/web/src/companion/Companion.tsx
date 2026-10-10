import { useEffect, useRef, useState } from 'react'
import type { GameEvent, Quest, ServerSnapshot } from '@moss/shared'
import { ApiError, post, uploadPhoto, type PhotoOutcome } from '../lib/api.ts'
import { prepareImage } from '../lib/image.ts'
import { formatClock, useGame, useTicker } from '../lib/useGame.ts'
import { MossSprite, type SpriteMood } from '../components/MossSprite.tsx'
import { MossArrival, MossCelebrate, MossClip } from '../components/MossMotion.tsx'
import { ACHIEVEMENT_RULES } from '@moss/game-engine'
import { achievementArt } from '../lib/assets.ts'
import { CameraIcon } from '../components/icons.tsx'
import { STAT_LABEL } from '../components/icons.tsx'

/**
 * The phone is Moss's window to the physical world. One screen, one job:
 * understand the quest in seconds, do it, and get back outside.
 */
export default function Companion() {
  const { snapshot, connection, now, onEvent } = useGame()
  const [arrived, setArrived] = useState(false)

  // Moss "materialises" on the phone.
  useEffect(() => {
    const id = setTimeout(() => setArrived(true), 50)
    return () => clearTimeout(id)
  }, [])

  useEffect(
    () =>
      onEvent((e: GameEvent) => {
        if (e.kind === 'quest_completed') navigator.vibrate?.([60, 40, 120])
        if (e.kind === 'break_started') navigator.vibrate?.(200)
      }),
    [onEvent],
  )

  if (connection === 'unauthorized') {
    return (
      <Shell>
        <MossSprite mood="sad" size={140} />
        <h1 className="mt-6 font-display text-2xl font-semibold">Moss can't find you</h1>
        <p className="mt-2 text-parchment/70">Scan the QR code on your laptop again to pair this phone.</p>
      </Shell>
    )
  }
  if (!snapshot) {
    return (
      <Shell>
        <MossSprite mood="thinking" size={120} />
        <p className="mt-6 font-display text-lg text-parchment/70">{connection === 'closed' ? 'Looking for your laptop…' : 'Moss is on its way…'}</p>
      </Shell>
    )
  }

  const quest = snapshot.state.quest
  const open = quest && (quest.status === 'active' || quest.status === 'validating' || quest.status === 'completed')

  return (
    <Shell>
      <div className={`transition-all duration-700 ${arrived ? 'scale-100 opacity-100 blur-0' : 'scale-50 opacity-0 blur-md'}`}>
        {open ? <QuestScreen key={quest.id} quest={quest} snapshot={snapshot} now={now} /> : <RestingScreen snapshot={snapshot} now={now} />}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full overflow-x-hidden bg-[radial-gradient(ellipse_at_top,#2f4226_0%,#1b2418_55%,#10170e_100%)] px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">{children}</div>
    </div>
  )
}

function RestingScreen({ snapshot, now }: { snapshot: ServerSnapshot; now: () => number }) {
  useTicker(1000)
  const { timer } = snapshot.state
  const focus = timer.phase === 'focus'
  return (
    <div className="flex flex-col items-center pt-10">
      <MossSprite mood={focus ? 'idle' : 'sleeping'} size={150} />
      <h1 className="mt-6 font-display text-2xl font-semibold">{focus ? 'Moss is working on your laptop' : 'Moss is resting'}</h1>
      {focus && timer.endsAt && (
        <p className="mt-2 text-parchment/70">
          Next break in <span className="font-display font-semibold text-moss-300 tabular-nums">{formatClock(timer.endsAt - now())}</span>
        </p>
      )}
      <p className="mt-6 text-sm text-parchment/50">Keep this page open. Your phone buzzes when Moss needs you.</p>
    </div>
  )
}

type PhotoState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'result'; outcome: PhotoOutcome } | { kind: 'failed'; message: string }

function QuestScreen({ quest, snapshot, now }: { quest: Quest; snapshot: ServerSnapshot; now: () => number }) {
  useTicker(quest.completionType === 'TIMER' ? 1000 : 60_000)
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'idle' })
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const completed = quest.status === 'completed'
  const result = snapshot.state.lastResult

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const takePhoto = () => input.current?.click()

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setPhoto({ kind: 'sending' })
    try {
      const outcome = await uploadPhoto(await prepareImage(file), quest.id)
      setPhoto({ kind: 'result', outcome })
      if (outcome.outcome !== 'completed') navigator.vibrate?.(80)
    } catch (err) {
      setPhoto({ kind: 'failed', message: err instanceof ApiError ? err.message : 'Could not reach your laptop. Are you still on the same Wi-Fi?' })
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const complete = async (manual: boolean) => {
    setError(null)
    try {
      await post('/api/quest/complete', { questId: quest.id, manual })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach your laptop')
    }
  }

  if (completed && result) {
    return (
      <div className="flex flex-col items-center pt-4">
        <MossCelebrate size={170} />
        <div className="mt-4 text-sm font-bold tracking-[0.2em] text-moss-300 uppercase">Quest complete</div>
        <h1 className="mt-1 font-display text-3xl font-semibold">{snapshot.state.dialogue?.text ?? 'Moss recovered.'}</h1>
        {photo.kind === 'result' && photo.outcome.outcome === 'completed' && photo.outcome.detected.length > 0 && (
          <p className="mt-2 text-sm text-parchment/60">Moss saw: {photo.outcome.detected.slice(0, 4).join(', ')}</p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Chip>+{result.xpGained} XP</Chip>
          {result.statChanges.map((m) => (
            <Chip key={m.stat}>
              +{m.delta} {STAT_LABEL[m.stat]}
            </Chip>
          ))}
        </div>
        {result.newUnlocks.length > 0 && <p className="mt-4 font-display text-lg text-sun">Something new grew on your desk.</p>}
        {(result.newAchievements ?? []).map((id) => {
          const rule = ACHIEVEMENT_RULES.find((r) => r.id === id)
          return (
            <div key={id} className="animate-pop mt-5 flex w-full items-center gap-3 rounded-3xl bg-parchment p-3 text-left text-ink">
              <img src={achievementArt(id)} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              <div>
                <div className="text-[11px] font-bold tracking-[0.2em] text-bark uppercase">Achievement unlocked</div>
                <div className="font-display text-xl leading-tight font-semibold">{rule?.title}</div>
                <div className="text-xs text-ink/60">{rule?.description}</div>
              </div>
            </div>
          )
        })}
        <p className="mt-8 text-parchment/60">Head back to your workstation whenever you're ready.</p>
      </div>
    )
  }

  const validating = quest.status === 'validating' || photo.kind === 'sending'
  const outcome = photo.kind === 'result' ? photo.outcome : null
  const manualAllowed = quest.manualAllowed || quest.attempts >= 2 || (outcome && outcome.outcome !== 'completed' && outcome.manualAllowed)
  const mood: SpriteMood = validating ? 'thinking' : outcome?.outcome === 'rejected' ? 'sad' : 'eager'
  const timerRunning =
    quest.completionType === 'TIMER' && !!quest.timerStartedAt && now() < quest.timerStartedAt + (quest.timerMs ?? 0)

  return (
    <div className="flex flex-col items-center">
      {preview && validating ? (
        <div className="relative">
          <img src={preview} alt="Your photo" className="h-44 w-44 rounded-3xl object-cover shadow-2xl" />
          <div className="absolute -right-6 -bottom-6">
            <MossSprite mood="thinking" size={90} />
          </div>
        </div>
      ) : timerRunning ? (
        <MossClip clip="walk" size={150} />
      ) : mood === 'eager' && !outcome ? (
        <MossArrival size={150} mood="eager" />
      ) : (
        <MossSprite mood={mood} size={150} />
      )}

      <div className="mt-4 text-xs font-bold tracking-[0.2em] text-moss-300 uppercase">{quest.category} quest</div>
      <h1 className="mt-1 font-display text-3xl leading-tight font-semibold">{quest.title}</h1>
      <p className="mt-2 text-lg leading-snug text-parchment/85">{quest.description}</p>
      <p className="mt-2 text-sm text-parchment/50 italic">"{quest.mossLine}"</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Chip>+{quest.xpReward} XP</Chip>
        {quest.affectedStats.map((m) => (
          <Chip key={m.stat}>
            +{m.delta} {STAT_LABEL[m.stat]}
          </Chip>
        ))}
      </div>

      <div className="mt-7 w-full">
        {(quest.completionType === 'VISION_VALIDATION' || quest.completionType === 'PHOTO') && (
          <>
            <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {validating ? (
              <div className="rounded-2xl bg-forest-800/80 py-5 font-display text-xl">Moss is looking…</div>
            ) : (
              <>
                {outcome && outcome.outcome !== 'completed' && (
                  <div className="mb-3 rounded-2xl bg-berry/15 px-4 py-3 text-left text-sm text-parchment">
                    {outcome.outcome === 'rejected' ? `Hmm. ${outcome.reason}` : outcome.reason}
                  </div>
                )}
                {photo.kind === 'failed' && <div className="mb-3 rounded-2xl bg-berry/15 px-4 py-3 text-sm">{photo.message}</div>}
                <button className="btn-leaf flex w-full items-center justify-center gap-3 rounded-2xl py-5 font-display text-2xl font-semibold" onClick={takePhoto}>
                  <CameraIcon className="h-7 w-7" />
                  {outcome || photo.kind === 'failed' ? 'Try again' : 'Take photo'}
                </button>
                {manualAllowed && (
                  <button className="btn-ghost mt-3 w-full rounded-2xl py-3 font-semibold" onClick={() => complete(true)}>
                    Complete manually
                  </button>
                )}
              </>
            )}
          </>
        )}
        {quest.completionType === 'TIMER' && <TimerQuest quest={quest} now={now} onDone={() => complete(false)} />}
        {quest.completionType === 'USER_CONFIRMATION' && (
          <button className="btn-leaf w-full rounded-2xl py-5 font-display text-2xl font-semibold" onClick={() => complete(true)}>
            Done!
          </button>
        )}
        {error && <div className="mt-3 text-sm text-berry">{error}</div>}
      </div>
    </div>
  )
}

function TimerQuest({ quest, now, onDone }: { quest: Quest; now: () => number; onDone: () => void }) {
  useTicker(250)
  const total = quest.timerMs ?? 180_000
  const started = quest.timerStartedAt
  const remaining = started ? Math.max(0, started + total - now()) : total
  const finished = !!started && remaining === 0
  const buzzed = useRef(false)

  useEffect(() => {
    if (finished && !buzzed.current) {
      buzzed.current = true
      navigator.vibrate?.([200, 100, 200])
    }
  }, [finished])

  const progress = 1 - remaining / total
  const r = 54
  const c = 2 * Math.PI * r

  if (!started) {
    return (
      <button className="btn-leaf w-full rounded-2xl py-5 font-display text-2xl font-semibold" onClick={() => post('/api/quest/start-timer', { questId: quest.id })}>
        Start {formatClock(total)} timer
      </button>
    )
  }
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
        <circle cx="60" cy="60" r={r} stroke="rgba(246,238,219,0.12)" strokeWidth="8" fill="none" />
        <circle cx="60" cy="60" r={r} stroke="#9bcb57" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
      </svg>
      <div className="-mt-[106px] mb-[60px] font-display text-4xl font-semibold tabular-nums">{formatClock(remaining)}</div>
      {finished ? (
        <button className="btn-leaf w-full rounded-2xl py-5 font-display text-2xl font-semibold" onClick={onDone}>
          Done!
        </button>
      ) : (
        <p className="text-parchment/60">Pocket the phone. It buzzes when time's up.</p>
      )}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-moss-500/20 px-3 py-1 text-sm font-bold text-moss-300">{children}</span>
}
