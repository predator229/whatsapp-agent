import { describe, expect, it, vi } from 'vitest'
import { LlmUnavailableError } from './provider'
import { OpenAiCompatibleProvider, type FetchLike } from './openai-compatible'

const req = {
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'salut' }],
  maxTokens: 120,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const okBody = {
  choices: [{ message: { content: 'bonsoir' } }],
  usage: { prompt_tokens: 42, completion_tokens: 7 },
}

describe('OpenAiCompatibleProvider', () => {
  it('posts to /v1/chat/completions and maps the reply', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5:14b-instruct-q4_K_M',
      fetchImpl,
    })

    const res = await provider.complete(req)

    expect(res).toEqual({ text: 'bonsoir', usage: { inputTokens: 42, outputTokens: 7 } })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(init!.body as string)
    expect(body.model).toBe('qwen2.5:14b-instruct-q4_K_M')
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(120)
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'salut' },
    ])
    expect(body.response_format).toBeUndefined()
  })

  it('trims a trailing slash on baseUrl', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    await new OpenAiCompatibleProvider({ baseUrl: 'http://x/', model: 'm', fetchImpl }).complete(
      req,
    )
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://x/v1/chat/completions')
  })

  it('sends the json schema as response_format when provided', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    const schema = { type: 'object', properties: {} }

    await provider.complete({ ...req, jsonSchema: schema })

    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'reply', strict: true, schema },
    })
  })

  it('sends the Authorization header only when an apiKey is given', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    await new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl }).complete(req)
    expect(
      (fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>)['Authorization'],
    ).toBeUndefined()

    const keyed = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    await new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      apiKey: 'k',
      fetchImpl: keyed,
    }).complete(req)
    expect((keyed.mock.calls[0]![1]!.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer k',
    )
  })

  it('retries once on 5xx then succeeds', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503))
      .mockResolvedValueOnce(jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    expect((await provider.complete(req)).text).toBe('bonsoir')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws LlmUnavailableError after a second 5xx', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ error: 'boom' }, 503))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    await expect(provider.complete(req)).rejects.toBeInstanceOf(LlmUnavailableError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 4xx', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ error: 'bad key' }, 401))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    await expect(provider.complete(req)).rejects.toThrow(/401/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws LlmUnavailableError when the payload has no content', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ choices: [] }))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    await expect(provider.complete(req)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('throws LlmUnavailableError when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn<FetchLike>(
      async () =>
        new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    await expect(provider.complete(req)).rejects.toThrow(/not valid JSON/)
  })

  it('defaults usage to zero when the server omits it', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    expect((await provider.complete(req)).usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('defaults to globalThis.fetch when no fetchImpl is injected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(okBody))
    try {
      const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm' })
      const res = await provider.complete(req)
      expect(res.text).toBe('bonsoir')
      expect(fetchSpy).toHaveBeenCalledWith('http://x/v1/chat/completions', expect.anything())
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('wraps a non-abort fetch failure as LlmUnavailableError', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new Error('network down')
    })
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    await expect(provider.complete(req)).rejects.toThrow(/LLM request failed/)
  })

  it('defaults per-field usage to zero when the server omits token counts', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }], usage: {} }),
    )
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    expect((await provider.complete(req)).usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('aborts and wraps the error when the request times out', async () => {
    const fetchImpl = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    )
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      timeoutMs: 5,
      fetchImpl,
    })

    await expect(provider.complete(req)).rejects.toThrow(/timeout/i)
  })
})
