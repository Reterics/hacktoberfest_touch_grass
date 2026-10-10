import { existsSync } from 'node:fs'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { EngineError } from '@moss/game-engine'
import { OllamaProvider } from '@moss/ai'
import { config } from './config.ts'
import { MossDb } from './db.ts'
import { GameService } from './game-service.ts'
import { sniffImage } from './image.ts'
import { clientAddress, detectLanAddress, isThisMachine } from './network.ts'
import { Pairing } from './pairing.ts'

// Fastify logs warnings and errors only; per-request logs are noise for a local app.
const app = Fastify({ logger: { level: 'warn' } })
const log = {
  info: (m: string) => console.log(`[moss] ${m}`),
  warn: (m: string) => console.warn(`[moss] ${m}`),
}
const db = new MossDb(config.dataDir)
const provider = new OllamaProvider(config.ollama)
const game = new GameService(db, provider, log)
const pairing = new Pairing(config.pairingTtlMs)
const lanHost = detectLanAddress(config.publicHost)

await app.register(websocket)
await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 4 } })

// ---- access control ---------------------------------------------------------

function ipOf(req: FastifyRequest): string | undefined {
  return clientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'])
}

function tokenOf(req: FastifyRequest): string | undefined {
  const header = req.headers['x-moss-token']
  if (typeof header === 'string') return header
  const q = (req.query as Record<string, unknown> | undefined)?.token
  return typeof q === 'string' ? q : undefined
}

/** Desktop controls only work from the laptop itself, so nobody else on the Wi-Fi can drive the timer. */
async function desktopOnly(req: FastifyRequest, reply: FastifyReply) {
  if (!isThisMachine(ipOf(req))) return reply.code(403).send({ error: 'Desktop controls are only available on this computer' })
}

/** Companion routes accept the laptop itself or a phone holding a valid pairing token. */
async function companionOrDesktop(req: FastifyRequest, reply: FastifyReply) {
  if (isThisMachine(ipOf(req)) || pairing.isValid(tokenOf(req))) return
  return reply.code(401).send({ error: 'Scan the QR code on your laptop to pair this phone' })
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof EngineError) return reply.code(409).send({ error: err.message })
  const status = (err as { statusCode?: number }).statusCode
  if (status && status < 500) return reply.code(status).send({ error: (err as Error).message })
  app.log.error(err)
  return reply.code(500).send({ error: 'Something went wrong' })
})

// ---- routes -----------------------------------------------------------------

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/state', { preHandler: companionOrDesktop }, async () => game.snapshot())

app.get('/api/pairing', { preHandler: desktopOnly }, async (req) => {
  // The web UI tells us which port it is served from (Vite in dev, this server in production).
  const port = Number((req.query as { port?: string }).port) || config.port
  return pairing.info(`http://${lanHost}:${port}`)
})

app.post('/api/timer/start', { preHandler: desktopOnly }, async () => (game.startFocus(), { ok: true }))
app.post('/api/timer/pause', { preHandler: desktopOnly }, async () => (game.pause(), { ok: true }))
app.post('/api/timer/resume', { preHandler: desktopOnly }, async () => (game.resume(), { ok: true }))
app.post('/api/timer/stop', { preHandler: desktopOnly }, async () => (game.stop(), { ok: true }))
app.post('/api/timer/skip-break', { preHandler: desktopOnly }, async () => (game.skipBreak(), { ok: true }))
app.post<{ Body: { minutes?: number } }>('/api/timer/extend', { preHandler: desktopOnly }, async (req) => {
  game.extend(Number(req.body?.minutes ?? 5))
  return { ok: true }
})
app.post<{ Body: { presetId?: string } }>('/api/settings/preset', { preHandler: desktopOnly }, async (req) => {
  game.setPreset(String(req.body?.presetId ?? ''))
  return { ok: true }
})

app.post<{ Body: { questId?: string } }>('/api/quest/start-timer', { preHandler: companionOrDesktop }, async (req) => {
  game.startQuestTimer(req.body?.questId)
  return { ok: true }
})
app.post<{ Body: { questId?: string; manual?: boolean } }>('/api/quest/complete', { preHandler: companionOrDesktop }, async (req) => {
  game.completeQuest({ manual: !!req.body?.manual, questId: req.body?.questId })
  return { ok: true }
})
app.post('/api/quest/photo', { preHandler: companionOrDesktop }, async (req, reply) => {
  let image: Buffer
  let questId: string | undefined
  try {
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: 'No photo received' })
    image = await file.toBuffer()
    questId = (file.fields.questId as { value?: string } | undefined)?.value
  } catch (err) {
    const tooLarge = (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
    return reply.code(tooLarge ? 413 : 400).send({ error: tooLarge ? 'That photo is too large' : 'The upload was incomplete' })
  }
  if (!sniffImage(image)) return reply.code(415).send({ error: 'Please send a JPEG, PNG or WebP photo' })
  // Photos are only held in memory for validation and never written to disk.
  return game.submitPhoto(image, questId)
})

app.get('/ws', { websocket: true, preHandler: companionOrDesktop }, (socket, req) => {
  const isPhone = !isThisMachine(ipOf(req))
  if (isPhone) game.setPhoneConnected(1)
  const unsubscribe = game.subscribe((message) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
  })
  const ping = setInterval(() => socket.ping(), 25_000)
  socket.on('close', () => {
    clearInterval(ping)
    unsubscribe()
    if (isPhone) game.setPhoneConnected(-1)
  })
})

// Production: serve the built web app (desktop at /, phone at /companion).
if (existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist, wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api') || req.raw.url?.startsWith('/ws')) return reply.code(404).send({ error: 'Not found' })
    return reply.sendFile('index.html')
  })
}

game.start()

const shutdown = async () => {
  game.shutdown()
  await app.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Bind to all interfaces so the phone can reach Moss over Wi-Fi. Ollama itself stays on localhost.
await app.listen({ host: '0.0.0.0', port: config.port })
log.info(`Moss is awake: http://localhost:${config.port}  (LAN: http://${lanHost}:${config.port})`)
