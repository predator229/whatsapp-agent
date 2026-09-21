import { resolveProductRef, type ResolvedProduct } from '../catalogue'
import { evaluateNegotiation, type NegotiationOutcome } from '../negotiation-engine'
import type { TurnFact } from '../facts'
import { currentPrice, emptyDraft, priceFact, withFact, type Ctx, type Draft } from './shared'

/** Le commerçant a dit son dernier mot : plus rien à concéder après ce tour. */
function isFinal(outcome: NegotiationOutcome): boolean {
  return outcome.reason === 'max_rounds' || outcome.reason === 'floor_reached'
}

function negotiateRef(ctx: Ctx, draft: Draft, resolved: ResolvedProduct, offer: number): Draft {
  const productId = resolved.product.productId
  const outcome = evaluateNegotiation({
    policy: ctx.profile.negotiation,
    product: resolved.product,
    listedPrice: resolved.unitPrice,
    quantity: ctx.intent.productRefs[0]?.quantity ?? 1,
    counterOffer: offer,
    round: draft.state.negotiation[productId]?.round ?? 0,
  })
  const fact: TurnFact = {
    kind: 'NegotiationResult',
    productId,
    name: resolved.label,
    accepted: outcome.accepted,
    offer: outcome.offer,
    final: isFinal(outcome),
  }
  return {
    state: {
      ...draft.state,
      phase: 'negotiating',
      negotiation: {
        ...draft.state.negotiation,
        [productId]: { round: outcome.round, currentOffer: outcome.offer },
      },
    },
    facts: [...draft.facts, fact],
    events: draft.events,
  }
}

/**
 * Sans contre-offre, c'est une question de prix déguisée : on requote AU PRIX COURANT
 * (l'offre déjà concédée, pas le tarif affiché) sans consommer un tour de négociation. Avec contre-offre, `evaluateNegotiation` tranche.
 */
export function handleNegotiate(ctx: Ctx): Draft {
  const { counterOffer } = ctx.intent
  return ctx.intent.productRefs.reduce<Draft>((draft, ref) => {
    const resolved = resolveProductRef(ctx.profile, ref)
    if (!resolved) return withFact(draft, { kind: 'OutOfScope', query: ref.productId })
    if (counterOffer === undefined)
      return withFact(draft, priceFact(resolved, currentPrice(draft.state, resolved)))
    return negotiateRef(ctx, draft, resolved, counterOffer)
  }, emptyDraft(ctx))
}
