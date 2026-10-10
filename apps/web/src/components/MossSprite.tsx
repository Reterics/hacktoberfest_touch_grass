import { moodSprite } from '../lib/assets.ts'
import type { SpriteMood as CanonMood } from '../lib/visualState.ts'

export type SpriteMood = 'idle' | 'eager' | 'thinking' | 'happy' | 'sad' | 'sleeping'

const TO_CANON: Record<SpriteMood, CanonMood> = {
  idle: 'neutral',
  eager: 'excited',
  thinking: 'curious',
  happy: 'happy',
  sad: 'concerned',
  sleeping: 'sleeping',
}

/**
 * Lightweight 2D Moss for the phone: poses cut from the canonical expression sheet
 * (visuals/references/moss-expressions.webp), so phone and desktop show the same creature.
 */
export function MossSprite({ mood = 'idle', size = 160 }: { mood?: SpriteMood; size?: number }) {
  return (
    <div className="relative inline-block" style={{ height: size }}>
      <img
        key={mood}
        src={moodSprite(TO_CANON[mood])}
        alt="Moss"
        draggable={false}
        className={`animate-pop h-full w-auto drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)] ${mood === 'thinking' ? '' : 'animate-bob'}`}
      />
      {mood === 'thinking' && (
        <div className="absolute -top-1 -right-4 flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-parchment" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      )}
    </div>
  )
}
