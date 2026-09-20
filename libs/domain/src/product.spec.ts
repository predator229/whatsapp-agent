import { describe, it, expect } from 'vitest'
import { ProductSchema, listedPrices } from './product'

const base = { productId: 'p1', name: 'Robe', aliases: ['robe'], description: '', photos: [], active: true, tags: [] }

describe('ProductSchema', () => {
  it('accepts a unit product with one variant', () => {
    const p = ProductSchema.parse({ ...base, pricing: { kind: 'unit', variants: [
      { variantId: 'v1', label: 'M rouge', attributes: { taille: 'M' }, price: 12000, stock: 3 } ] } })
    expect(listedPrices(p)).toEqual([12000])
  })
  it('rejects a unit product without variants', () => {
    expect(() => ProductSchema.parse({ ...base, pricing: { kind: 'unit', variants: [] } })).toThrow()
  })
  it('accepts bulk and made-to-order', () => {
    const bulk = ProductSchema.parse({ ...base, pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 800, minQuantity: 1, stepQuantity: 0.5, stockQuantity: null } })
    const mto = ProductSchema.parse({ ...base, pricing: { kind: 'madeToOrder', basePrice: 25000, leadTimeDays: 7, depositPercent: 50, options: [{ label: 'broderie', extraPrice: 5000 }] } })
    expect(listedPrices(bulk)).toEqual([800])
    expect(listedPrices(mto)).toEqual([25000, 30000])
  })
  it('rejects non-integer or negative prices', () => {
    expect(() => ProductSchema.parse({ ...base, pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 800.5, minQuantity: 1, stepQuantity: 1, stockQuantity: null } })).toThrow()
    expect(() => ProductSchema.parse({ ...base, pricing: { kind: 'unit', variants: [{ variantId: 'v', label: 'x', attributes: {}, price: -1, stock: null }] } })).toThrow()
  })
  it('rejects description over 300 chars', () => {
    expect(() => ProductSchema.parse({ ...base, description: 'a'.repeat(301), pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 1, minQuantity: 1, stepQuantity: 1, stockQuantity: null } })).toThrow()
  })
})
