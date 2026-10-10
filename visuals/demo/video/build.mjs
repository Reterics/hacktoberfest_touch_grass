// Assembles the finished demo video from the recorded in-app demo and the Higgsfield / ElevenLabs shots.
//
//   node visuals/demo/video/record.mjs visuals/demo/video/build/demo-raw.mp4   # once, ~2 min, headless
//   node visuals/demo/video/build.mjs                                          # -> build/moss-demo.mp4
//
// Edit (output order):
//   1. Cinematic: forest painting -> desk painting -> the game's own opening frame (visuals/demo/cinematic)
//   2. The real in-app demo (/?demo=1), from Play until Moss hands over the phone quest
//   3. Real world: a POV shot of a phone photographing the tree, cut on its shutter flash...
//   4. ...straight into the in-game shutter flash; the rest of the demo until the open-innovation card
//   4b. The open-innovation card, rebuilt (endcard.html) over a living, looping animation of its painting
//   5. Outro: Moss and his human walk out the door and sit under a tree (visuals/demo/user_generated),
//      then the end slate over the original forest painting (the title-card art), gently animated
//
// The browser is muted while recording; the soundtrack is rebuilt here from the same timeline as
// apps/web/src/demo/useDemoGame.ts, using the shipped clips plus the new ElevenLabs cues.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const clips = join(repo, 'apps/web/public/assets/demo/audio')
const p = (...parts) => join(here, ...parts)
const out = p('build/moss-demo.mp4')

const raw = JSON.parse(readFileSync(p('build/demo-raw.json'), 'utf8'))
const verdict = JSON.parse(readFileSync(join(repo, 'apps/web/src/demo/gemma-verdict.json'), 'utf8'))
const probe = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString())

// ---- the demo's own timeline (seconds after Play), mirrored from useDemoGame.ts -----------------------
const INTRO = 0.4 + 18.6 + 1
const g = (s) => INTRO + s
const CHECK = Math.min(2.5, Math.max(1.2, verdict.latencyMs / 1000))
const NARRATOR_AT = g(43.3)
const FINALE = g(43.3 + 29.3 + 0.6)
/** React + rendering put each scripted event on screen this much after its timer fires (measured). */
const LAG = 0.07

// ---- video segments ------------------------------------------------------------------------------------
const P = raw.playOffset
const CINEMATIC = p('../cinematic/cinematic-a.mp4')
const CUTAWAY = p('shots/cutaway-a.mp4')
// The first seconds of the intro cinematic are the canonical forest painting with leaves falling.
const FOREST = p('../cinematic/intro-a.mp4')
const WALK = ['0', '1', '2', '3'].map((n) => p(`../user_generated/${n}.mp4`))
/** Leave the game as the phone quest appears; the cutaway ends on the real phone's shutter flash. */
const LEAVE = g(17.2)
const CUTAWAY_LEN = 4.7
/** The in-game shutter flash (scripted at g(21)), measured in the recording. */
const RETURN_RAW = Number(process.env.FLASH_RAW ?? P + g(21) + LAG)
/**
 * The in-app card starts fading in at g(42). The rebuilt living card dissolves in over the second before
 * that, so the recording's own card never shows.
 */
const CARD_RAW = P + g(42) + LAG
const CARD_FADE = 1.0
/** From the start of the dissolve until a few seconds after the credits line appears. */
const CARD_LEN = CARD_FADE + FINALE + 3 - g(42)
/** Card-relative time of a demo moment. */
const onCard = (d) => CARD_FADE + d - g(42)
/** Seamless loops (start and end frame are the card's painting), chained to cover the card. */
const CARD_LOOPS = ['a', 'b', 'a'].map((x) => p(`shots/endcard-loop-${x}.mp4`))
/** NARRATION[].at from apps/web/src/demo/script.ts: when each end-card line is revealed. */
const NARRATION_AT = [0, 6.2, 9.8, 13.7, 18.3, 24.4]
const layer = (name) => p(`build/endcard/${name}.png`)
const CARD_LAYERS = [
  { file: layer('gradient'), at: 0 },
  { file: layer('kicker'), at: 0 },
  ...NARRATION_AT.map((at, i) => ({ file: layer(`l${i}`), at: onCard(NARRATOR_AT + at), fade: 0.7 })),
  { file: layer('credits'), at: onCard(FINALE), fade: 0.7 },
]
const OUTRO_HOLD = 4
/** Before the camera starts to move; played at half speed under the slate. */
const FOREST_LEN = 2.6
const FOREST_SPEED = 0.5
const SLATE_AT = 1.0

const segs = [
  { file: CINEMATIC, from: 0, len: probe(CINEMATIC), fade: 0.5 },
  { file: p('build/demo-raw.mp4'), from: P, len: LEAVE, fade: 0.15 },
  { file: CUTAWAY, from: 0, len: CUTAWAY_LEN, fade: 0.04 },
  { file: p('build/demo-raw.mp4'), from: RETURN_RAW, len: CARD_RAW - RETURN_RAW, fade: CARD_FADE },
  { files: CARD_LOOPS, from: 0, len: CARD_LEN, fade: 1.0, overlays: CARD_LAYERS },
  // The walk outside is cut as one sequence; the last shot dissolves into the slate.
  ...WALK.map((file, i) => ({ file, from: 0, len: probe(file), fade: i === WALK.length - 1 ? 1.0 : 0.04, audio: true })),
  { file: FOREST, from: 0, len: FOREST_LEN, speed: FOREST_SPEED, hold: OUTRO_HOLD, overlays: [{ file: p('build/slate.png'), at: SLATE_AT, fade: 1.2 }] },
]
// Output start of each segment (each transition overlaps the previous segment's tail).
let t = 0
for (const s of segs) {
  // Output duration of the segment's footage (before any freeze-frame hold).
  s.dur = s.len / (s.speed ?? 1)
  s.at = t
  t += s.dur + (s.hold ?? 0) - (s.fade ?? 0)
}
const TOTAL = segs.at(-1).at + segs.at(-1).dur + OUTRO_HOLD
const [CIN, DEMO_A, CUT, DEMO_B, CARD, OUT] = segs
const SITTING = segs.at(-2)
/** Demo time -> output time, on whichever side of the cutaway it falls. */
const demo = (d) => (d < LEAVE ? DEMO_A.at + d + LAG : DEMO_B.at + (P + d + LAG - RETURN_RAW))

// ---- soundtrack ----------------------------------------------------------------------------------------
const events = [
  // Cinematic: a quiet opening cue, a leaf on the wind, the outdoors fading as we enter the room.
  { file: p('audio/music-intro.mp3'), at: 0, lufs: -20, fadeOut: [CIN.len - 2.2, 2.2] },
  { file: p('audio/park-ambience.mp3'), at: 0, lufs: -33, loop: CIN.len, lowpass: 5000, fadeIn: 1.5, fadeOut: [CIN.len - 4, 3.5] },
  { file: p('audio/leaf-flutter.mp3'), at: 1.6, lufs: -27 },
  { file: p('audio/leaf-flutter.mp3'), at: 5.4, lufs: -30 },
  // The in-app demo.
  { file: join(clips, 'narrator-intro.mp3'), at: demo(0.4) },
  { file: join(clips, 'sfx-pop.mp3'), at: demo(g(7)), gain: 0.7 },
  { file: join(clips, 'moss-staring.mp3'), at: demo(g(7.5)) },
  { file: join(clips, 'moss-find-tree.mp3'), at: demo(g(11.6)) },
  // Real world: park sound under the cutaway, music pulled back.
  { file: p('audio/park-ambience.mp3'), at: CUT.at - 0.15, lufs: -27, fadeIn: 0.3, fadeOut: [CUTAWAY_LEN - 0.3, 0.45] },
  { file: join(clips, 'sfx-shutter.mp3'), at: demo(g(21)), gain: 0.9 },
  { file: join(clips, 'sfx-success.mp3'), at: demo(g(21.25 + CHECK)), gain: 0.6 },
  { file: join(clips, 'sfx-frond-spring.mp3'), at: demo(g(26.9)), gain: 0.55 },
  { file: join(clips, 'sfx-leaf-gust.mp3'), at: demo(g(27.6)), gain: 0.6 },
  { file: join(clips, 'moss-acceptable-tree.mp3'), at: demo(g(30)) },
  { file: join(clips, 'moss-back-to-work.mp3'), at: demo(g(37.2)) },
  { file: join(clips, 'narrator-open-innovation.mp3'), at: demo(NARRATOR_AT) },
  // Outro: out the door and under a tree, with one last deadpan line on the close-up of his fronds.
  // The music enters under the held end card, where the music bed reaches its own ending.
  { file: p('audio/music-outro-long.mp3'), at: OUT.at - 2.6, lufs: -21, fadeIn: 1.5, fadeOut: [TOTAL - (OUT.at - 2.6) - 3, 3] },
  ...segs.filter((s) => s.audio).map((s) => ({ file: s.file, at: s.at, lufs: -31, fadeIn: 0.15, fadeOut: [s.len - 0.2, 0.2] })),
  { file: p('audio/moss-outside-acceptable.mp3'), at: SITTING.at + 1.6, lufs: -19.5 },
]

// The music bed runs continuously from "So we built Moss", ducked for the real-world cutaway and under
// the end-card narrator, then faded before the outro takes over.
const BED_AT = demo(0.4 + 16.2)
const bedEnv = [
  [0, 0.32],
  [CUT.at - 0.2 - BED_AT, 0.32],
  [CUT.at + 0.3 - BED_AT, 0.13],
  [DEMO_B.at - 0.2 - BED_AT, 0.13],
  [DEMO_B.at + 0.8 - BED_AT, 0.32],
  [demo(g(42)) - BED_AT, 0.32],
  [demo(g(42)) + 1.25 - BED_AT, 0.12],
  [demo(FINALE) - 0.8 - BED_AT, 0.12],
  // The narrator has finished: let the music breathe over the held card, then hand over to the outro.
  [demo(FINALE) + 0.4 - BED_AT, 0.3],
  [OUT.at - 0.4 - BED_AT, 0.3],
  [OUT.at + 0.6 - BED_AT, 0],
]
const envExpr = (pts) => {
  let e = `${pts.at(-1)[1]}`
  for (let i = pts.length - 2; i >= 0; i--) {
    const [t0, v0] = pts[i]
    const [t1, v1] = pts[i + 1]
    const seg = t1 > t0 ? `${v0}+(${v1}-${v0})*(t-${t0.toFixed(3)})/${(t1 - t0).toFixed(3)}` : `${v1}`
    e = `if(lt(t,${t1.toFixed(3)}),${seg},${e})`
  }
  return `if(lt(t,${pts[0][0]}),${pts[0][1]},${e})`
}
events.push({ file: join(clips, 'music-bed.mp3'), at: BED_AT, volumeExpr: envExpr(bedEnv) })

// ---- ffmpeg graph --------------------------------------------------------------------------------------
const args = ['-y']
const graph = []
const NORM = 'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,fps=30,format=yuv420p,setsar=1'

let input = 0
segs.forEach((s, i) => {
  const hold = s.hold ? `,tpad=stop_mode=clone:stop_duration=${s.hold}` : ''
  const speed = s.speed ? `,setpts=PTS/${s.speed}` : ''
  let src
  if (s.files) {
    // Chained loops: normalise each, join, then cut to length.
    const parts = s.files.map((f, k) => {
      args.push('-i', f)
      graph.push(`[${input++}:v]${NORM}[c${i}_${k}]`)
      return `[c${i}_${k}]`
    })
    graph.push(`${parts.join('')}concat=n=${parts.length}:v=1:a=0[c${i}]`)
    src = `c${i}`
  } else {
    args.push('-i', s.file)
    src = `${input++}:v`
  }
  graph.push(`[${src}]trim=start=${s.from.toFixed(3)}:duration=${s.len.toFixed(3)},setpts=PTS-STARTPTS${speed},${NORM}${hold}[v${i}]`)
  // Timed transparent layers (end-card lines, the slate), each fading in at its moment.
  let base = `v${i}`
  ;(s.overlays ?? []).forEach((o, k) => {
    args.push('-loop', '1', '-t', (s.dur + (s.hold ?? 0)).toFixed(3), '-i', o.file)
    const fade = o.fade ? `,fade=in:st=${o.at.toFixed(3)}:d=${o.fade}:alpha=1` : ''
    graph.push(`[${input++}:v]format=rgba${fade}[o${i}_${k}]`)
    graph.push(`[${base}][o${i}_${k}]overlay=0:0:shortest=1[v${i}o${k}]`)
    base = `v${i}o${k}`
  })
  s.label = base
})
let prev = segs[0].label
for (let i = 1; i < segs.length; i++) {
  const s = segs[i - 1]
  const cur = segs[i].label
  const offset = s.at + s.dur + (s.hold ?? 0) - s.fade
  graph.push(`[${prev}][${cur}]xfade=transition=fade:duration=${s.fade}:offset=${offset.toFixed(3)}[x${i}]`)
  prev = `x${i}`
}
graph.push(`[${prev}]fade=t=out:st=${(TOTAL - 1.4).toFixed(3)}:d=1.4,format=yuv420p[vout]`)

const labels = []
events.forEach((e, i) => {
  const idx = input++
  if (e.loop) args.push('-stream_loop', '-1')
  args.push('-i', e.file)
  const f = [`aformat=sample_rates=48000:channel_layouts=stereo`]
  if (e.loop) f.push(`atrim=duration=${e.loop.toFixed(3)}`)
  if (e.lowpass) f.push(`lowpass=f=${e.lowpass}`)
  if (e.lufs) f.push(`loudnorm=I=${e.lufs}:TP=-2:LRA=11`, 'aresample=48000')
  if (e.gain) f.push(`volume=${e.gain}`)
  if (e.volumeExpr) f.push(`volume='${e.volumeExpr}':eval=frame`)
  if (e.fadeIn) f.push(`afade=t=in:d=${e.fadeIn}`)
  if (e.fadeOut) f.push(`afade=t=out:st=${Math.max(0, e.fadeOut[0]).toFixed(3)}:d=${e.fadeOut[1]}`)
  const ms = Math.max(0, Math.round(e.at * 1000))
  f.push(`adelay=${ms}|${ms}`)
  graph.push(`[${idx}:a]${f.join(',')}[a${i}]`)
  labels.push(`[a${i}]`)
})
graph.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,atrim=duration=${TOTAL.toFixed(3)},alimiter=limit=0.89,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,afade=t=out:st=${(TOTAL - 1.4).toFixed(3)}:d=1.4[aout]`)

for (const f of [...segs.flatMap((s) => [...(s.files ?? [s.file]), ...(s.overlays ?? []).map((o) => o.file)]), ...events.map((e) => e.file)]) {
  if (!existsSync(f)) throw new Error(`missing ${f}`)
}
console.log(segs.map((s, i) => `seg ${i}: at ${s.at.toFixed(2)}s, ${s.dur.toFixed(2)}s from ${s.from.toFixed(2)}s`).join('\n'))
console.log(`total ${TOTAL.toFixed(2)} s`)
args.push('-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-t', TOTAL.toFixed(3), out)
const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-stats', ...args], { stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status ?? 1)
console.log('wrote', out)
