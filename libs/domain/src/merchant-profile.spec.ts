import { describe, it, expect } from 'vitest'
import { MerchantProfileSchema, parseMerchantProfile } from './merchant-profile'
import { pilotProfile } from '../fixtures/pilot-profile'

describe('MerchantProfile', () => {
  it('accepts the pilot fixture', () => {
    expect(MerchantProfileSchema.parse(pilotProfile).merchantId).toBe('pilot')
  })
  it('parseMerchantProfile rejects a floor above listed price with a readable message', () => {
    const bad = {
      ...pilotProfile,
      negotiation: {
        ...pilotProfile.negotiation,
        perProduct: {
          ...pilotProfile.negotiation.perProduct,
          gari: { floorPrice: 900, steps: [] },
        },
      },
    }
    expect(() => parseMerchantProfile(bad)).toThrow(/gari/)
  })
  it('parseMerchantProfile rejects duplicate productIds', () => {
    const bad = {
      ...pilotProfile,
      catalogue: [...pilotProfile.catalogue, pilotProfile.catalogue[0]],
    }
    expect(() => parseMerchantProfile(bad)).toThrow(/duplicate/)
  })
  it('parseMerchantProfile reports Zod errors with a path', () => {
    expect(() => parseMerchantProfile({ ...pilotProfile, currency: 'EUR' })).toThrow(/currency/)
  })
  it('parseMerchantProfile returns the profile unchanged when it is valid', () => {
    expect(parseMerchantProfile(pilotProfile)).toEqual(pilotProfile)
  })
  it('MerchantProfileSchema.parse itself rejects a floor above listed price', () => {
    const bad = {
      ...pilotProfile,
      negotiation: {
        ...pilotProfile.negotiation,
        perProduct: {
          ...pilotProfile.negotiation.perProduct,
          gari: { floorPrice: 900, steps: [] },
        },
      },
    }
    const result = MerchantProfileSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        'negotiation',
        'perProduct',
        'gari',
        'floorPrice',
      ])
    }
  })
  it('MerchantProfileSchema.parse rejects a duplicate productId with a path to the catalogue entry', () => {
    const bad = {
      ...pilotProfile,
      catalogue: [...pilotProfile.catalogue, pilotProfile.catalogue[0]],
    }
    const result = MerchantProfileSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        'catalogue',
        pilotProfile.catalogue.length,
        'productId',
      ])
    }
  })
  it('MerchantProfileSchema.parse rejects an unknown productId in quantityDiscounts', () => {
    const bad = {
      ...pilotProfile,
      negotiation: {
        ...pilotProfile.negotiation,
        quantityDiscounts: [
          ...pilotProfile.negotiation.quantityDiscounts,
          { productId: 'ghost', minQuantity: 2, percentOff: 10 },
        ],
      },
    }
    const result = MerchantProfileSchema.safeParse(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        'negotiation',
        'quantityDiscounts',
        1,
        'productId',
      ])
    }
  })
})
