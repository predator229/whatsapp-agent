import { z } from 'zod'

export const INTENT_NAMES = [
  'greet',
  'browse',
  'ask_product',
  'ask_price',
  'ask_delivery',
  'negotiate',
  'add_to_cart',
  'remove_from_cart',
  'give_address',
  'confirm_order',
  'cancel',
  'off_topic',
  'unclear',
] as const

export const ProductRefSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
})

export const IntentSchema = z.object({
  intent: z.enum(INTENT_NAMES),
  productRefs: z.array(ProductRefSchema),
  counterOffer: z.number().int().nonnegative().optional(),
  address: z.string().optional(),
  zone: z.string().optional(),
})

export type ProductRef = z.infer<typeof ProductRefSchema>
export type Intent = z.infer<typeof IntentSchema>

export const UNCLEAR_INTENT: Intent = { intent: 'unclear', productRefs: [] }

export const INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'productRefs'],
  properties: {
    intent: { type: 'string', enum: [...INTENT_NAMES] },
    productRefs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          variantId: { type: 'string' },
          quantity: { type: 'number' },
        },
      },
    },
    counterOffer: { type: 'number' },
    address: { type: 'string' },
    zone: { type: 'string' },
  },
} as const
