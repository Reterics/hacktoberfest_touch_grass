export type SpriteMood = 'idle' | 'eager' | 'thinking' | 'happy' | 'sad' | 'sleeping'

/** Lightweight 2D Moss for the phone, matching the 3D desktop design (fuzzy gumdrop, sprout, glossy eyes). */
export function MossSprite({ mood = 'idle', size = 160 }: { mood?: SpriteMood; size?: number }) {
  const eyesClosed = mood === 'sleeping'
  const happy = mood === 'happy'
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={mood === 'thinking' ? '' : 'animate-bob'} aria-label="Moss">
      <defs>
        <filter id="fuzz" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="7" />
        </filter>
        <radialGradient id="body" cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor={mood === 'sad' ? '#a3ad7a' : '#a6d86a'} />
          <stop offset="60%" stopColor={mood === 'sad' ? '#7f8a5c' : '#6fa83a'} />
          <stop offset="100%" stopColor={mood === 'sad' ? '#5d6646' : '#47752a'} />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="182" rx="54" ry="8" fill="rgba(0,0,0,0.25)" />
      {/* sprout */}
      <g className={mood === 'eager' || happy ? 'origin-[100px_60px] animate-[bob_0.8s_ease-in-out_infinite]' : ''}>
        <path d="M100 62 C100 50 101 42 102 34" stroke="#4f7d28" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M102 36 C88 22 70 26 66 34 C78 42 92 42 102 36Z" fill="#8cc84b" />
        <path d="M102 36 C114 20 134 22 138 30 C126 40 112 42 102 36Z" fill="#7dbb3f" />
        {happy && <circle cx="102" cy="30" r="5" fill="#f5c451" />}
      </g>
      {/* body */}
      <path
        d="M100 58 C146 58 166 96 164 134 C162 166 136 176 100 176 C64 176 38 166 36 134 C34 96 54 58 100 58Z"
        fill="url(#body)"
        filter="url(#fuzz)"
      />
      {/* feet */}
      <ellipse cx="78" cy="176" rx="13" ry="7" fill="#3f6624" />
      <ellipse cx="122" cy="176" rx="13" ry="7" fill="#3f6624" />
      {/* eyes */}
      {eyesClosed || happy ? (
        <>
          <path d={happy ? 'M68 112 Q78 100 88 112' : 'M68 112 Q78 118 88 112'} stroke="#17120d" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d={happy ? 'M112 112 Q122 100 132 112' : 'M112 112 Q122 118 132 112'} stroke="#17120d" strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="78" cy={mood === 'eager' ? 106 : 110} rx="10" ry={mood === 'sad' ? 9 : 13} fill="#17120d" />
          <ellipse cx="122" cy={mood === 'eager' ? 106 : 110} rx="10" ry={mood === 'sad' ? 9 : 13} fill="#17120d" />
          <circle cx="81" cy="104" r="3.5" fill="#fff" />
          <circle cx="125" cy="104" r="3.5" fill="#fff" />
        </>
      )}
      {/* cheeks */}
      <ellipse cx="60" cy="128" rx="9" ry="6" fill="#e9879a" opacity="0.5" />
      <ellipse cx="140" cy="128" rx="9" ry="6" fill="#e9879a" opacity="0.5" />
      {/* mouth */}
      {happy ? (
        <path d="M88 128 Q100 144 112 128Z" fill="#3b1d16" />
      ) : mood === 'eager' ? (
        <ellipse cx="100" cy="132" rx="6" ry="7" fill="#3b1d16" />
      ) : mood === 'sad' ? (
        <path d="M91 136 Q100 128 109 136" stroke="#2a1a12" strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M92 130 Q100 137 108 130" stroke="#2a1a12" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {mood === 'thinking' && (
        <g fill="#f6eedb">
          <circle cx="150" cy="60" r="5">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="166" cy="48" r="6">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.3s" repeatCount="indefinite" />
          </circle>
          <circle cx="184" cy="34" r="7">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="0.6s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  )
}
