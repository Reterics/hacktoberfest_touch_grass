/**
 * Runs the demo's tree photo through the real local vision check and records the verdict, so the
 * scripted demo (apps/web/?demo=1) replays what Gemma actually said instead of a made-up answer.
 *
 * usage: pnpm --filter @moss/server exec tsx scripts/verify-demo-photo.ts <photo.jpg|png>
 * Ollama must be running with the vision model pulled. Writes apps/web/src/demo/gemma-verdict.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OllamaProvider, validateEvidence } from '@moss/ai'
import { verdictPasses } from '@moss/game-engine'
import { config } from '../src/config.ts'

const photo = process.argv[2]
if (!photo) {
  console.error('usage: tsx scripts/verify-demo-photo.ts <photo>')
  process.exit(1)
}

const provider = new OllamaProvider(config.ollama)
const started = Date.now()
const verdict = await validateEvidence(provider, readFileSync(photo).toString('base64'), 'tree')
const record = {
  target: 'tree',
  model: config.ollama.visionModel,
  checkedAt: new Date().toISOString(),
  latencyMs: Date.now() - started,
  passes: verdictPasses(verdict),
  verdict,
}
const out = resolve(import.meta.dirname, '../../web/src/demo/gemma-verdict.json')
writeFileSync(out, JSON.stringify(record, null, 2) + '\n')
console.log(record)
