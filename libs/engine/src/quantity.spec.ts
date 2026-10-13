import { describe, expect, it } from 'vitest'
import {
  CartLineSchema,
  OrderLineSchema,
  newConversationState,
  type ConversationState,
} from '@wa/domain'
import { pilotProfile } from '@wa/domain/testing'
import { transition } from './state-machine'
import { IntentSchema, type Intent } from './intent-schema'
import { MAX_LINE_QUANTITY, isSaneQuantity, isWholeSteps } from './quantity'

const at = '2026-09-21T10:00:00.000Z'
const idle = newConversationState(pilotProfile.merchantId, 'c1', at)
const noRefs = { productRefs: [] }
const product = (id: string) => pilotProfile.catalogue.find((p) => p.productId === id)!

function run(intent: Intent, state: ConversationState = idle) {
  return transition({ profile: pilotProfile, state, intent, text: 'msg', receivedAt: at })
}

function add(productId: string, quantity: number, state: ConversationState = idle) {
  return run({ intent: 'add_to_cart', productRefs: [{ productId, quantity }] }, state)
}

const invalid = (productId: string, name: string, step: number) => ({
  kind: 'QuantityInvalid',
  productId,
  name,
  step,
  max: MAX_LINE_QUANTITY,
})

describe('quantity helpers', () => {
  it('accepts whole pieces and bulk multiples of the step only', () => {
    expect(isWholeSteps(product('robe-rouge'), 2)).toBe(true)
    expect(isWholeSteps(product('robe-rouge'), 0.01)).toBe(false)
    expect(isWholeSteps(product('gari'), 1.5)).toBe(true)
    expect(isWholeSteps(product('gari'), 1.3)).toBe(false)
    expect(isWholeSteps(product('gari'), 0.1 + 0.2 + 1.2)).toBe(true)
    expect(isWholeSteps(product('robe-rouge'), Number.POSITIVE_INFINITY)).toBe(false)
    expect(isWholeSteps(product('robe-rouge'), Number.NaN)).toBe(false)
    expect(isWholeSteps(product('robe-rouge'), 0)).toBe(false)
  })

  it('bounds any quantity to a finite positive value under the cap', () => {
    expect(isSaneQuantity(1)).toBe(true)
    expect(isSaneQuantity(MAX_LINE_QUANTITY + 1)).toBe(false)
    expect(isSaneQuantity(-1)).toBe(false)
    expect(isSaneQuantity(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('quantity contract at the boundaries', () => {
  it('rejects infinite, NaN, zero and negative quantities in the intent', () => {
    const overflow: unknown = JSON.parse(
      '{"intent":"add_to_cart","productRefs":[{"productId":"robe-rouge","quantity":1e999}]}',
    )
    expect(IntentSchema.safeParse(overflow).success).toBe(false)
    for (const quantity of [Number.NaN, 0, -1]) {
      const intent = { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity }] }
      expect(IntentSchema.safeParse(intent).success).toBe(false)
    }
  })

  it('rejects infinite quantities in cart and order lines', () => {
    const line = { productId: 'gari', quantity: Infinity, unitPrice: 600, agreedPrice: 600 }
    expect(CartLineSchema.safeParse(line).success).toBe(false)
    expect(OrderLineSchema.safeParse({ ...line, label: 'Gari (kg)' }).success).toBe(false)
  })
})

describe('add_to_cart — quantities by product kind', () => {
  it('refuses a fraction of a shoe (8000 XOF sold for 80 XOF)', () => {
    const result = add('chaussure-noire', 0.01)
    expect(result.facts).toEqual([invalid('chaussure-noire', 'Chaussure noire Pointure 40', 1)])
    expect(result.state.cart).toEqual([])
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([1, MAX_LINE_QUANTITY]))
    expect(result.allowedPhrases).toContain('Chaussure noire Pointure 40')
  })

  it('never turns the 0.01 shoe into an order', () => {
    const cart = add('chaussure-noire', 0.01).state
    const addressed = run({ intent: 'give_address', ...noRefs, address: 'Cotonou' }, cart).state
    const result = run({ intent: 'confirm_order', ...noRefs }, addressed)
    expect(result.events).toEqual([])
    expect(result.facts.some((f) => f.kind === 'OrderSummary')).toBe(false)
  })

  it('refuses half a dress and half a made-to-order outfit', () => {
    expect(add('robe-rouge', 1.5).facts).toEqual([invalid('robe-rouge', 'Robe rouge Taille M', 1)])
    expect(add('tenue-mesure', 2.5).facts).toEqual([invalid('tenue-mesure', 'Tenue sur mesure', 1)])
  })

  it('sells bulk by multiples of its step', () => {
    expect(add('gari', 1.5).state.cart).toMatchObject([{ productId: 'gari', quantity: 1.5 }])
    expect(add('gari', 1.3).facts).toEqual([invalid('gari', 'Gari (kg)', 0.5)])
  })

  it('caps an unlimited-stock line, cumulated quantity included', () => {
    expect(add('chaussure-noire', MAX_LINE_QUANTITY + 1).facts).toEqual([
      invalid('chaussure-noire', 'Chaussure noire Pointure 40', 1),
    ])
    const full = add('chaussure-noire', MAX_LINE_QUANTITY).state
    expect(full.cart).toHaveLength(1)
    expect(add('chaussure-noire', 1, full).state.cart).toEqual(full.cart)
  })

  it('judges the requested quantity itself, not only the cumulated one', () => {
    const one = add('robe-rouge', 1).state
    const result = add('robe-rouge', 0.5, one)
    expect(result.facts).toEqual([invalid('robe-rouge', 'Robe rouge Taille M', 1)])
    expect(result.state.cart).toEqual(one.cart)
  })
})

describe('remove_from_cart — quantities by product kind', () => {
  it('leaves the line untouched when removing a fraction of a piece', () => {
    const two = add('robe-rouge', 2).state
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge', quantity: 0.5 }] },
      two,
    )
    expect(result.state.cart).toEqual(two.cart)
  })
})

describe('confirm_order — quantity backstop on a persisted cart', () => {
  const addressed = (cart: ConversationState['cart']): ConversationState => ({
    ...idle,
    phase: 'cart',
    cart,
    address: { text: 'Cotonou', zone: 'Cotonou' },
  })

  it('refuses a cart line that bypassed add_to_cart', () => {
    const tampered = addressed([
      {
        productId: 'chaussure-noire',
        variantId: '40',
        quantity: 0.01,
        unitPrice: 8000,
        agreedPrice: 8000,
      },
    ])
    const result = run({ intent: 'confirm_order', ...noRefs }, tampered)
    expect(result.facts).toEqual([invalid('chaussure-noire', 'Chaussure noire Pointure 40', 1)])
    expect(result.events).toEqual([])
    expect(result.state.phase).toBe('cart')
  })

  it('refuses an insane quantity on a product that left the catalogue', () => {
    const tampered = addressed([
      {
        productId: 'ancien-sac',
        variantId: 'u',
        quantity: Infinity,
        unitPrice: 5000,
        agreedPrice: 5000,
      },
    ])
    const result = run({ intent: 'confirm_order', ...noRefs }, tampered)
    expect(result.facts).toEqual([invalid('ancien-sac', 'ancien-sac', 1)])
    expect(result.events).toEqual([])
  })
})
