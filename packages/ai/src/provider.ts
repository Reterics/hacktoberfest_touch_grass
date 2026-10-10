import type { AIStatus } from '@moss/shared'

export interface GenerateTextRequest {
  system?: string
  prompt: string
  temperature?: number
  timeoutMs?: number
}

export interface StructuredRequest extends GenerateTextRequest {
  /** JSON schema describing the expected response. */
  jsonSchema: Record<string, unknown>
}

export interface ImageAnalysisRequest extends StructuredRequest {
  /** Base64-encoded image (no data: prefix). */
  imageBase64: string
}

/**
 * Model provider abstraction. Gemma via Ollama is the default implementation,
 * but nothing outside this package should depend on Ollama specifics.
 *
 * Structured methods return parsed JSON as `unknown`: callers must validate before use.
 */
export interface AIProvider {
  generateText(request: GenerateTextRequest): Promise<string>
  generateStructured(request: StructuredRequest): Promise<unknown>
  analyzeImage(request: ImageAnalysisRequest): Promise<unknown>
  checkStatus(): Promise<AIStatus>
}

export class AIError extends Error {}
