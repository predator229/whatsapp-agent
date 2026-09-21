import { describe, expect, it } from 'vitest'
import { LlmUnavailableError } from './provider'
import { MockProvider } from './mock-provider'

const req = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 100 }

describe('MockProvider', () => {
  it('returns scripted replies in order', async () => {
    const provider = new MockProvider(['first', 'second'])
    expect((await provider.complete(req)).text).toBe('first')
    expect((await provider.complete(req)).text).toBe('second')
  })

  it('records every request it received', async () => {
    const provider = new MockProvider(['ok'])
    await provider.complete(req)
    expect(provider.calls).toEqual([req])
  })

  it('reports a default usage for string scripts', async () => {
    const provider = new MockProvider(['ok'])
    expect((await provider.complete(req)).usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('rejects when the script entry is an Error', async () => {
    const provider = new MockProvider([new LlmUnavailableError('timeout')])
    await expect(provider.complete(req)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('supports a function script that sees the request', async () => {
    const provider = new MockProvider([
      (r) => ({ text: r.system, usage: { inputTokens: 1, outputTokens: 2 } }),
    ])
    expect((await provider.complete(req)).text).toBe('sys')
  })

  it('throws a clear error when the script is exhausted', async () => {
    const provider = new MockProvider([])
    await expect(provider.complete(req)).rejects.toThrow('MockProvider script exhausted')
  })

  it('appends further script entries via pushScript', async () => {
    const provider = new MockProvider()
    provider.pushScript('queued')
    expect((await provider.complete(req)).text).toBe('queued')
  })

  it('returns a raw LlmResponse script entry as-is', async () => {
    const response = { text: 'raw', usage: { inputTokens: 3, outputTokens: 4 } }
    const provider = new MockProvider([response])
    expect(await provider.complete(req)).toEqual(response)
  })
})
