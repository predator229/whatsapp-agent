import { describe, it, expect } from 'vitest'
import { NegotiationPolicySchema, validateNegotiationAgainstCatalogue } from './negotiation'
import type { Product } from './product'

const robe: Product = { productId: 'robe', name: 'Robe', aliases: [], description: '', photos: [], active: true, tags: [],
  pricing: { kind: 'unit', variants: [{ variantId: 'm', label: 'M', attributes: {}, price: 12000, stock: 2 }] } }

describe('NegotiationPolicySchema', () => {
  it('accepts a valid policy', () => {
    const p = NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3,
      perProduct: { robe: { floorPrice: 9000, steps: [11000, 10000, 9000] } },
      quantityDiscounts: [{ productId: 'robe', minQuantity: 2, percentOff: 10 }] })
    expect(p.maxRounds).toBe(3)
  })
  it('rejects non-decreasing steps', () => {
    expect(() => NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3,
      perProduct: { robe: { floorPrice: 9000, steps: [10000, 11000] } }, quantityDiscounts: [] })).toThrow()
  })
  it('rejects steps below floor', () => {
    expect(() => NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3,
      perProduct: { robe: { floorPrice: 9000, steps: [8000] } }, quantityDiscounts: [] })).toThrow()
  })
  it('rejects percentOff outside ]0,50]', () => {
    for (const percentOff of [0, 51]) {
      expect(() => NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3, perProduct: {},
        quantityDiscounts: [{ productId: 'robe', minQuantity: 2, percentOff }] })).toThrow()
    }
  })
  it('defaults maxRounds to 3', () => {
    expect(NegotiationPolicySchema.parse({ enabled: false, perProduct: {}, quantityDiscounts: [] }).maxRounds).toBe(3)
  })
})

describe('validateNegotiationAgainstCatalogue', () => {
  it('flags floor above a listed price and unknown productId', () => {
    const policy = NegotiationPolicySchema.parse({ enabled: true, perProduct: {
      robe: { floorPrice: 13000, steps: [] }, ghost: { floorPrice: 1, steps: [] } }, quantityDiscounts: [] })
    const errors = validateNegotiationAgainstCatalogue(policy, [robe])
    expect(errors).toHaveLength(2)
    expect(errors).toContainEqual(expect.objectContaining({ path: ['perProduct', 'robe', 'floorPrice'] }))
    expect(errors).toContainEqual(expect.objectContaining({ path: ['perProduct', 'ghost'] }))
  })
  it('returns no errors for a consistent policy', () => {
    const policy = NegotiationPolicySchema.parse({ enabled: true, perProduct: { robe: { floorPrice: 9000, steps: [10000] } }, quantityDiscounts: [] })
    expect(validateNegotiationAgainstCatalogue(policy, [robe])).toEqual([])
  })
  it('flags an unknown productId in quantityDiscounts', () => {
    const policy = NegotiationPolicySchema.parse({ enabled: true, perProduct: {},
      quantityDiscounts: [{ productId: 'ghost', minQuantity: 2, percentOff: 10 }] })
    const errors = validateNegotiationAgainstCatalogue(policy, [robe])
    expect(errors).toEqual([{ path: ['quantityDiscounts', 0, 'productId'], message: 'unknown product ghost' }])
  })
})
