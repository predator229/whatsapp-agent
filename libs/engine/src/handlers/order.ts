import { orderTotal, type MerchantProfile, type Order, type OrderLine } from '@wa/domain'
import { resolveProductRef } from '../catalogue'
import { findZone, zoneCandidate, zoneFact, type Ctx, type Draft } from './shared'

const PERCENT = 100

/** Adresse libre reprise du client : `zone` explicite à défaut de texte d'adresse. */
function addressText(ctx: Ctx): string {
  return (ctx.intent.address ?? ctx.intent.zone ?? '').trim()
}

/**
 * L'adresse est toujours conservée telle que le client l'a dite ; la zone n'est
 * inscrite que si le profil la dessert, car elle porte le tarif de livraison.
 */
export function handleGiveAddress(ctx: Ctx): Draft {
  const text = addressText(ctx)
  if (text === '') {
    return {
      state: { ...ctx.state, phase: 'address' },
      facts: [{ kind: 'AddressNeeded' }],
      events: [],
    }
  }
  const zone = findZone(ctx.profile, zoneCandidate(ctx.intent))
  return {
    state: {
      ...ctx.state,
      phase: 'address',
      address: { text, ...(zone ? { zone: zone.name } : {}) },
    },
    facts: [zoneFact(ctx.profile, zone)],
    events: [],
  }
}

/** Acompte dû : seules les lignes `madeToOrder` en produisent un. */
function depositFor(profile: MerchantProfile, lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => {
    const product = profile.catalogue.find((p) => p.productId === line.productId)
    if (product?.pricing.kind !== 'madeToOrder') return sum
    return (
      sum +
      Math.round((line.agreedPrice * line.quantity * product.pricing.depositPercent) / PERCENT)
    )
  }, 0)
}

export function handleConfirmOrder(ctx: Ctx): Draft {
  const { state, profile, receivedAt } = ctx
  if (state.cart.length === 0) {
    return { state: { ...state, phase: 'browsing' }, facts: [{ kind: 'Unclear' }], events: [] }
  }
  const zone = findZone(profile, state.address?.zone ?? state.address?.text)
  if (!state.address || !zone) {
    return { state: { ...state, phase: 'address' }, facts: [{ kind: 'AddressNeeded' }], events: [] }
  }

  const lines: OrderLine[] = state.cart.map((line) => ({
    ...line,
    label: resolveProductRef(profile, line)?.label ?? line.productId,
  }))
  const { subtotal, total } = orderTotal(lines, zone.fee)
  const deposit = depositFor(profile, lines)
  const order: Order = {
    orderId: `${state.merchantId}:${state.customerId}:${receivedAt}`,
    merchantId: state.merchantId,
    customerId: state.customerId,
    lines,
    subtotal,
    deliveryFee: zone.fee,
    total,
    address: { text: state.address.text, zone: zone.name },
    paymentMethod: profile.delivery.paymentMethods[0]!,
    ...(deposit > 0 ? { depositAmount: deposit } : {}),
    createdAt: receivedAt,
  }
  return {
    state: { ...state, phase: 'confirmed' },
    facts: [{ kind: 'OrderSummary', order }],
    events: [{ type: 'OrderConfirmed', at: receivedAt, order }],
  }
}

export function handleCancel(ctx: Ctx): Draft {
  return {
    state: { ...ctx.state, phase: 'cancelled', cart: [] },
    facts: [{ kind: 'OrderCancelled' }],
    events: [],
  }
}

export function handleOffTopic(ctx: Ctx): Draft {
  return { state: ctx.state, facts: [{ kind: 'OffTopic' }], events: [] }
}

export function handleUnclear(ctx: Ctx): Draft {
  return {
    state: ctx.state,
    facts: [{ kind: 'Unclear' }],
    events: [{ type: 'IntentUnclear', at: ctx.receivedAt, text: ctx.text }],
  }
}
