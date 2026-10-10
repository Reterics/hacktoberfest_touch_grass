import { z } from 'zod'
import { AIError, type AIProvider } from './provider.ts'
import {
  MOSS_SYSTEM_PROMPT,
  QUEST_JSON_SCHEMA,
  REACTION_JSON_SCHEMA,
  VISION_JSON_SCHEMA,
  questPrompt,
  reactionPrompt,
  visionPrompt,
  type QuestPromptContext,
  type ReactionPromptContext,
} from './prompts.ts'

// Every AI output is validated here before it can reach game state.

const oneLine = (max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/[*_`#]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim(),
    )
    .pipe(z.string().min(2).max(max))

export const questWordingSchema = z.object({
  title: oneLine(40),
  description: oneLine(220),
  mossLine: oneLine(140),
})
export type QuestWording = z.infer<typeof questWordingSchema>

export const visionResultSchema = z.object({
  success: z.boolean(),
  confidence: z.coerce.number().transform((n) => (n > 1 && n <= 100 ? n / 100 : n)).pipe(z.number().min(0).max(1)),
  detected: z.array(z.string().max(60)).max(20).default([]),
  reason: oneLine(240),
})
export type VisionResult = z.infer<typeof visionResultSchema>

export const reactionSchema = z.object({
  dialogue: oneLine(160),
  emotion: z.enum(['happy', 'excited', 'curious']),
  behavior: z.enum(['celebrate', 'absorb', 'wiggle']),
})
export type Reaction = z.infer<typeof reactionSchema>

/** Words that must never appear in quest wording, whatever the model says. */
const BANNED = /\b(eat|taste|lick|swallow|medic|diagnos|cure|poison)\w*/i

export type WordingOutcome = { ok: true; wording: QuestWording } | { ok: false; error: string }

/**
 * Asks the model to phrase a quest. Returns `ok: false` on any failure so the caller keeps the
 * deterministic fallback wording.
 */
export async function writeQuestWording(provider: AIProvider, ctx: QuestPromptContext): Promise<WordingOutcome> {
  try {
    const raw = await provider.generateStructured({
      system: MOSS_SYSTEM_PROMPT,
      prompt: questPrompt(ctx),
      jsonSchema: QUEST_JSON_SCHEMA,
      temperature: 0.9,
      timeoutMs: 45_000,
    })
    const parsed = questWordingSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: `Invalid quest wording: ${parsed.error.issues[0]?.message}` }
    const all = `${parsed.data.title} ${parsed.data.description} ${parsed.data.mossLine}`
    if (BANNED.test(all)) return { ok: false, error: 'Quest wording failed the safety filter' }
    // Vision quests must still mention what will be checked, or the user can't succeed.
    if (ctx.visionTarget && !mentionsTarget(parsed.data.description, ctx.visionTarget)) {
      return { ok: false, error: `Quest wording dropped the requirement "${ctx.visionTarget}"` }
    }
    return { ok: true, wording: parsed.data }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

function mentionsTarget(text: string, target: string): boolean {
  const lower = text.toLowerCase()
  const keyword = target === 'yellow object' ? 'yellow' : target
  return lower.includes(keyword)
}

/**
 * Checks a photo against a quest requirement. Throws AIError on technical failure so the caller
 * can offer retry / manual completion. The returned verdict is advisory: the game engine decides.
 */
export async function validateEvidence(provider: AIProvider, imageBase64: string, target: string): Promise<VisionResult> {
  const raw = await provider.analyzeImage({
    prompt: visionPrompt(target),
    imageBase64,
    jsonSchema: VISION_JSON_SCHEMA,
    temperature: 0,
    timeoutMs: 90_000,
  })
  const parsed = visionResultSchema.safeParse(raw)
  if (!parsed.success) throw new AIError('The model returned an unreadable verdict')
  return parsed.data
}

const FALLBACK_REACTIONS: Reaction[] = [
  { dialogue: 'Finally. Chlorophyll.', emotion: 'happy', behavior: 'absorb' },
  { dialogue: 'Perfect. I needed that.', emotion: 'happy', behavior: 'wiggle' },
  { dialogue: 'Now THAT is outside. I can feel it in my leaves.', emotion: 'excited', behavior: 'celebrate' },
  { dialogue: 'The world exists. Good to confirm.', emotion: 'curious', behavior: 'wiggle' },
]

export function fallbackReaction(seed: number): Reaction {
  return FALLBACK_REACTIONS[Math.abs(seed) % FALLBACK_REACTIONS.length]!
}

/** A short in-character reaction to a completed quest, with a deterministic fallback. */
export async function reactToCompletion(provider: AIProvider, ctx: ReactionPromptContext, seed: number): Promise<Reaction> {
  try {
    const raw = await provider.generateStructured({
      system: MOSS_SYSTEM_PROMPT,
      prompt: reactionPrompt(ctx),
      jsonSchema: REACTION_JSON_SCHEMA,
      temperature: 0.9,
      timeoutMs: 20_000,
    })
    const parsed = reactionSchema.safeParse(raw)
    if (parsed.success && !BANNED.test(parsed.data.dialogue)) return parsed.data
  } catch {
    // fall through to the deterministic line
  }
  return fallbackReaction(seed)
}

/** Loads the model into memory so the first real request isn't slow. */
export async function warmUp(provider: AIProvider): Promise<void> {
  await provider.generateText({ prompt: 'Reply with the single word: ready', temperature: 0, timeoutMs: 120_000 })
}
