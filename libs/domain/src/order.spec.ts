import { describe, expect, it } from 'vitest'
import { OrderSchema, orderTotal } from './order'

const line = {
  productId: 'p1',
  label: 'Robe rouge',
  quantity: 2,
  unitPrice: 12000,
  agreedPrice: 10000,
}

const order = {
  orderId: 'm1:c1:2026-09-21T10:00:00.000Z',
  merchantId: 'm1',
  customerId: 'c1',
  lines: [line],
  subtotal: 20000,
  deliveryFee: 1000,
  total: 21000,
  address: { text: 'Fidjrossè carrefour pharmacie', zone: 'Cotonou' },
  paymentMethod: 'cash_on_delivery',
  createdAt: '2026-09-21T10:00:00.000Z',
}

describe('OrderSchema', () => {
  it('accepts a coherent order', () => {
    expect(OrderSchema.parse(order)).toEqual(order)
  })

  it('rejects an order with no line', () => {
    expect(() => OrderSchema.parse({ ...order, lines: [] })).toThrow()
  })

  it('rejects a total that is not subtotal + deliveryFee', () => {
    const result = OrderSchema.safeParse({ ...order, total: 99999 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['total'])
  })

  it('rejects a subtotal that does not match the lines', () => {
    const result = OrderSchema.safeParse({ ...order, subtotal: 1, total: 1001 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['subtotal'])
  })

  it('accepts a deposit for a made-to-order line', () => {
    expect(OrderSchema.parse({ ...order, depositAmount: 5000 }).depositAmount).toBe(5000)
  })
})

describe('orderTotal', () => {
  it('sums agreedPrice times quantity plus the delivery fee', () => {
    expect(orderTotal([line, { ...line, quantity: 1, agreedPrice: 3000 }], 1000)).toEqual({
      subtotal: 23000,
      total: 24000,
    })
  })
})
