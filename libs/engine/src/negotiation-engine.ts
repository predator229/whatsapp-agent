import type { NegotiationPolicy, Product } from '@wa/domain'

export interface NegotiationInput {
  readonly policy: NegotiationPolicy
  readonly product: Product
  readonly listedPrice: number
  readonly quantity: number
  readonly counterOffer: number
  readonly round: number
}

export type NegotiationReason =
  'not_negotiable' | 'accepted_customer_offer' | 'counter_offer' | 'floor_reached' | 'max_rounds'

export interface NegotiationOutcome {
  readonly accepted: boolean
  readonly offer: number
  readonly round: number
  readonly reason: NegotiationReason
}

/** Prix unitaire après la meilleure remise quantité applicable. Arrondi à l'entier XOF. */
export function applyQuantityDiscount(
  policy: NegotiationPolicy,
  productId: string,
  quantity: number,
  listedPrice: number,
): number {
  const best = policy.quantityDiscounts
    .filter((d) => d.productId === productId && quantity >= d.minQuantity)
    .reduce<number>((max, d) => Math.max(max, d.percentOff), 0)
  return Math.round(listedPrice * (1 - best / 100))
}

/**
 * Évalue une contre-offre client. Fonction pure : la politique et le produit viennent du
 * profil, `round` vient de `ConversationState.negotiation[productId]`.
 */
export function evaluateNegotiation(input: NegotiationInput): NegotiationOutcome {
  const { policy, product, listedPrice, quantity, counterOffer, round } = input
  const base = applyQuantityDiscount(policy, product.productId, quantity, listedPrice)
  const rule = policy.perProduct[product.productId]

  if (!policy.enabled || !rule) {
    return {
      accepted: counterOffer >= base,
      offer: base,
      round,
      reason: 'not_negotiable',
    }
  }

  if (counterOffer >= base) {
    return { accepted: true, offer: base, round, reason: 'accepted_customer_offer' }
  }

  const effectiveFloor = Math.min(rule.floorPrice, base)

  if (round >= policy.maxRounds) {
    return { accepted: false, offer: effectiveFloor, round: round + 1, reason: 'max_rounds' }
  }

  const step = rule.steps[round] ?? effectiveFloor
  const offer = Math.max(effectiveFloor, Math.min(step, base))
  return {
    accepted: counterOffer >= offer,
    offer,
    round: round + 1,
    reason: offer === effectiveFloor ? 'floor_reached' : 'counter_offer',
  }
}
