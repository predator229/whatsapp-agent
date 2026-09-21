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
 * Résout un tour où le bot quote `quoted` : le client gagne si son offre couvre la quote,
 * auquel cas la vente est enregistrée à SON prix (jamais moins avantageux pour le commerçant
 * que ce qu'il a demandé). `reason` est dérivé de la quote, jamais de `offer`.
 */
function resolveQuote(
  quoted: number,
  reason: NegotiationReason,
  counterOffer: number,
  round: number,
): NegotiationOutcome {
  const accepted = counterOffer >= quoted
  return { accepted, offer: accepted ? counterOffer : quoted, round: round + 1, reason }
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
    return resolveQuote(effectiveFloor, 'max_rounds', counterOffer, round)
  }

  const step = rule.steps[round] ?? effectiveFloor
  const quoted = Math.max(effectiveFloor, Math.min(step, base))
  const reason = quoted === effectiveFloor ? 'floor_reached' : 'counter_offer'
  return resolveQuote(quoted, reason, counterOffer, round)
}
