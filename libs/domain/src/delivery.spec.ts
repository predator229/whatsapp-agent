import { describe, it, expect } from 'vitest'
import { DeliveryPolicySchema } from './delivery'

describe('DeliveryPolicySchema', () => {
  it('accepts zones and payment methods', () => {
    const d = DeliveryPolicySchema.parse({ zones: [{ name: 'Cotonou', fee: 1000, delayHours: 24 }], paymentMethods: ['cash_on_delivery'] })
    expect(d.zones[0].fee).toBe(1000)
  })
  it('requires at least one payment method', () => {
    expect(() => DeliveryPolicySchema.parse({ zones: [], paymentMethods: [] })).toThrow()
  })
  it('rejects unknown payment method', () => {
    expect(() => DeliveryPolicySchema.parse({ zones: [], paymentMethods: ['bitcoin'] })).toThrow()
  })
  it('rejects a non-integer zone fee', () => {
    expect(() => DeliveryPolicySchema.parse({ zones: [{ name: 'Cotonou', fee: 10.5, delayHours: 24 }], paymentMethods: ['cash_on_delivery'] })).toThrow()
  })
  it('rejects a non-positive delayHours', () => {
    expect(() => DeliveryPolicySchema.parse({ zones: [{ name: 'Cotonou', fee: 1000, delayHours: 0 }], paymentMethods: ['cash_on_delivery'] })).toThrow()
  })
})
