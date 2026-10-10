import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { MossModel } from '../desktop/MossModel.tsx'

/**
 * Dev-only sprite baker (http://localhost:5173/?bake=walk or ?bake=hop).
 * Renders the Meshy-rigged walk with Moss's live face at exact clip times and saves a
 * transparent sprite strip for the phone companion, so the phone never needs Three.js.
 */
const CLIPS = {
  walk: { frames: 12, seconds: 1, file: 'moss-walk' },
  hop: { frames: 24, seconds: 2, file: 'moss-hop' },
} as const
const clipName = (new URLSearchParams(window.location.search).get('bake') === 'hop' ? 'hop' : 'walk') as keyof typeof CLIPS
const { frames: FRAMES, seconds: CLIP_SECONDS, file: FILE } = CLIPS[clipName]
const FRAME_W = 320
const FRAME_H = 384
/** Three-quarter view, walking toward the right of the screen. */
const YAW = 0.85

const PHONE_GRADE = 'saturate(0.6) hue-rotate(-12deg) brightness(0.93)'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Side-by-side check that the static and rigged bodies render identically (?bake=compare). */
function Compare() {
  const view = (rigged: boolean) => (
    <div style={{ width: FRAME_W, height: FRAME_H, background: '#2a3322' }}>
      <Canvas dpr={1} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }} camera={{ fov: 23, position: [0, 1.15, 6.4] }} onCreated={({ camera }) => camera.lookAt(0, 1.05, 0)}>
        <hemisphereLight args={['#f1f5ff', '#6a5038', 1.1]} />
        <directionalLight position={[-3, 5, 4]} intensity={2.4} color="#fff0d8" />
        <directionalLight position={[3, 2, 5]} intensity={0.6} color="#cfe0ff" />
        <MossModel visual="idle" level={1} health={1} reducedMotion away={false} bake={rigged ? { clip: 'walk', time: 0, yaw: 0.5 } : null} />
      </Canvas>
    </div>
  )
  return (
    <div className="grid h-full place-items-center bg-[#2a3322] text-parchment">
      <div className="flex gap-4">
        {view(false)}
        {view(true)}
      </div>
    </div>
  )
}

export default function Bake() {
  return new URLSearchParams(window.location.search).get('bake') === 'compare' ? <Compare /> : <BakeStrip />
}

function BakeStrip() {
  const [frame, setFrame] = useState(0)
  const [status, setStatus] = useState('Loading Moss…')
  // Rendering is driven manually (frameloop="never") so each captured frame is exactly the pose we set.
  // Keep the tab focused while baking: browsers throttle timers in background tabs.
  const advance = useRef<((t: number) => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      // Give the GLBs time to load before capturing.
      for (let k = 0; k < 15; k++) {
        await wait(150)
        advance.current?.(performance.now())
      }
      const strip = document.createElement('canvas')
      strip.width = FRAME_W * FRAMES
      strip.height = FRAME_H
      const ctx = strip.getContext('2d')!
      // The strips hand off to the painted expression-sheet poses on the phone; grade the 3D render
      // toward that palette (measured: painted is half as saturated and slightly warmer).
      ctx.filter = PHONE_GRADE
      for (let i = 0; i < FRAMES && !cancelled; i++) {
        setFrame(i)
        setStatus(`Capturing frame ${i + 1}/${FRAMES}`)
        await wait(50) // let React commit the new pose
        for (let k = 0; k < 3; k++) advance.current?.(performance.now())
        const canvas = document.querySelector('canvas')!
        ctx.drawImage(canvas, i * FRAME_W, 0, FRAME_W, FRAME_H)
      }
      if (cancelled) return
      const blob = await new Promise<Blob>((r) => strip.toBlob((b) => r(b!), 'image/webp', 0.88))
      const res = await fetch(`/__bake/${FILE}`, { method: 'POST', body: blob })
      setStatus(res.ok ? `Saved ${FILE}.webp (${Math.round(blob.size / 1024)} KB)` : `Save failed: HTTP ${res.status}`)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="grid h-full place-items-center bg-[#2a3322] text-parchment">
      <div className="flex flex-col items-center gap-3">
        <div style={{ width: FRAME_W, height: FRAME_H, background: 'repeating-conic-gradient(#3a4530 0 25%, #333d2b 0 50%) 0 0/20px 20px' }}>
          <Canvas
            dpr={1}
            gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            camera={{ fov: 23, position: [0, 1.15, 6.4], near: 0.1, far: 30 }}
            frameloop="never"
            onCreated={({ camera, advance: step }) => {
              camera.lookAt(0, 1.05, 0)
              advance.current = (t) => step(t, true)
            }}
          >
            <hemisphereLight args={['#f1f5ff', '#6a5038', 1.1]} />
            <directionalLight position={[-3, 5, 4]} intensity={2.4} color="#fff0d8" />
            <directionalLight position={[3, 2, 5]} intensity={0.6} color="#cfe0ff" />
            <MossModel
              visual="quest_ready"
              level={1}
              health={1}
              reducedMotion={false}
              away={false}
              bake={{ clip: clipName, time: (frame / FRAMES) * CLIP_SECONDS, yaw: YAW }}
            />
          </Canvas>
        </div>
        <div id="bake-status" className="font-display">{status}</div>
      </div>
    </div>
  )
}
