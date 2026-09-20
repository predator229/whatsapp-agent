import { z } from 'zod'

const price = z.number().int().nonnegative()
const stock = z.number().int().nonnegative().nullable()

export const VariantSchema = z.object({
  variantId: z.string().min(1),
  label: z.string().min(1),
  attributes: z.record(z.string()),
  price,
  stock,
})

const UnitPricing = z.object({ kind: z.literal('unit'), variants: z.array(VariantSchema).min(1) })
const BulkPricing = z.object({
  kind: z.literal('bulk'),
  unitOfMeasure: z.enum(['kg', 'm', 'L', 'piece']),
  pricePerUnit: price,
  minQuantity: z.number().positive(),
  stepQuantity: z.number().positive(),
  stockQuantity: z.number().nonnegative().nullable(),
})
const MadeToOrderPricing = z.object({
  kind: z.literal('madeToOrder'),
  basePrice: price,
  leadTimeDays: z.number().int().positive(),
  depositPercent: z.number().int().min(0).max(100),
  options: z.array(z.object({ label: z.string().min(1), extraPrice: price })),
})

export const ProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  description: z.string().max(300),
  photos: z.array(z.string().url()),
  active: z.boolean(),
  tags: z.array(z.string()),
  pricing: z.discriminatedUnion('kind', [UnitPricing, BulkPricing, MadeToOrderPricing]),
})

export type Variant = z.infer<typeof VariantSchema>
export type Product = z.infer<typeof ProductSchema>
export type UnitProduct = Product & { pricing: z.infer<typeof UnitPricing> }
export type BulkProduct = Product & { pricing: z.infer<typeof BulkPricing> }
export type MadeToOrderProduct = Product & { pricing: z.infer<typeof MadeToOrderPricing> }

/** Tous les prix qu'un client peut se voir citer pour ce produit (base + options pour le sur-commande). */
export function listedPrices(product: Product): number[] {
  const { pricing } = product
  switch (pricing.kind) {
    case 'unit':
      return pricing.variants.map((v) => v.price)
    case 'bulk':
      return [pricing.pricePerUnit]
    case 'madeToOrder':
      return [pricing.basePrice, ...pricing.options.map((o) => pricing.basePrice + o.extraPrice)]
  }
}
