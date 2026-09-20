import { z } from 'zod'
import { ProductSchema, type Product } from './product'
import { NegotiationPolicySchema, validateNegotiationAgainstCatalogue } from './negotiation'
import { StyleProfileSchema } from './style'
import { DeliveryPolicySchema } from './delivery'
import { LimitsSchema } from './limits'

interface DuplicateProductId {
  productId: string
  index: number
}

/** Occurrences en double d'un `productId` dans le catalogue, index de l'occurrence dupliquée. */
function findDuplicateProductIds(catalogue: Product[]): DuplicateProductId[] {
  const seen = new Set<string>()
  const duplicates: DuplicateProductId[] = []
  catalogue.forEach((product, index) => {
    if (seen.has(product.productId)) {
      duplicates.push({ productId: product.productId, index })
    } else {
      seen.add(product.productId)
    }
  })
  return duplicates
}

const MerchantProfileObjectSchema = z.object({
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

export const MerchantProfileSchema = MerchantProfileObjectSchema.superRefine((profile, ctx) => {
  for (const duplicate of findDuplicateProductIds(profile.catalogue)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['catalogue', duplicate.index, 'productId'],
      message: `duplicate productId "${duplicate.productId}"`,
    })
  }

  for (const issue of validateNegotiationAgainstCatalogue(profile.negotiation, profile.catalogue)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['negotiation', ...issue.path],
      message: issue.message,
    })
  }
})

export type MerchantProfile = z.infer<typeof MerchantProfileSchema>

/** Parse le profil et lance une Error listant tous les défauts avec un message lisible par défaut. */
export function parseMerchantProfile(input: unknown): MerchantProfile {
  const result = MerchantProfileSchema.safeParse(input)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid merchant profile:\n${lines.join('\n')}`)
  }
  return result.data
}
