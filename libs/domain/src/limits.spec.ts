import { describe, it, expect } from 'vitest'
import { LimitsSchema } from './limits'

describe('LimitsSchema', () => {
  it('defaults maxRepliesPerMonth to 1000 and maxReplyChars to 320', () => {
    const limits = LimitsSchema.parse({})
    expect(limits.maxRepliesPerMonth).toBe(1000)
    expect(limits.maxReplyChars).toBe(320)
  })
  it('rejects a maxReplyChars below 80', () => {
    expect(() => LimitsSchema.parse({ maxReplyChars: 79 })).toThrow()
  })
  it('rejects a maxReplyChars above 1000', () => {
    expect(() => LimitsSchema.parse({ maxReplyChars: 1001 })).toThrow()
  })
})
