import { describe, it, expect } from 'vitest'
import * as domain from './index'
import * as testing from './testing'

describe('public index', () => {
  it('re-exports the schemas and functions plans 2 and 3 depend on', () => {
    expect(domain.ProductSchema).toBeDefined()
    expect(domain.NegotiationPolicySchema).toBeDefined()
    expect(domain.validateNegotiationAgainstCatalogue).toBeTypeOf('function')
    expect(domain.listedPrices).toBeTypeOf('function')
    expect(domain.StyleProfileSchema).toBeDefined()
    expect(domain.DeliveryPolicySchema).toBeDefined()
    expect(domain.LimitsSchema).toBeDefined()
    expect(domain.MerchantProfileSchema).toBeDefined()
    expect(domain.parseMerchantProfile).toBeTypeOf('function')
    expect(domain.exportProfile).toBeTypeOf('function')
    expect(domain.CATALOGUE_CSV_COLUMNS).toBeDefined()
  })
  it('keeps the pilot fixture out of the production barrel', () => {
    expect('pilotProfile' in domain).toBe(false)
  })
  it('exposes the pilot fixture from the testing entry point', () => {
    expect(testing.pilotProfile.merchantId).toBe('pilot')
  })
})
