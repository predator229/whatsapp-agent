import { z } from 'zod'
import { ProductSchema } from './product'
import { NegotiationPolicySchema, validateNegotiationAgainstCatalogue } from './negotiation'
import { StyleProfileSchema } from './style'
import { DeliveryPolicySchema } from './delivery'
import { LimitsSchema } from './limits'

export const MerchantProfileSchema = z.object({
  merchantId: z.string().min(1),
  displayName: z.string().min(1),
  currency: z.literal('XOF'),
  locale: z.literal('fr-BJ'),
  catalogue: z.array(ProductSchema),
  negotiation: NegotiationPolicySchema,
  style: StyleProfileSchema,
  delivery: DeliveryPolicySchema,
  limits: LimitsSchema,
})

export type MerchantProfile = z.infer<typeof MerchantProfileSchema>

function duplicateIds(profile: MerchantProfile): string[] {
  const seen = new Set<string>()
  return profile.catalogue
    .map((p) => p.productId)
    .filter((id) => (seen.has(id) ? true : (seen.add(id), false)))
    .map((id) => `catalogue: duplicate productId ${id}`)
}

/** Parse + vérifie la cohérence. Lance une Error listant toutes les erreurs. */
export function parseMerchantProfile(input: unknown): MerchantProfile {
  const result = MerchantProfileSchema.safeParse(input)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid merchant profile:\n${lines.join('\n')}`)
  }
  const profile = result.data
  const errors = [...duplicateIds(profile), ...validateNegotiationAgainstCatalogue(profile.negotiation, profile.catalogue)]
  if (errors.length > 0) throw new Error(`Invalid merchant profile:\n${errors.join('\n')}`)
  return profile
}
