// Records the in-app demo (/?demo=1) as silent 1080p video for the demo-video edit.
//
//   node visuals/demo/video/record.mjs [out.mp4]
//
// Runs a headless Chrome at 1920x1080, presses Play through the DevTools protocol (no mouse ever reaches the
// canvas, so the camera stays centred) and streams compositor frames with Page.startScreencast. Nothing is
// drawn on the real screen, so the machine stays usable while it records. Each frame keeps its own timestamp
// and ffmpeg rebuilds a constant 30 fps video from them, so timing matches the demo's wall clock.
// The soundtrack is rebuilt from the script's timeline in build.sh, so the browser is muted.
// Needs the web dev server on :5173.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const out = resolve(process.argv[2] ?? 'demo-raw.mp4')
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const W = 1920
const H = 1080
// Intro (20 s) + gameplay through the end-card finale (~77 s) + a little tail.
const RECORD_SECONDS = Number(process.env.RECORD_SECONDS ?? 104)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const profile = mkdtempSync(join(tmpdir(), 'moss-rec-'))
const frames = join(profile, 'frames')
mkdirSync(frames)
const chrome = spawn(CHROME, [
  '--headless=new',
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*',
  `--window-size=${W},${H}`,
  '--use-angle=d3d11',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--hide-scrollbars',
  'http://localhost:5173/?demo=1',
])

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = list.find((t) => t.type === 'page' && t.url.includes('demo=1'))
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(500)
  }
  throw new Error('Chrome did not expose the demo page')
}

const ws = new WebSocket(await target())
await new Promise((r, reject) => {
  ws.addEventListener('open', r, { once: true })
  ws.addEventListener('error', (e) => reject(new Error(`DevTools socket: ${e.message ?? 'error'}`)), { once: true })
})
let id = 0
const pending = new Map()
const shots = []
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = msg.params
    const file = join(frames, `${String(shots.length).padStart(6, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    shots.push({ file, t: metadata.timestamp })
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId } }))
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
// Wait for the title card, then let fonts, textures and shaders settle.
for (let i = 0; i < 60 && !(await evaluate(`!!document.querySelector('.z-40 button')`)); i++) await sleep(500)
await sleep(6000)
// No cursor, and no Replay / Open Moss buttons on the final card: this is a video, not the app.
await evaluate(`(() => {
  const s = document.createElement('style')
  s.textContent = '* { cursor: none !important } .z-40 button, .z-40 a.btn-ghost { visibility: hidden !important }'
  document.head.appendChild(s)
  return true
})()`)
console.log('viewport', await evaluate(`[innerWidth, innerHeight, devicePixelRatio].join('x')`))
console.log('gpu', await evaluate(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown' })()`))

await send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
await sleep(1500)
// Play is pressed at a known screencast time; build.sh aligns the soundtrack to this moment.
// The HUD normally fades out over 1 s as the intro starts; hide it at once so the cut from the cinematic
// (which ends on this exact framing without a HUD) is clean. The intro's own opacity-0 class keeps it hidden.
const playAt = await evaluate(`(() => {
  const hud = document.querySelector('#root .transition-opacity.duration-1000')
  if (hud) {
    hud.style.transition = 'none'
    hud.style.opacity = '0'
    setTimeout(() => { hud.style.transition = ''; hud.style.opacity = '' }, 1500)
  }
  document.querySelector('.z-40 button').click()
  return (performance.timeOrigin + performance.now()) / 1000
})()`)
console.log('play pressed')
await sleep(RECORD_SECONDS * 1000)
await send('Page.stopScreencast')
ws.close()
chrome.kill()

// Constant 30 fps from timestamped frames: each frame is held until the next one arrives.
const t0 = shots[0].t
const list = shots.map((s, i) => `file '${s.file.replaceAll('\\', '/')}'\nduration ${((shots[i + 1]?.t ?? s.t + 1 / 30) - s.t).toFixed(5)}`).join('\n')
const listFile = join(profile, 'frames.txt')
writeFileSync(listFile, `${list}\nfile '${shots.at(-1).file.replaceAll('\\', '/')}'\n`)
const span = shots.at(-1).t - t0
console.log(`${shots.length} frames over ${span.toFixed(1)} s (${(shots.length / span).toFixed(1)} fps captured)`)
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', `fps=30,scale=${W}:${H},format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', out], { stdio: 'inherit' })
if (r.status !== 0) throw new Error('ffmpeg failed')
// Play time relative to the first frame, for syncing the soundtrack.
writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify({ playOffset: playAt - t0, frames: shots.length, seconds: span }, null, 2))
console.log('wrote', out, 'play at', (playAt - t0).toFixed(3), 's')
rmSync(profile, { recursive: true, force: true })
