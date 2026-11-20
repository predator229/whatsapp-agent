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

  it('waits a jittered base delay before retrying', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 502))
      .mockResolvedValueOnce(jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      fetchImpl,
      retryDelayMs: 200,
      sleep,
    })

    await provider.complete(req)
    const waited = sleep.mock.calls[0]![0]
    expect(waited).toBeGreaterThanOrEqual(200)
    expect(waited).toBeLessThanOrEqual(400)
  })

  it('retries once on 429 and honours Retry-After in seconds, capped', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const limited = (retryAfter: string) =>
      new Response('{}', { status: 429, headers: { 'retry-after': retryAfter } })
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(limited('2'))
      .mockResolvedValueOnce(jsonResponse(okBody))
      .mockResolvedValueOnce(limited('3600'))
      .mockResolvedValueOnce(limited('3600'))
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      fetchImpl,
      sleep,
    })

    expect((await provider.complete(req)).text).toBe('bonsoir')
    expect(sleep).toHaveBeenLastCalledWith(2000)
    await expect(provider.complete(req)).rejects.toThrow(/429 after 1 retry/)
    expect(sleep).toHaveBeenLastCalledWith(10_000)
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('reads Retry-After as an HTTP date and ignores an unreadable one', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const limited = (retryAfter: string) =>
      new Response('{}', { status: 429, headers: { 'retry-after': retryAfter } })
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(limited(new Date(Date.now() - 60_000).toUTCString()))
      .mockResolvedValueOnce(jsonResponse(okBody))
      .mockResolvedValueOnce(limited('bientôt'))
      .mockResolvedValueOnce(jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      fetchImpl,
      retryDelayMs: 100,
      sleep,
    })

    await provider.complete(req)
    expect(sleep).toHaveBeenLastCalledWith(0)
    await provider.complete(req)
    expect(sleep.mock.calls[1]![0]).toBeGreaterThanOrEqual(100)
  })

  it('waits with a real timer by default', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi
        .fn<FetchLike>()
        .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503))
        .mockResolvedValueOnce(jsonResponse(okBody))
      const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
      const pending = provider.complete(req)
      await vi.advanceTimersByTimeAsync(1000)
      expect((await pending).text).toBe('bonsoir')
    } finally {
      vi.useRealTimers()
    }
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
