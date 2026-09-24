import { describe, expect, it } from 'vitest'
import type { Order } from '@wa/domain'
import { collectAllowedNumbers, collectAllowedPhrases } from './allowed'
import type { TurnFact } from './facts'

/** Commande dont l'adresse n'a pas de zone : le composer n'a alors aucun nom de zone à citer. */
const zonelessOrder: Order = {
  orderId: 'pilot:c1:2026-09-21T10:00:00.000Z',
  merchantId: 'pilot',
  customerId: 'c1',
  lines: [{ productId: 'gari', label: 'Gari (kg)', quantity: 2, unitPrice: 600, agreedPrice: 600 }],
  subtotal: 1200,
  deliveryFee: 0,
  total: 1200,
  address: { text: 'je passe récupérer' },
  paymentMethod: 'cash_on_delivery',
  createdAt: '2026-09-21T10:00:00.000Z',
}

describe('collectAllowedPhrases', () => {
  it('quotes the line labels and omits an absent zone', () => {
    const facts: TurnFact[] = [{ kind: 'OrderSummary', order: zonelessOrder }]
    expect(collectAllowedPhrases(facts)).toEqual(['Gari (kg)'])
  })

  it('returns nothing for facts that name nothing', () => {
    expect(collectAllowedPhrases([{ kind: 'Greeting' }, { kind: 'OffTopic' }])).toEqual([])
  })
})

describe('collectAllowedNumbers', () => {
  it('always tolerates 0 and 1', () => {
    expect(collectAllowedNumbers([{ kind: 'Greeting' }])).toEqual([0, 1])
  })

  it('collects every figure an order summary puts on the table', () => {
    const facts: TurnFact[] = [{ kind: 'OrderSummary', order: zonelessOrder }]
    expect(collectAllowedNumbers(facts)).toEqual(expect.arrayContaining([1200, 0, 2, 600]))
  })
})
