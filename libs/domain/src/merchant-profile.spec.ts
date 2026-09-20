import { describe, it, expect } from 'vitest'
import { MerchantProfileSchema, parseMerchantProfile } from './merchant-profile'
import { pilotProfile } from '../fixtures/pilot-profile'

describe('MerchantProfile', () => {
  it('accepts the pilot fixture', () => {
    expect(MerchantProfileSchema.parse(pilotProfile).merchantId).toBe('pilot')
  })
  it('parseMerchantProfile rejects a floor above listed price with a readable message', () => {
    const bad = { ...pilotProfile, negotiation: { ...pilotProfile.negotiation,
      perProduct: { ...pilotProfile.negotiation.perProduct, gari: { floorPrice: 900, steps: [] } } } }
    expect(() => parseMerchantProfile(bad)).toThrow(/gari/)
  })
  it('parseMerchantProfile rejects duplicate productIds', () => {
    const bad = { ...pilotProfile, catalogue: [...pilotProfile.catalogue, pilotProfile.catalogue[0]] }
    expect(() => parseMerchantProfile(bad)).toThrow(/duplicate/)
  })
  it('parseMerchantProfile reports Zod errors with a path', () => {
    expect(() => parseMerchantProfile({ ...pilotProfile, currency: 'EUR' })).toThrow(/currency/)
  })
})
