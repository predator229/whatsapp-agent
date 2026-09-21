import { describe, expect, it } from 'vitest'
import * as llmProvider from './index'

describe('public index', () => {
  it('re-exports the error type and MockProvider', () => {
    expect(llmProvider.LlmUnavailableError).toBeTypeOf('function')
    expect(llmProvider.MockProvider).toBeTypeOf('function')
  })
})
