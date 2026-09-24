import { describe, expect, it } from 'vitest'
import * as engine from './index'

describe('public index', () => {
  it('re-exports the negotiation engine functions', () => {
    expect(engine.evaluateNegotiation).toBeTypeOf('function')
    expect(engine.applyQuantityDiscount).toBeTypeOf('function')
  })
})
