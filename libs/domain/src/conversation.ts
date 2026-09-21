import { z } from 'zod'

export const MAX_TURNS = 12
export const STATE_EXPIRY_HOURS = 72
export const CART_RETENTION_DAYS = 7

const isoDateTime = z.string().datetime()
const price = z.number().int().nonnegative()

export const ConversationPhaseSchema = z.enum([
  'idle',
  'browsing',
  'negotiating',
  'cart',
  'address',
  'confirmed',
  'cancelled',
])

export const ConversationTurnSchema = z.object({
  role: z.enum(['customer', 'bot']),
  text: z.string(),
  at: isoDateTime,
})

export const CartLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().positive(),
  unitPrice: price,
  agreedPrice: price,
})

export const ConversationStateSchema = z.object({
  merchantId: z.string().min(1),
  customerId: z.string().min(1),
  phase: ConversationPhaseSchema,
  turns: z.array(ConversationTurnSchema).max(MAX_TURNS),
  cart: z.array(CartLineSchema),
  negotiation: z.record(z.object({ round: z.number().int().nonnegative(), currentOffer: price })),
  address: z.object({ text: z.string().min(1), zone: z.string().min(1).optional() }).optional(),
  lastActivityAt: isoDateTime,
})

export type ConversationPhase = z.infer<typeof ConversationPhaseSchema>
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>
export type CartLine = z.infer<typeof CartLineSchema>
export type ConversationState = z.infer<typeof ConversationStateSchema>

export function newConversationState(
  merchantId: string,
  customerId: string,
  at: string,
): ConversationState {
  return {
    merchantId,
    customerId,
    phase: 'idle',
    turns: [],
    cart: [],
    negotiation: {},
    lastActivityAt: at,
  }
}

/** Ajoute un tour et garde la fenêtre glissante des `MAX_TURNS` derniers. */
export function appendTurn(state: ConversationState, turn: ConversationTurn): ConversationState {
  return { ...state, turns: [...state.turns, turn].slice(-MAX_TURNS), lastActivityAt: turn.at }
}

const HOUR_MS = 3_600_000

function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / HOUR_MS
}

/**
 * Applique les péremptions : conversation remise à `idle` après 72 h sans message,
 * panier vidé après 7 jours. `now` est fourni par l'appelant (le moteur n'a pas d'horloge).
 */
export function expireConversation(state: ConversationState, now: string): ConversationState {
  const idleHours = hoursBetween(state.lastActivityAt, now)
  if (idleHours <= STATE_EXPIRY_HOURS) return state
  const cart = idleHours > CART_RETENTION_DAYS * 24 ? [] : state.cart
  return { ...state, phase: 'idle', turns: [], negotiation: {}, address: undefined, cart }
}

export const ReplyCounterSchema = z.object({
  merchantId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  replies: z.number().int().nonnegative(),
})

export type ReplyCounter = z.infer<typeof ReplyCounterSchema>

/** Période de facturation `YYYY-MM` en UTC. */
export function periodOf(iso: string): string {
  return iso.slice(0, 7)
}

export function incrementCounter(counter: ReplyCounter, at: string): ReplyCounter {
  const period = periodOf(at)
  return period === counter.period
    ? { ...counter, replies: counter.replies + 1 }
    : { merchantId: counter.merchantId, period, replies: 1 }
}
