import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..')

export const config = {
  port: Number(process.env.MOSS_PORT ?? 3000),
  /** Optional override for the host shown in the phone QR code. */
  publicHost: process.env.MOSS_PUBLIC_HOST || undefined,
  dataDir: resolve(repoRoot, process.env.MOSS_DATA_DIR ?? 'data'),
  webDist: resolve(repoRoot, 'apps/web/dist'),
  ollama: {
    host: (process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, ''),
    textModel: process.env.OLLAMA_TEXT_MODEL ?? 'gemma3:4b',
    visionModel: process.env.OLLAMA_VISION_MODEL ?? 'gemma3:4b',
  },
  /** Phone pairing tokens are valid for one working day. */
  pairingTtlMs: 12 * 60 * 60 * 1000,
  maxUploadBytes: 10 * 1024 * 1024,
}
