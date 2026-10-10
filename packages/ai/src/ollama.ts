import type { AIStatus } from '@moss/shared'
import { AIError, type AIProvider, type GenerateTextRequest, type ImageAnalysisRequest, type StructuredRequest } from './provider.ts'

export interface OllamaConfig {
  host: string
  textModel: string
  visionModel: string
  /** How long Ollama keeps the model loaded between calls. */
  keepAlive?: string
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
  images?: string[]
}

const DEFAULT_TIMEOUT_MS = 60_000

export class OllamaProvider implements AIProvider {
  constructor(private readonly config: OllamaConfig) {}

  async generateText(request: GenerateTextRequest): Promise<string> {
    return this.chat(this.config.textModel, this.messages(request), request)
  }

  async generateStructured(request: StructuredRequest): Promise<unknown> {
    const content = await this.chat(this.config.textModel, this.messages(request), request, request.jsonSchema)
    return parseJson(content)
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<unknown> {
    const content = await this.chat(
      this.config.visionModel,
      this.messages(request, [request.imageBase64]),
      request,
      request.jsonSchema,
    )
    return parseJson(content)
  }

  async checkStatus(): Promise<AIStatus> {
    const base = {
      host: this.config.host,
      textModel: this.config.textModel,
      visionModel: this.config.visionModel,
    }
    let names: string[]
    try {
      const res = await fetch(`${this.config.host}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { models?: { name: string }[] }
      names = (body.models ?? []).map((m) => m.name)
    } catch {
      return {
        ...base,
        state: 'ollama_offline',
        message: `Ollama isn't reachable at ${this.config.host}. Install it from ollama.com and make sure it's running.`,
        fixCommand: 'ollama serve',
      }
    }

    for (const model of new Set([this.config.textModel, this.config.visionModel])) {
      if (!names.some((n) => sameModel(n, model))) {
        return {
          ...base,
          state: 'model_missing',
          message: `The model ${model} isn't downloaded yet.`,
          fixCommand: `ollama pull ${model}`,
        }
      }
    }

    try {
      const res = await fetch(`${this.config.host}/api/show`, {
        method: 'POST',
        body: JSON.stringify({ model: this.config.visionModel }),
        signal: AbortSignal.timeout(5000),
      })
      const body = (await res.json()) as { capabilities?: string[] }
      // Older Ollama versions don't report capabilities; assume vision works and let inference decide.
      if (body.capabilities && !body.capabilities.includes('vision')) {
        return {
          ...base,
          state: 'no_vision',
          message: `${this.config.visionModel} can't read images. Photo quests will use manual completion.`,
          fixCommand: 'ollama pull gemma3:4b',
        }
      }
    } catch {
      // Non-fatal: capability detection is best effort.
    }

    return { ...base, state: 'ready', message: `Gemma is awake (${this.config.textModel}).` }
  }

  private messages(request: GenerateTextRequest, images?: string[]): ChatMessage[] {
    const messages: ChatMessage[] = []
    if (request.system) messages.push({ role: 'system', content: request.system })
    messages.push({ role: 'user', content: request.prompt, ...(images ? { images } : {}) })
    return messages
  }

  private async chat(
    model: string,
    messages: ChatMessage[],
    request: GenerateTextRequest,
    format?: Record<string, unknown>,
  ): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${this.config.host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format,
          keep_alive: this.config.keepAlive ?? '30m',
          options: { temperature: request.temperature ?? 0.8 },
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      })
    } catch (err) {
      const name = (err as Error).name
      throw new AIError(name === 'TimeoutError' ? 'The model took too long to answer' : 'Ollama is not reachable')
    }
    if (!res.ok) throw new AIError(`Ollama returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as { message?: { content?: string } }
    const content = body.message?.content
    if (typeof content !== 'string') throw new AIError('Ollama returned an empty response')
    return content
  }
}

function sameModel(installed: string, wanted: string): boolean {
  const norm = (n: string) => (n.includes(':') ? n : `${n}:latest`)
  return norm(installed) === norm(wanted)
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    // Some models wrap JSON in prose or code fences; take the outermost object.
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        // fall through
      }
    }
    throw new AIError('The model did not return valid JSON')
  }
}
