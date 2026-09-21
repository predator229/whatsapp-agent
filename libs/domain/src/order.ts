import { z } from 'zod'
import { PaymentMethodSchema } from './delivery'

const price = z.number().int().nonnegative()

export const OrderLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  label: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: price,
  agreedPrice: price,
})

export type OrderLine = z.infer<typeof OrderLineSchema>

/** Sous-total (prix convenus × quantités) et total livraison comprise. */
export function orderTotal(
  lines: readonly OrderLine[],
  deliveryFee: number,
): { subtotal: number; total: number } {
  const subtotal = lines.reduce((sum, l) => sum + l.agreedPrice * l.quantity, 0)
  return { subtotal, total: subtotal + deliveryFee }
}

export const OrderSchema = z
  .object({
    orderId: z.string().min(1),
    merchantId: z.string().min(1),
    customerId: z.string().min(1),
    lines: z.array(OrderLineSchema).min(1),
    subtotal: price,
    deliveryFee: price,
    total: price,
    address: z.object({ text: z.string().min(1), zone: z.string().min(1).optional() }),
    paymentMethod: PaymentMethodSchema,
    depositAmount: price.optional(),
    createdAt: z.string().datetime(),
  })
  .superRefine((order, ctx) => {
    const { subtotal, total } = orderTotal(order.lines, order.deliveryFee)
    if (order.subtotal !== subtotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subtotal'],
        message: `subtotal ${order.subtotal} does not match lines total ${subtotal}`,
      })
    }
    if (order.total !== order.subtotal + order.deliveryFee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total'],
        message: `total ${order.total} != subtotal ${order.subtotal} + deliveryFee ${order.deliveryFee}`,
      })
    }
    if (order.depositAmount !== undefined && order.depositAmount > order.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositAmount'],
        message: `depositAmount ${order.depositAmount} > total ${order.total}`,
      })
    }
  })

export type Order = z.infer<typeof OrderSchema>
