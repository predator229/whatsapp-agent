import { describe, expect, it } from 'vitest'
import type { NegotiationPolicy, Product } from '@wa/domain'
import { applyQuantityDiscount, evaluateNegotiation } from './negotiation-engine'

const robe: Product = {
  productId: 'robe',
  name: 'Robe rouge',
  aliases: ['robe'],
  description: '',
  photos: [],
  active: true,
  tags: [],
  pricing: {
    kind: 'unit',
    variants: [{ variantId: 'm', label: 'M', attributes: {}, price: 12000, stock: 5 }],
  },
}

const policy: NegotiationPolicy = {
  enabled: true,
  perProduct: { robe: { floorPrice: 9000, steps: [11000, 10000, 9500] } },
  quantityDiscounts: [{ productId: 'robe', minQuantity: 3, percentOff: 10 }],
  maxRounds: 3,
}

const base = { policy, product: robe, listedPrice: 12000, quantity: 1 }

describe('applyQuantityDiscount', () => {
  it('returns the listed price below the threshold', () => {
    expect(applyQuantityDiscount(policy, 'robe', 2, 12000)).toBe(12000)
  })

  it('applies the discount at the threshold', () => {
    expect(applyQuantityDiscount(policy, 'robe', 3, 12000)).toBe(10800)
  })

  it('keeps the highest applicable tier', () => {
    const tiered: NegotiationPolicy = {
      ...policy,
      quantityDiscounts: [
        { productId: 'robe', minQuantity: 3, percentOff: 10 },
        { productId: 'robe', minQuantity: 10, percentOff: 20 },
      ],
    }
    expect(applyQuantityDiscount(tiered, 'robe', 10, 12000)).toBe(9600)
  })

  it('ignores discounts for other products', () => {
    expect(applyQuantityDiscount(policy, 'autre', 10, 12000)).toBe(12000)
  })
})

describe('evaluateNegotiation', () => {
  it('accepts an offer at or above the listed price without negotiating', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 12000, round: 0 })).toEqual({
      accepted: true,
      offer: 12000,
      round: 0,
      reason: 'accepted_customer_offer',
    })
  })

  it('counters with the first step on round 0', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 8000, round: 0 })).toEqual({
      accepted: false,
      offer: 11000,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('walks the steps down one round at a time', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 8000, round: 1 }).offer).toBe(10000)
    expect(evaluateNegotiation({ ...base, counterOffer: 8000, round: 2 }).offer).toBe(9500)
  })

  it('accepts when the customer offer meets the current step', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 11000, round: 0 })).toEqual({
      accepted: true,
      offer: 11000,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('never goes below floorPrice when steps run out', () => {
    const shallow: NegotiationPolicy = {
      ...policy,
      perProduct: { robe: { floorPrice: 9000, steps: [11000] } },
      maxRounds: 5,
    }
    const result = evaluateNegotiation({ ...base, policy: shallow, counterOffer: 1, round: 1 })
    expect(result).toEqual({ accepted: false, offer: 9000, round: 2, reason: 'floor_reached' })
  })

  it('refuses firmly once maxRounds is reached', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 1, round: 3 })).toEqual({
      accepted: false,
      offer: 9000,
      round: 4,
      reason: 'max_rounds',
    })
  })

  it('books the sale at the customer price when it overshoots the current step', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 11500, round: 0 })).toEqual({
      accepted: true,
      offer: 11500,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('accepts a counter-offer equal to the effective floor at maxRounds', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 9000, round: 3 })).toEqual({
      accepted: true,
      offer: 9000,
      round: 4,
      reason: 'max_rounds',
    })
  })

  it('books the sale at the customer price above the floor at maxRounds', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 9500, round: 3 })).toEqual({
      accepted: true,
      offer: 9500,
      round: 4,
      reason: 'max_rounds',
    })
  })

  it('treats a disabled policy as non-negotiable', () => {
    const off = { ...policy, enabled: false }
    expect(evaluateNegotiation({ ...base, policy: off, counterOffer: 8000, round: 0 })).toEqual({
      accepted: false,
      offer: 12000,
      round: 0,
      reason: 'not_negotiable',
    })
  })

  it('treats a product without a rule as non-negotiable but honours full price', () => {
    const other = { ...robe, productId: 'autre' }
    expect(evaluateNegotiation({ ...base, product: other, counterOffer: 12000, round: 0 })).toEqual(
      { accepted: true, offer: 12000, round: 0, reason: 'not_negotiable' },
    )
  })

  it('applies the quantity discount before the steps', () => {
    // base = 10800 ; premier palier 11000 est plafonné au prix remisé
    expect(evaluateNegotiation({ ...base, quantity: 3, counterOffer: 9200, round: 0 })).toEqual({
      accepted: false,
      offer: 10800,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('lets a quantity discount go under the nominal floor', () => {
    const deep: NegotiationPolicy = {
      ...policy,
      quantityDiscounts: [{ productId: 'robe', minQuantity: 3, percentOff: 30 }],
    }
    // base = 8400 < floorPrice 9000 : le plancher effectif suit le prix remisé
    expect(
      evaluateNegotiation({ ...base, policy: deep, quantity: 3, counterOffer: 8400, round: 0 }),
    ).toEqual({ accepted: true, offer: 8400, round: 0, reason: 'accepted_customer_offer' })
  })
})
