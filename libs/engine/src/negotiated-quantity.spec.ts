import { describe, expect, it } from 'vitest'
import { newConversationState, pilotProfile, type ConversationState } from '@wa/domain'
import { transition } from './state-machine'
import type { Intent } from './intent-schema'

const at = '2026-09-21T10:00:00.000Z'
const idle = newConversationState(pilotProfile.merchantId, 'c1', at)

function run(intent: Intent, state: ConversationState = idle) {
  return transition({ profile: pilotProfile, state, intent, text: 'msg', receivedAt: at })
}

/** Remise quantité du profil pilote : robe-rouge -10 % dès 3 pièces → 10 800 XOF. */
const threeDresses = run({
  intent: 'negotiate',
  productRefs: [{ productId: 'robe-rouge', quantity: 3 }],
  counterOffer: 10800,
}).state

const addDresses = (quantity: number, state = threeDresses) =>
  run({ intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity }] }, state).state

describe('negotiated price bound to the negotiated quantity', () => {
  it('records the quantity the offer was made for', () => {
    expect(threeDresses.negotiation['robe-rouge']).toEqual({
      round: 0,
      currentOffer: 10800,
      quantity: 3,
    })
  })

  it('does not apply a 3-piece discount to a single piece', () => {
    expect(addDresses(1).cart).toMatchObject([
      { quantity: 1, unitPrice: 12000, agreedPrice: 12000 },
    ])
  })

  it('applies it once the cart reaches the negotiated quantity', () => {
    expect(addDresses(3).cart).toMatchObject([{ quantity: 3, agreedPrice: 10800 }])
    expect(addDresses(2, addDresses(1)).cart).toMatchObject([{ quantity: 3, agreedPrice: 10800 }])
  })

  it('drops the discount when the line falls back under the negotiated quantity', () => {
    const removed = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge', quantity: 2 }] },
      addDresses(3),
    )
    expect(removed.state.cart).toMatchObject([{ quantity: 1, agreedPrice: 12000 }])
  })

  it('requotes the listed price for a smaller quantity, the offer otherwise', () => {
    const quote = (quantity?: number) =>
      run(
        {
          intent: 'negotiate',
          productRefs: [{ productId: 'robe-rouge', ...(quantity ? { quantity } : {}) }],
        },
        threeDresses,
      ).facts[0]
    expect(quote(1)).toMatchObject({ kind: 'PriceQuoted', price: 12000 })
    expect(quote()).toMatchObject({ kind: 'PriceQuoted', price: 10800 })
  })

  it('evaluates each reference with its own quantity', () => {
    const result = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'chaussure-noire' }, { productId: 'robe-rouge', quantity: 3 }],
      counterOffer: 10800,
    })
    expect(result.facts).toContainEqual(
      expect.objectContaining({
        kind: 'NegotiationResult',
        productId: 'robe-rouge',
        accepted: true,
        offer: 10800,
      }),
    )
  })
})
