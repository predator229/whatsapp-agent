import { describe, expect, it } from 'vitest'
import { newConversationState, pilotProfile, type ConversationState } from '@wa/domain'
import { transition } from './state-machine'
import type { Intent } from './intent-schema'

const at = '2026-09-21T10:00:00.000Z'
const idle = newConversationState(pilotProfile.merchantId, 'c1', at)
const noRefs = { productRefs: [] }

function run(intent: Intent, state: ConversationState = idle, text = 'msg') {
  return transition({ profile: pilotProfile, state, intent, text, receivedAt: at })
}

function cartWithRobe(quantity = 1) {
  return run({ intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity }] }).state
}

describe('transition', () => {
  it('greets and shows at most three products', () => {
    const result = run({ intent: 'greet', ...noRefs })
    expect(result.state.phase).toBe('browsing')
    const found = result.facts.find((f) => f.kind === 'ProductsFound')
    expect(found?.kind === 'ProductsFound' && found.products.length).toBeLessThanOrEqual(3)
  })

  it('logs the customer turn', () => {
    expect(run({ intent: 'greet', ...noRefs }, idle, 'bonsoir').state.turns).toEqual([
      { role: 'customer', text: 'bonsoir', at },
    ])
  })

  it('never mutates the input state', () => {
    const before = JSON.stringify(idle)
    cartWithRobe(2)
    expect(JSON.stringify(idle)).toBe(before)
  })

  it('quotes the price and stock of a known product', () => {
    const result = run({ intent: 'ask_price', productRefs: [{ productId: 'robe-rouge' }] })
    expect(result.facts).toContainEqual({
      kind: 'PriceQuoted',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      price: 12000,
      stock: 3,
    })
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([12000, 3]))
    expect(result.allowedPhrases).toContain('Robe rouge Taille M')
  })

  it('quotes lead time and deposit for a made-to-order product', () => {
    const result = run({ intent: 'ask_price', productRefs: [{ productId: 'tenue-mesure' }] })
    expect(result.facts).toContainEqual({
      kind: 'PriceQuoted',
      productId: 'tenue-mesure',
      name: 'Tenue sur mesure',
      price: 25000,
      stock: null,
      leadTimeDays: 7,
      depositPercent: 50,
    })
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([25000, 7, 50]))
  })

  it('reports OutOfScope for an unknown product', () => {
    const result = run({ intent: 'ask_price', productRefs: [{ productId: 'inconnu' }] })
    expect(result.facts).toContainEqual({ kind: 'OutOfScope', query: 'inconnu' })
  })

  it('reports OutOfStock when the quantity exceeds the stock', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'robe-rouge', quantity: 9999 }],
    })
    expect(result.facts).toContainEqual({
      kind: 'OutOfStock',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      available: 3,
    })
    expect(result.state.cart).toEqual([])
  })

  it('reports MinQuantity for a bulk product below its minimum', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'gari', quantity: 0.5 }],
    })
    expect(result.facts).toContainEqual({
      kind: 'MinQuantity',
      productId: 'gari',
      name: 'Gari (kg)',
      minQuantity: 1,
      unit: 'kg',
    })
    expect(result.state.cart).toEqual([])
  })

  it('adds to the cart and reports the subtotal', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'robe-rouge', quantity: 2 }],
    })
    expect(result.state.phase).toBe('cart')
    expect(result.state.cart).toEqual([
      {
        productId: 'robe-rouge',
        variantId: 'm',
        quantity: 2,
        unitPrice: 12000,
        agreedPrice: 12000,
      },
    ])
    expect(result.facts.some((f) => f.kind === 'CartUpdated' && f.subtotal === 24000)).toBe(true)
  })

  it('merges quantities for an existing cart line', () => {
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 2 }] },
      cartWithRobe(1),
    )
    expect(result.state.cart[0]?.quantity).toBe(3)
  })

  it('refuses a merge that exceeds the stock', () => {
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 3 }] },
      cartWithRobe(2),
    )
    expect(result.facts.some((f) => f.kind === 'OutOfStock')).toBe(true)
    expect(result.state.cart[0]?.quantity).toBe(2)
  })

  it('removes a whole line without a quantity', () => {
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge' }] },
      cartWithRobe(2),
    )
    expect(result.state.cart).toEqual([])
    expect(result.state.phase).toBe('browsing')
  })

  it('decrements a line when a quantity is given', () => {
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge', quantity: 1 }] },
      cartWithRobe(3),
    )
    expect(result.state.cart[0]?.quantity).toBe(2)
    expect(result.state.phase).toBe('cart')
  })

  it('records a negotiation round and the agreed offer', () => {
    const result = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'robe-rouge' }],
      counterOffer: 9000,
    })
    expect(result.state.phase).toBe('negotiating')
    expect(result.state.negotiation['robe-rouge']).toEqual({ round: 1, currentOffer: 11500 })
    expect(result.facts).toContainEqual({
      kind: 'NegotiationResult',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      accepted: false,
      offer: 11500,
      final: false,
    })
  })

  it('marks the last round as final', () => {
    const late = { ...idle, negotiation: { 'robe-rouge': { round: 3, currentOffer: 10000 } } }
    const result = run(
      { intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }], counterOffer: 5000 },
      late,
    )
    expect(result.facts.some((f) => f.kind === 'NegotiationResult' && f.final)).toBe(true)
  })

  it('treats a negotiation without a counter offer as a price question', () => {
    const result = run({ intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }] })
    expect(result.facts.some((f) => f.kind === 'PriceQuoted')).toBe(true)
    expect(result.state.negotiation['robe-rouge']).toBeUndefined()
  })

  it('carries the agreed offer into the cart', () => {
    const negotiated = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'robe-rouge' }],
      counterOffer: 11500,
    }).state
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 1 }] },
      negotiated,
    )
    expect(result.state.cart[0]?.agreedPrice).toBe(11500)
  })

  it('quotes delivery for a known zone, case and accent insensitive', () => {
    const result = run({ intent: 'ask_delivery', ...noRefs, zone: 'je suis à CALAVI' })
    expect(result.facts).toContainEqual({
      kind: 'DeliveryQuoted',
      zone: 'Calavi',
      fee: 1500,
      delayHours: 24,
    })
  })

  it('reports ZoneUnknown for an unlisted zone', () => {
    const result = run({ intent: 'ask_delivery', ...noRefs, zone: 'Ouagadougou' })
    expect(result.facts).toContainEqual({
      kind: 'ZoneUnknown',
      zones: ['Cotonou', 'Calavi', 'Porto-Novo'],
    })
  })

  it('stores the address and its zone', () => {
    const result = run({
      intent: 'give_address',
      ...noRefs,
      address: 'Fidjrossè carrefour, Cotonou',
    })
    expect(result.state.phase).toBe('address')
    expect(result.state.address).toEqual({ text: 'Fidjrossè carrefour, Cotonou', zone: 'Cotonou' })
  })

  it('stores an address with no recognised zone', () => {
    const result = run({ intent: 'give_address', ...noRefs, address: 'derrière le marché' })
    expect(result.state.address).toEqual({ text: 'derrière le marché' })
    expect(result.facts.some((f) => f.kind === 'ZoneUnknown')).toBe(true)
  })

  it('asks for the address before confirming', () => {
    const result = run({ intent: 'confirm_order', ...noRefs }, cartWithRobe(1))
    expect(result.state.phase).toBe('address')
    expect(result.facts).toContainEqual({ kind: 'AddressNeeded' })
  })

  it('confirms an order and emits OrderConfirmed', () => {
    const withAddress = run(
      { intent: 'give_address', ...noRefs, address: 'Fidjrossè, Cotonou' },
      cartWithRobe(2),
    ).state
    const result = run({ intent: 'confirm_order', ...noRefs }, withAddress)

    expect(result.state.phase).toBe('confirmed')
    const event = result.events.find((e) => e.type === 'OrderConfirmed')
    expect(event?.type === 'OrderConfirmed' && event.order).toMatchObject({
      orderId: `pilot:c1:${at}`,
      subtotal: 24000,
      deliveryFee: 1000,
      total: 25000,
      paymentMethod: 'cash_on_delivery',
    })
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([24000, 1000, 25000]))
  })

  it('computes the deposit for a made-to-order line', () => {
    const cart = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'tenue-mesure', quantity: 1 }],
    }).state
    const withAddress = run({ intent: 'give_address', ...noRefs, address: 'Cotonou' }, cart).state
    const result = run({ intent: 'confirm_order', ...noRefs }, withAddress)
    const event = result.events.find((e) => e.type === 'OrderConfirmed')
    expect(event?.type === 'OrderConfirmed' && event.order.depositAmount).toBe(12500)
  })

  it('refuses to confirm an empty cart', () => {
    const result = run({ intent: 'confirm_order', ...noRefs })
    expect(result.state.phase).toBe('browsing')
    expect(result.facts).toContainEqual({ kind: 'Unclear' })
  })

  it('cancels and empties the cart', () => {
    const result = run({ intent: 'cancel', ...noRefs }, cartWithRobe(1))
    expect(result.state.phase).toBe('cancelled')
    expect(result.state.cart).toEqual([])
    expect(result.facts).toContainEqual({ kind: 'OrderCancelled' })
  })

  it('reports off topic without changing the phase', () => {
    const result = run({ intent: 'off_topic', ...noRefs }, cartWithRobe(1))
    expect(result.state.phase).toBe('cart')
    expect(result.facts).toContainEqual({ kind: 'OffTopic' })
  })

  it('emits IntentUnclear with the customer text', () => {
    const result = run({ intent: 'unclear', ...noRefs }, idle, 'zzzz')
    expect(result.events).toContainEqual({ type: 'IntentUnclear', at, text: 'zzzz' })
  })

  it('reports an empty catalogue', () => {
    const empty = {
      ...pilotProfile,
      catalogue: [],
      negotiation: { ...pilotProfile.negotiation, perProduct: {}, quantityDiscounts: [] },
    }
    const result = transition({
      profile: empty,
      state: idle,
      intent: { intent: 'browse', ...noRefs },
      text: 'vous avez quoi',
      receivedAt: at,
    })
    expect(result.facts).toContainEqual({ kind: 'CatalogueEmpty' })
    expect(result.events).toContainEqual({ type: 'CatalogueEmpty', at, merchantId: 'pilot' })
  })

  it('restores an expired conversation before applying the intent', () => {
    const stale = { ...cartWithRobe(1), lastActivityAt: '2026-09-01T10:00:00.000Z' }
    const result = run({ intent: 'greet', ...noRefs }, stale, 'bonsoir')
    expect(result.state.cart).toEqual([])
    expect(result.state.turns).toEqual([{ role: 'customer', text: 'bonsoir', at }])
  })
})
