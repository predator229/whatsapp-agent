import { describe, expect, it } from 'vitest'
import {
  ConversationStateSchema,
  expireConversation,
  newConversationState,
  type ConversationState,
} from '@wa/domain'
import { pilotProfile } from '@wa/domain/testing'
import { transition } from './state-machine'
import type { Intent } from './intent-schema'

const at = '2026-09-21T10:00:00.000Z'
const later = '2026-09-21T10:05:00.000Z'
const idle = newConversationState(pilotProfile.merchantId, 'c1', at)
const noRefs = { productRefs: [] }
const confirm: Intent = { intent: 'confirm_order', ...noRefs }

function run(intent: Intent, state: ConversationState, receivedAt = at) {
  return transition({ profile: pilotProfile, state, intent, text: 'msg', receivedAt })
}

function addressedCart(productId = 'robe-rouge'): ConversationState {
  const cart = run({ intent: 'add_to_cart', productRefs: [{ productId, quantity: 1 }] }, idle).state
  return run({ intent: 'give_address', ...noRefs, address: 'Cotonou' }, cart).state
}

const orderOf = (result: ReturnType<typeof run>) =>
  result.events.flatMap((e) => (e.type === 'OrderConfirmed' ? [e.order] : []))

describe('confirm_order — idempotence', () => {
  it('emits OrderConfirmed once, then recalls the same order without an event', () => {
    const first = run(confirm, addressedCart())
    const [order] = orderOf(first)
    expect(order?.orderId).toBe(`pilot:c1:${at}`)
    expect(first.state).toMatchObject({ phase: 'confirmed', cart: [], negotiation: {} })
    expect(first.state.confirmedOrder).toEqual(order)
    expect(ConversationStateSchema.safeParse(first.state).success).toBe(true)

    const second = run(confirm, first.state, later)
    expect(second.events).toEqual([])
    expect(second.facts).toEqual([{ kind: 'OrderSummary', order }])
    expect(second.state.confirmedOrder?.orderId).toBe(order?.orderId)
  })

  it('opens a fresh order after confirmation, without the old lines', () => {
    const confirmed = run(confirm, addressedCart('robe-rouge')).state
    const next = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'chaussure-noire', quantity: 1 }] },
      confirmed,
      later,
    ).state
    expect(next.cart.map((l) => l.productId)).toEqual(['chaussure-noire'])

    const [order] = orderOf(run(confirm, next, later))
    expect(order?.orderId).toBe(`pilot:c1:${later}`)
    expect(order?.lines.map((l) => l.productId)).toEqual(['chaussure-noire'])
  })

  it('treats a legacy confirmed state without stored order as a regular confirmation', () => {
    const legacy: ConversationState = { ...addressedCart(), phase: 'confirmed' }
    expect(orderOf(run(confirm, legacy))).toHaveLength(1)
    const emptied: ConversationState = { ...legacy, cart: [] }
    expect(run(confirm, emptied).facts).toEqual([{ kind: 'Unclear' }])
  })

  it('forgets the stored order when the conversation expires', () => {
    const confirmed = run(confirm, addressedCart()).state
    expect(expireConversation(confirmed, '2026-10-01T10:00:00.000Z').confirmedOrder).toBeUndefined()
  })
})
