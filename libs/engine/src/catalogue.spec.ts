import { describe, expect, it } from 'vitest'
import { pilotProfile } from '@wa/domain'
import { activeProducts, resolveProductRef } from './catalogue'

describe('activeProducts', () => {
  it('excludes inactive products', () => {
    expect(activeProducts(pilotProfile).map((p) => p.productId)).not.toContain('ancien-sac')
  })
})

describe('resolveProductRef', () => {
  it('returns null for an unknown product', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'inconnu' })).toBeNull()
  })

  it('returns null for an inactive product', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'ancien-sac' })).toBeNull()
  })

  it('resolves a unit product to its first variant by default', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'robe-rouge' })).toMatchObject({
      variantId: 'm',
      label: 'Robe rouge Taille M',
      unitPrice: 12000,
      stock: 3,
    })
  })

  it('resolves an explicit variantId', () => {
    expect(
      resolveProductRef(pilotProfile, { productId: 'robe-rouge', variantId: 'l' }),
    ).toMatchObject({ unitPrice: 12000, stock: 0 })
  })

  it('returns null for an unknown variantId', () => {
    expect(
      resolveProductRef(pilotProfile, { productId: 'robe-rouge', variantId: 'xxl' }),
    ).toBeNull()
  })

  it('treats a null variant stock as unlimited', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'chaussure-noire' })?.stock).toBeNull()
  })

  it('resolves a bulk product to its price per unit', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'gari' })).toMatchObject({
      label: 'Gari (kg)',
      unitPrice: 600,
      stock: 40,
    })
  })

  it('resolves a made-to-order product to its base price with unlimited stock', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'tenue-mesure' })).toMatchObject({
      label: 'Tenue sur mesure',
      unitPrice: 25000,
      stock: null,
    })
  })
})
