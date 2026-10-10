import { useEffect, useState } from 'react'
import { MOTION_SPRITES, motionSprite, type MotionClip } from '../lib/assets.ts'
import { useReducedMotion } from '../lib/useGame.ts'
import { MossSprite, type SpriteMood } from './MossSprite.tsx'

// Preload the strips so the first frame of a clip never flashes empty.
if (typeof window !== 'undefined') {
  for (const clip of Object.keys(MOTION_SPRITES) as MotionClip[]) new Image().src = motionSprite(clip)
}

/** The baked frames leave headroom around Moss; scale up so it matches the painted poses' size. */
const CLIP_SCALE = 1.45

/**
 * Plays a sprite strip baked from the Meshy-rigged Moss (see src/dev/Bake.tsx).
 * Pure CSS, so the phone never loads Three.js.
 */
export function MossClip({ clip, size, loop = true }: { clip: MotionClip; size: number; loop?: boolean }) {
  const { frames, seconds } = MOTION_SPRITES[clip]
  return (
    <div style={{ height: size, width: (size * 320) / 384 }}>
      <div
        role="img"
        aria-label="Moss"
        className="h-full w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
        style={{
          transform: `scale(${CLIP_SCALE})`,
          transformOrigin: 'center 80%',
          backgroundImage: `url(${motionSprite(clip)})`,
          backgroundSize: `${frames * 100}% 100%`,
          backgroundRepeat: 'no-repeat',
          animation: `sprite-play ${seconds}s steps(${frames}, jump-none) ${loop ? 'infinite' : '1 forwards'}`,
        }}
      />
    </div>
  )
}

/** Moss walks in from the left, hops on arrival, then settles into a pose. */
export function MossArrival({ size, mood }: { size: number; mood: SpriteMood }) {
  const reduced = useReducedMotion()
  const [stage, setStage] = useState<'walk' | 'hop' | 'still'>(reduced ? 'still' : 'walk')

  useEffect(() => {
    if (reduced) return
    const walkMs = 1800
    const hopMs = MOTION_SPRITES.hop.seconds * 1000
    const a = setTimeout(() => setStage('hop'), walkMs)
    const b = setTimeout(() => setStage('still'), walkMs + hopMs)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [reduced])

  if (stage === 'still') return <MossSprite mood={mood} size={size} />
  return (
    <div className={stage === 'walk' ? 'animate-walk-in' : ''}>
      <MossClip clip={stage} size={size} loop={stage === 'walk'} />
    </div>
  )
}

/** A one-off celebration hop that settles into the happy pose. */
export function MossCelebrate({ size }: { size: number }) {
  const reduced = useReducedMotion()
  const [done, setDone] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const t = setTimeout(() => setDone(true), MOTION_SPRITES.hop.seconds * 1000)
    return () => clearTimeout(t)
  }, [reduced])
  return done ? <MossSprite mood="happy" size={size} /> : <MossClip clip="hop" size={size} loop={false} />
}
