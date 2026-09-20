import { z } from 'zod'
import { listedPrices, type Product } from './product'

const ProductNegotiation = z
  .object({ floorPrice: z.number().int().nonnegative(), steps: z.array(z.number().int().nonnegative()) })
  .refine((p) => p.steps.every((s, i) => i === 0 || s < p.steps[i - 1]), { message: 'steps must be strictly decreasing' })
  .refine((p) => p.steps.every((s) => s >= p.floorPrice), { message: 'steps must be >= floorPrice' })

export const NegotiationPolicySchema = z.object({
  enabled: z.boolean(),
  perProduct: z.record(ProductNegotiation),
  quantityDiscounts: z.array(
    z.object({ productId: z.string().min(1), minQuantity: z.number().positive(), percentOff: z.number().gt(0).max(50) }),
  ),
  maxRounds: z.number().int().positive().default(3),
})

export type NegotiationPolicy = z.infer<typeof NegotiationPolicySchema>

/** Vérifie la cohérence avec le catalogue. Retourne les erreurs, vide si OK. */
export function validateNegotiationAgainstCatalogue(policy: NegotiationPolicy, catalogue: Product[]): string[] {
  const byId = new Map(catalogue.map((p) => [p.productId, p]))
  return Object.entries(policy.perProduct).flatMap(([productId, rule]) => {
    const product = byId.get(productId)
    if (!product) return [`negotiation.perProduct.${productId}: unknown product`]
    const minListed = Math.min(...listedPrices(product))
    return rule.floorPrice > minListed
      ? [`negotiation.perProduct.${productId}: floorPrice ${rule.floorPrice} > listed price ${minListed}`]
      : []
  })
}
