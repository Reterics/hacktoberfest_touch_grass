import { describe, expect, it } from 'vitest'
import type { AIStatus } from '@moss/shared'
import { AIError, type AIProvider } from './provider.ts'
import { fallbackReaction, reactToCompletion, validateEvidence, writeQuestWording } from './moss.ts'
import type { QuestPromptContext } from './prompts.ts'

function mockProvider(response: unknown | (() => unknown)): AIProvider {
  const respond = async () => {
    const value = typeof response === 'function' ? (response as () => unknown)() : response
    return value
  }
  return {
    generateText: async () => 'ready',
    generateStructured: respond,
    analyzeImage: respond,
    checkStatus: async () => ({ state: 'ready' }) as AIStatus,
  }
}

const treeCtx: QuestPromptContext = {
  need: 'energy',
  category: 'nature',
  completionType: 'VISION_VALIDATION',
  visionTarget: 'tree',
  environment: 'park',
  baseTitle: 'Forest Energy',
  baseDescription: 'Find a living tree.',
  level: 1,
  recentQuests: [],
  focusMinutes: 45,
}

describe('writeQuestWording', () => {
  it('accepts and normalises valid wording', async () => {
    const out = await writeQuestWording(
      mockProvider({ title: ' Tree  Time ', description: 'Go find a tree and photograph it.', mossLine: '"I need bark."' }),
      treeCtx,
    )
    expect(out).toEqual({
      ok: true,
      wording: { title: 'Tree Time', description: 'Go find a tree and photograph it.', mossLine: 'I need bark.' },
    })
  })

  it('rejects schema violations', async () => {
    const out = await writeQuestWording(mockProvider({ title: 'x'.repeat(100), description: 'tree', mossLine: 'hi' }), treeCtx)
    expect(out.ok).toBe(false)
  })

  it('rejects wording that drops the vision requirement', async () => {
    const out = await writeQuestWording(
      mockProvider({ title: 'Go Outside', description: 'Find something green.', mossLine: 'Out!' }),
      treeCtx,
    )
    expect(out.ok).toBe(false)
  })

  it('rejects unsafe wording', async () => {
    const out = await writeQuestWording(
      mockProvider({ title: 'Snack', description: 'Find a tree and eat a leaf.', mossLine: 'Yum.' }),
      treeCtx,
    )
    expect(out.ok).toBe(false)
  })

  it('never throws when the provider fails', async () => {
    const out = await writeQuestWording(
      mockProvider(() => {
        throw new AIError('offline')
      }),
      treeCtx,
    )
    expect(out).toEqual({ ok: false, error: 'offline' })
  })
})

describe('validateEvidence', () => {
  it('parses a verdict and normalises percentage confidence', async () => {
    const v = await validateEvidence(
      mockProvider({ success: true, confidence: 94, detected: ['tree'], reason: 'A tree.' }),
      'abc',
      'tree',
    )
    expect(v.confidence).toBeCloseTo(0.94)
  })

  it('throws AIError on garbage so the caller can offer manual completion', async () => {
    await expect(validateEvidence(mockProvider({ verdict: 'yes' }), 'abc', 'tree')).rejects.toBeInstanceOf(AIError)
  })
})

describe('reactToCompletion', () => {
  const ctx = { questTitle: 't', questDescription: 'd', detected: [], xpGained: 40, leveledUp: false, level: 1, manual: false }

  it('falls back on invalid enum values', async () => {
    const r = await reactToCompletion(mockProvider({ dialogue: 'Yay', emotion: 'furious', behavior: 'explode' }), ctx, 1)
    expect(r).toEqual(fallbackReaction(1))
  })

  it('uses valid reactions', async () => {
    const r = await reactToCompletion(mockProvider({ dialogue: 'Bark!', emotion: 'excited', behavior: 'celebrate' }), ctx, 1)
    expect(r.dialogue).toBe('Bark!')
  })
})
