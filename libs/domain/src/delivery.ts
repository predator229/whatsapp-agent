import { z } from 'zod'

export const PaymentMethodSchema = z.enum(['cash_on_delivery', 'momo_mtn', 'momo_moov'])

export const DeliveryPolicySchema = z.object({
  zones: z.array(z.object({ name: z.string().min(1), fee: z.number().int().nonnegative(), delayHours: z.number().int().positive() })),
  pickupAddress: z.string().optional(),
  paymentMethods: z.array(PaymentMethodSchema).min(1),
})

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>
export type DeliveryPolicy = z.infer<typeof DeliveryPolicySchema>
