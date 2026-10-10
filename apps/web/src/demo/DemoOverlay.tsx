import type { Quest } from '@moss/shared'
import { MossClip } from '../components/MossMotion.tsx'
import { SparkIcon } from '../components/icons.tsx'
import type { DemoView, PhoneScreen } from './useDemoGame.ts'
import { GEMMA_VERDICT, INTRO, NARRATION, TAGLINE } from './script.ts'

const ART = '/assets/demo'

export function DemoOverlay({ demo, quest }: { demo: DemoView; quest: Quest | null }) {
  return (
    <>
      {demo.stage === 'running' && (
        <div className="pointer-events-none absolute right-5 bottom-5 rounded-full bg-forest-950/60 px-3 py-1 text-[10px] font-semibold tracking-wide text-parchment/45">
          Demo replay · real game engine · recorded local Gemma verdict
        </div>
      )}
      {demo.stage === 'intro' && (
        // All subtitles share one spot and cross-fade, so nothing jumps between lines.
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] grid place-items-center px-6">
          {INTRO.map((line, i) => (
            <p
              key={line.text}
              className={`col-start-1 row-start-1 max-w-3xl text-center font-display text-3xl leading-snug font-semibold text-parchment drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)] ${reveal(demo.introLine === i + 1 && !demo.tagline)}`}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}
      {(demo.stage === 'intro' || demo.stage === 'running') && (
        <div className="pointer-events-none absolute inset-x-0 top-[7%] flex justify-center px-6">
          <div className={`parchment max-w-xl rounded-3xl px-7 py-4 text-center ${reveal(demo.tagline)}`}>
            <div className="text-[11px] font-bold tracking-[0.25em] text-bark uppercase">Meet Moss</div>
            <p className="mt-1 font-display text-2xl leading-snug font-semibold">{TAGLINE.text}</p>
          </div>
        </div>
      )}
      {demo.phone && quest && <Phone screen={demo.phone} quest={quest} />}
      {/* Sits just above the timer dock: clear of Moss's speech bubble and face. */}
      {demo.caption && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[212px] flex justify-center">
          <div className="hud-glass animate-fade-up rounded-2xl px-6 py-3 font-display text-2xl font-semibold text-parchment">{demo.caption}</div>
        </div>
      )}
      {demo.stage === 'title' && <TitleCard onStart={demo.start} />}
      {demo.stage === 'end' && <EndCard demo={demo} />}
    </>
  )
}

function TitleCard({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-40 bg-forest-950">
      <img src={`${ART}/title-card.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-forest-950/90 via-forest-950/45 to-transparent" />
      <div className="relative flex h-full max-w-xl flex-col justify-center gap-5 px-6 sm:px-14">
        <div className="text-xs font-bold tracking-[0.3em] text-moss-300 uppercase">Demo · Moss Needs a Tree</div>
        <h1 className="font-display text-7xl font-semibold text-parchment drop-shadow-lg sm:text-8xl">Moss</h1>
        <p className="text-xl leading-snug text-parchment/85">An AI companion that gets you away from AI.</p>
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn-leaf rounded-full px-9 py-3.5 font-display text-xl font-semibold" onClick={onStart}>
            Play demo
          </button>
          <span className="text-sm text-parchment/60">About a minute · sound on</span>
        </div>
      </div>
    </div>
  )
}

function Phone({ screen, quest }: { screen: PhoneScreen; quest: Quest }) {
  return (
    <div className="pointer-events-none absolute top-1/2 right-[6%] z-30 -translate-y-1/2">
      <div className="animate-phone-in relative h-[min(640px,82vh)] w-[min(310px,40vh)] rounded-[46px] bg-[#111] p-3 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        <div className="absolute top-5 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-forest-900">
          {screen === 'quest' ? <QuestScreen quest={quest} /> : <CameraScreen screen={screen} />}
        </div>
      </div>
    </div>
  )
}

function QuestScreen({ quest }: { quest: Quest }) {
  return (
    <div className="flex h-full flex-col items-center px-5 pt-14 pb-6 text-center">
      <div className="text-[10px] font-bold tracking-[0.25em] text-moss-300 uppercase">Break quest</div>
      <div className="mt-2 font-display text-3xl leading-tight font-semibold text-parchment">{quest.title}</div>
      <p className="mt-2 text-sm text-parchment/70">{quest.description}</p>
      <div className="mt-2 rounded-full bg-moss-500/20 px-3 py-1 text-xs font-bold text-moss-300">
        +{quest.xpReward} XP · Ecosystem growth
      </div>
      <div className="flex flex-1 items-center">
        <MossClip clip="walk" size={190} />
      </div>
      <div className="btn-leaf w-full rounded-full py-3 font-display text-lg font-semibold">Take a photo</div>
    </div>
  )
}

function CameraScreen({ screen }: { screen: PhoneScreen }) {
  const { verdict, model, latencyMs } = GEMMA_VERDICT
  return (
    <div className="relative h-full w-full">
      <img src={`${ART}/tree-photo.webp`} alt="A tree in a park" className="absolute inset-0 h-full w-full object-cover" />
      {screen === 'camera' && (
        <>
          <div className="absolute inset-x-0 top-12 text-center font-display text-lg font-semibold text-white drop-shadow">Show Moss a tree</div>
          <div className="absolute inset-[18%_12%_26%] rounded-2xl border-2 border-white/70" />
          <div className="absolute bottom-8 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-4 border-white bg-white/30" />
        </>
      )}
      {screen === 'flash' && <div className="animate-camera-flash absolute inset-0 bg-white" />}
      {screen === 'checking' && (
        <div className="absolute inset-0 flex items-end bg-black/45 p-4">
          <div className="parchment flex w-full items-center gap-3 rounded-2xl p-4">
            <span className="h-3 w-3 animate-ping rounded-full bg-moss-500" />
            <div className="text-left">
              <div className="font-display text-lg leading-tight">Moss is looking…</div>
              <div className="text-[11px] text-ink/60">Local {model} on your laptop</div>
            </div>
          </div>
        </div>
      )}
      {screen === 'found' && (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-4">
          <div className="parchment animate-pop w-full rounded-2xl p-4 text-left">
            <div className="font-display text-3xl font-semibold text-moss-600">Nature found. ✓</div>
            <p className="mt-1 text-xs leading-snug text-ink/70">“{verdict.reason}”</p>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-ink/45">
              <SparkIcon className="h-3 w-3" /> {model} · confidence {verdict.confidence.toFixed(2)} · {(latencyMs / 1000).toFixed(1)} s
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** After the headline: three building blocks, the result (highlighted), then Moss's purpose. */
const LINE_STYLE: Record<number, string> = {
  3: 'mt-3 font-display text-2xl font-semibold text-moss-300',
  4: 'mt-1 text-lg text-parchment/70',
}

/**
 * Every line is laid out from the start and only revealed, so the block never shifts as lines
 * arrive; each one drifts up and comes into focus slowly.
 */
function reveal(shown: boolean): string {
  return `transition-[opacity,transform,filter] duration-700 ease-out ${shown ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-1.5 blur-[1.5px]'}`
}

function EndCard({ demo }: { demo: DemoView }) {
  const [headline, ...lines] = NARRATION
  return (
    <div className="animate-fade-in absolute inset-0 z-40 bg-forest-950">
      <img src={`${ART}/end-card.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-forest-950/95 via-forest-950/70 to-forest-950/10" />
      <div className="relative flex h-full max-w-2xl flex-col justify-center gap-4 px-6 sm:px-14">
        <div className="text-xs font-bold tracking-[0.3em] text-moss-300 uppercase">Open innovation</div>
        <h2 className={`font-display text-4xl leading-tight font-semibold text-parchment sm:text-5xl ${reveal(demo.narration >= 1)}`}>{headline!.text}</h2>
        <div className="flex flex-col gap-1.5 text-xl text-parchment/80">
          {lines.map((l, i) => (
            <p key={l.text} className={`${LINE_STYLE[i] ?? ''} ${reveal(demo.narration >= i + 2)}`}>
              {l.text}
            </p>
          ))}
        </div>
        {demo.finale && (
          <div className="animate-fade-up mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <button className="btn-leaf rounded-full px-7 py-3 font-display text-lg font-semibold" onClick={demo.start}>
                Replay
              </button>
              <a href="/" className="btn-ghost rounded-full px-5 py-3 text-sm font-semibold text-parchment">
                Open Moss
              </a>
            </div>
            <p className="text-[11px] text-parchment/40">
              Gemma 3 (local, via Ollama) · Three.js · React · WebSockets · art by Higgsfield · voice & sound by ElevenLabs · 3D by Meshy
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
