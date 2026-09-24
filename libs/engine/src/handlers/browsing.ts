import { resolveProductRef } from '../catalogue'
import type { TurnFact } from '../facts'
import {
  findZone,
  foundProducts,
  priceFact,
  zoneCandidate,
  zoneFact,
  type Ctx,
  type Draft,
} from './shared'

/** Vitrine d'accueil : assez pour amorcer, pas assez pour noyer. */
const GREET_PRODUCTS = 3
const BROWSE_PRODUCTS = 5

export function handleGreet(ctx: Ctx): Draft {
  return {
    state: { ...ctx.state, phase: 'browsing' },
    facts: [
      { kind: 'Greeting' },
      { kind: 'ProductsFound', products: foundProducts(ctx.profile, GREET_PRODUCTS) },
    ],
    events: [],
  }
}

export function handleBrowse(ctx: Ctx): Draft {
  return {
    state: { ...ctx.state, phase: 'browsing' },
    facts: [{ kind: 'ProductsFound', products: foundProducts(ctx.profile, BROWSE_PRODUCTS) }],
    events: [],
  }
}

/** Couvre `ask_product` et `ask_price` : un fait par référence, résolue ou non. */
export function handleAskProduct(ctx: Ctx): Draft {
  const facts = ctx.intent.productRefs.map((ref): TurnFact => {
    const resolved = resolveProductRef(ctx.profile, ref)
    return resolved ? priceFact(resolved) : { kind: 'OutOfScope', query: ref.productId }
  })
  return { state: { ...ctx.state, phase: 'browsing' }, facts, events: [] }
}

export function handleAskDelivery(ctx: Ctx): Draft {
  const zone = findZone(ctx.profile, zoneCandidate(ctx.intent))
  return { state: ctx.state, facts: [zoneFact(ctx.profile, zone)], events: [] }
}
