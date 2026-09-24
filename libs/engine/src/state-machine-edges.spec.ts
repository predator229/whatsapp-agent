import { describe, expect, it } from 'vitest'
import {
  newConversationState,
  pilotProfile,
  type CartLine,
  type ConversationState,
} from '@wa/domain'
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

/** Gèle récursivement : en module ESM (strict mode), toute mutation lèvera. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value as object).forEach((child) => deepFreeze(child))
    Object.freeze(value)
  }
  return value
}

const emptyCatalogue = {
  ...pilotProfile,
  catalogue: [],
  negotiation: { ...pilotProfile.negotiation, perProduct: {}, quantityDiscounts: [] },
}

const staleLine: CartLine = {
  productId: 'ancien-sac',
  variantId: 'u',
  quantity: 1,
  unitPrice: 5000,
  agreedPrice: 5000,
}

describe('transition — cas limites hors tableau', () => {
  it('reports OutOfScope when adding an unknown product and leaves the cart alone', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'inconnu', quantity: 1 }],
    })
    expect(result.facts).toContainEqual({ kind: 'OutOfScope', query: 'inconnu' })
    expect(result.state.cart).toEqual([])
    expect(result.facts.some((f) => f.kind === 'CartUpdated')).toBe(false)
  })

  it('empties the cart when no product is named', () => {
    const result = run({ intent: 'remove_from_cart', ...noRefs }, cartWithRobe(2))
    expect(result.state.cart).toEqual([])
    expect(result.state.phase).toBe('browsing')
    expect(result.facts).toContainEqual({ kind: 'CartUpdated', lines: [], subtotal: 0 })
  })

  it('drops a fractional line decremented to exactly zero and keeps the others', () => {
    const mixed = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'gari', quantity: 1.5 }] },
      cartWithRobe(1),
    ).state
    expect(mixed.cart).toHaveLength(2)
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'gari', quantity: 1.5 }] },
      mixed,
    )
    expect(result.state.cart.map((l) => l.productId)).toEqual(['robe-rouge'])
    expect(result.state.phase).toBe('cart')
  })

  it('leaves the cart untouched when removing a product it does not hold', () => {
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'gari' }] },
      cartWithRobe(2),
    )
    expect(result.state.cart[0]?.quantity).toBe(2)
  })

  it('still removes a line whose product has left the catalogue', () => {
    const stale: ConversationState = { ...idle, phase: 'cart', cart: [staleLine] }
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'ancien-sac', variantId: 'u' }] },
      stale,
    )
    expect(result.state.cart).toEqual([])
  })

  it('falls back to the productId as label when the product has left the catalogue', () => {
    const stale: ConversationState = {
      ...idle,
      phase: 'cart',
      cart: [staleLine],
      address: { text: 'Cotonou', zone: 'Cotonou' },
    }
    const result = run({ intent: 'confirm_order', ...noRefs }, stale)
    const summary = result.facts.find((f) => f.kind === 'OrderSummary')
    expect(summary?.kind === 'OrderSummary' && summary.order.lines[0]?.label).toBe('ancien-sac')
    expect(summary?.kind === 'OrderSummary' && summary.order.depositAmount).toBeUndefined()
  })

  it('reports OutOfScope when negotiating an unknown product', () => {
    const result = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'inconnu' }],
      counterOffer: 100,
    })
    expect(result.facts).toContainEqual({ kind: 'OutOfScope', query: 'inconnu' })
    expect(result.state.phase).toBe('idle')
  })

  it('requotes a conceded price, not the listed one, when no counter offer is made', () => {
    const negotiated = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'robe-rouge' }],
      counterOffer: 9000,
    }).state
    expect(negotiated.negotiation['robe-rouge']).toEqual({ round: 1, currentOffer: 11500 })

    const result = run(
      { intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }] },
      negotiated,
    )
    expect(result.facts).toContainEqual({
      kind: 'PriceQuoted',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      price: 11500,
      stock: 3,
    })
    expect(result.allowedNumbers).toContain(11500)
    expect(result.allowedNumbers).not.toContain(12000)
    // Requoter ne consomme pas un tour de négociation.
    expect(result.state.negotiation['robe-rouge']).toEqual({ round: 1, currentOffer: 11500 })
  })

  it('asks again when the stored address has no known zone', () => {
    const vague = run(
      { intent: 'give_address', ...noRefs, address: 'derrière le marché' },
      cartWithRobe(1),
    ).state
    const result = run({ intent: 'confirm_order', ...noRefs }, vague)
    expect(result.state.phase).toBe('address')
    expect(result.facts).toContainEqual({ kind: 'AddressNeeded' })
  })

  it('reads the zone from a free-form address for a delivery question', () => {
    const result = run({ intent: 'ask_delivery', ...noRefs, address: 'je suis vers porto-novo' })
    expect(result.facts).toContainEqual({
      kind: 'DeliveryQuoted',
      zone: 'Porto-Novo',
      fee: 2500,
      delayHours: 48,
    })
  })

  it('lists the served zones when the delivery question names none', () => {
    const result = run({ intent: 'ask_delivery', ...noRefs })
    expect(result.facts).toContainEqual({
      kind: 'ZoneUnknown',
      zones: ['Cotonou', 'Calavi', 'Porto-Novo'],
    })
  })

  it('accepts a bare zone as the address', () => {
    const result = run({ intent: 'give_address', ...noRefs, zone: 'Calavi' })
    expect(result.state.address).toEqual({ text: 'Calavi', zone: 'Calavi' })
  })

  it('asks for an address when the intent carries none', () => {
    const result = run({ intent: 'give_address', ...noRefs })
    expect(result.state.phase).toBe('address')
    expect(result.state.address).toBeUndefined()
    expect(result.facts).toContainEqual({ kind: 'AddressNeeded' })
  })

  it('still allows cancelling when the catalogue is empty', () => {
    const result = transition({
      profile: emptyCatalogue,
      state: idle,
      intent: { intent: 'cancel', ...noRefs },
      text: 'laisse tomber',
      receivedAt: at,
    })
    expect(result.facts).toContainEqual({ kind: 'OrderCancelled' })
    expect(result.facts.some((f) => f.kind === 'CatalogueEmpty')).toBe(false)
  })

  it('browses at most five products', () => {
    const result = run({ intent: 'browse', ...noRefs })
    expect(result.state.phase).toBe('browsing')
    const found = result.facts.find((f) => f.kind === 'ProductsFound')
    expect(found?.kind === 'ProductsFound' && found.products.length).toBe(4)
    expect(result.allowedPhrases).toContain('Chaussure noire Pointure 40')
  })

  it('adds a single unit when the intent gives no quantity', () => {
    const result = run({ intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge' }] })
    expect(result.state.cart[0]?.quantity).toBe(1)
  })

  it('merges one line of a multi-line cart and leaves the others alone', () => {
    const mixed = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'gari', quantity: 2 }] },
      cartWithRobe(1),
    ).state
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'gari', quantity: 1 }] },
      mixed,
    )
    expect(result.state.cart.map((l) => [l.productId, l.quantity])).toEqual([
      ['robe-rouge', 1],
      ['gari', 3],
    ])
  })

  it('mutates nothing in a deeply frozen state', () => {
    const negotiated = deepFreeze(
      run(
        { intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }], counterOffer: 11500 },
        cartWithRobe(2),
      ).state,
    )

    expect(() =>
      run(
        { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge', quantity: 1 }] },
        negotiated,
      ),
    ).not.toThrow()
    expect(() =>
      run(
        { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 1 }] },
        negotiated,
      ),
    ).not.toThrow()
    expect(() =>
      run(
        { intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }], counterOffer: 10000 },
        negotiated,
      ),
    ).not.toThrow()

    const addressed = deepFreeze(
      run({ intent: 'give_address', ...noRefs, address: 'Fidjrossè, Cotonou' }, negotiated).state,
    )
    expect(() => run({ intent: 'confirm_order', ...noRefs }, addressed)).not.toThrow()

    expect(negotiated.cart[0]?.quantity).toBe(2)
    expect(negotiated.negotiation['robe-rouge']).toEqual({ round: 1, currentOffer: 11500 })
    expect(negotiated.address).toBeUndefined()
  })
})
