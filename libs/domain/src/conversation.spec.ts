import { describe, expect, it } from 'vitest'
import {
  appendTurn,
  ConversationStateSchema,
  expireConversation,
  incrementCounter,
  MAX_TURNS,
  newConversationState,
  periodOf,
  ReplyCounterSchema,
} from './conversation'

const at = '2026-09-21T10:00:00.000Z'

describe('newConversationState', () => {
  it('starts idle, empty and parseable', () => {
    const state = newConversationState('m1', 'c1', at)
    expect(state.phase).toBe('idle')
    expect(state.turns).toEqual([])
    expect(state.cart).toEqual([])
    expect(ConversationStateSchema.parse(state)).toEqual(state)
  })
})

describe('appendTurn', () => {
  it('does not mutate the input state', () => {
    const state = newConversationState('m1', 'c1', at)
    appendTurn(state, { role: 'customer', text: 'bonsoir', at })
    expect(state.turns).toEqual([])
  })

  it('keeps only the last MAX_TURNS turns', () => {
    const turns = Array.from({ length: MAX_TURNS + 3 }, (_, i) => ({
      role: 'customer' as const,
      text: `msg ${i}`,
      at,
    }))
    const state = turns.reduce(appendTurn, newConversationState('m1', 'c1', at))
    expect(state.turns).toHaveLength(MAX_TURNS)
    expect(state.turns[0]?.text).toBe('msg 3')
  })

  it('updates lastActivityAt', () => {
    const later = '2026-09-21T11:00:00.000Z'
    const state = appendTurn(newConversationState('m1', 'c1', at), {
      role: 'customer',
      text: 'hi',
      at: later,
    })
    expect(state.lastActivityAt).toBe(later)
  })
})

describe('expireConversation', () => {
  const withCart = {
    ...newConversationState('m1', 'c1', at),
    phase: 'cart' as const,
    cart: [{ productId: 'p1', quantity: 1, unitPrice: 1000, agreedPrice: 1000 }],
    turns: [{ role: 'customer' as const, text: 'hi', at }],
  }

  it('leaves a fresh conversation untouched', () => {
    const now = '2026-09-24T09:00:00.000Z' // 71 h
    expect(expireConversation(withCart, now)).toEqual(withCart)
  })

  it('resets phase and turns after 72 h but keeps the cart', () => {
    const now = '2026-09-24T11:00:00.000Z' // 73 h
    const expired = expireConversation(withCart, now)
    expect(expired.phase).toBe('idle')
    expect(expired.turns).toEqual([])
    expect(expired.cart).toEqual(withCart.cart)
    expect(expired.negotiation).toEqual({})
  })

  it('drops the cart after 7 days', () => {
    const now = '2026-09-29T10:00:01.000Z' // 8 jours
    expect(expireConversation(withCart, now).cart).toEqual([])
  })
})

describe('reply counter', () => {
  it('derives the period from an ISO timestamp', () => {
    expect(periodOf('2026-09-21T10:00:00.000Z')).toBe('2026-09')
  })

  it('increments within the same period', () => {
    const counter = ReplyCounterSchema.parse({ merchantId: 'm1', period: '2026-09', replies: 4 })
    expect(incrementCounter(counter, at)).toEqual({ ...counter, replies: 5 })
  })

  it('resets when the period changes', () => {
    const counter = ReplyCounterSchema.parse({ merchantId: 'm1', period: '2026-08', replies: 900 })
    expect(incrementCounter(counter, at)).toEqual({
      merchantId: 'm1',
      period: '2026-09',
      replies: 1,
    })
  })
})
