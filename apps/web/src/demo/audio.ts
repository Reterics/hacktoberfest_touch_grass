/**
 * Demo sound: Moss's voice, narration, SFX and a music bed. Generated at design time with ElevenLabs
 * and served as local files, so the demo still runs offline.
 */
export const DEMO_CLIPS = [
  'moss-staring',
  'moss-find-tree',
  'moss-acceptable-tree',
  'moss-back-to-work',
  'narrator-intro',
  'narrator-open-innovation',
  'sfx-pop',
  'sfx-shutter',
  'sfx-success',
  'sfx-frond-spring',
  'sfx-leaf-gust',
  'music-bed',
] as const
export type DemoClip = (typeof DEMO_CLIPS)[number]

const VOLUME: Partial<Record<DemoClip, number>> = {
  'sfx-pop': 0.7,
  'sfx-shutter': 0.9,
  'sfx-success': 0.6,
  'sfx-frond-spring': 0.55,
  'sfx-leaf-gust': 0.6,
}
const MUSIC = 0.32
const MUSIC_DUCKED = 0.12

export class DemoAudio {
  private readonly clips = new Map<DemoClip, HTMLAudioElement>()
  private fade: ReturnType<typeof setInterval> | null = null

  constructor() {
    for (const name of DEMO_CLIPS) {
      const el = new Audio(`/assets/demo/audio/${name}.mp3`)
      el.preload = 'auto'
      el.volume = VOLUME[name] ?? 1
      this.clips.set(name, el)
    }
  }

  play(name: DemoClip): void {
    const el = this.clips.get(name)!
    el.currentTime = 0
    // A blocked or missing clip must never stop the demo.
    void el.play().catch(() => {})
  }

  startMusic(): void {
    const music = this.clips.get('music-bed')!
    music.volume = MUSIC
    this.play('music-bed')
  }

  /** Lowers the music under the narrator, or fades it out entirely. */
  music(to: 'duck' | 'out', seconds = 1.2): void {
    const music = this.clips.get('music-bed')!
    const target = to === 'duck' ? MUSIC_DUCKED : 0
    const from = music.volume
    const steps = Math.max(1, Math.round(seconds * 20))
    let i = 0
    if (this.fade) clearInterval(this.fade)
    this.fade = setInterval(() => {
      i += 1
      music.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)))
      if (i >= steps) {
        clearInterval(this.fade!)
        this.fade = null
        if (target === 0) music.pause()
      }
    }, 50)
  }

  stopAll(): void {
    if (this.fade) clearInterval(this.fade)
    this.fade = null
    for (const el of this.clips.values()) {
      el.pause()
      el.currentTime = 0
    }
  }
}
