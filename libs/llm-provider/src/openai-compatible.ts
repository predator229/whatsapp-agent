import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './provider'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface OpenAiCompatibleOptions {
  readonly baseUrl: string
  readonly model: string
  readonly apiKey?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: FetchLike
}

const DEFAULT_TIMEOUT_MS = 20_000
const NO_USAGE = { inputTokens: 0, outputTokens: 0 } as const

interface ChatCompletionBody {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * Client `/v1/chat/completions` : couvre Ollama, vLLM, Groq, Mistral et tout serveur
 * compatible OpenAI. Timeout configurable, un seul retry et seulement sur 5xx.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly url: string
  private readonly timeoutMs: number
  private readonly fetchImpl: FetchLike

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? ((u, i) => globalThis.fetch(u, i))
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const response = await this.postWithRetry(this.buildBody(req))
    return this.mapResponse(response)
  }

  private buildBody(req: LlmRequest): Record<string, unknown> {
    return {
      model: this.options.model,
      temperature: 0,
      max_tokens: req.maxTokens,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      ...(req.jsonSchema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'reply', strict: true, schema: req.jsonSchema },
            },
          }
        : {}),
    }
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
    }
  }

  private async postOnce(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(this.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new LlmUnavailableError(
        aborted ? `LLM timeout after ${this.timeoutMs}ms` : `LLM request failed: ${String(error)}`,
        error,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  private async postWithRetry(body: Record<string, unknown>): Promise<Response> {
    const first = await this.postOnce(body)
    if (first.status < 500) return first
    const second = await this.postOnce(body)
    if (second.status < 500) return second
    throw new LlmUnavailableError(`LLM server error ${second.status} after 1 retry`)
  }

  private async mapResponse(response: Response): Promise<LlmResponse> {
    if (!response.ok) {
      throw new LlmUnavailableError(`LLM request rejected with status ${response.status}`)
    }
    const body = (await response.json().catch((error: unknown) => {
      throw new LlmUnavailableError('LLM response is not valid JSON', error)
    })) as ChatCompletionBody
    const text = body.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new LlmUnavailableError('LLM response contains no message content')
    }
    return {
      text,
      usage: body.usage
        ? {
            inputTokens: body.usage.prompt_tokens ?? 0,
            outputTokens: body.usage.completion_tokens ?? 0,
          }
        : NO_USAGE,
    }
  }
}
