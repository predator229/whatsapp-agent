import type { CartLine, ConversationState, MerchantProfile } from '@wa/domain'
import { activeProducts, resolveProductRef, type ResolvedProduct } from '../catalogue'
import type { Intent } from '../intent-schema'
import type { EngineEvent } from '../events'
import type { FoundProduct, TurnFact } from '../facts'

/** Tout ce dont un handler a besoin. Aucune horloge : `receivedAt` est le seul temps existant. */
export interface Ctx {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly intent: Intent
  /** Message brut du client, reporté tel quel dans `IntentUnclear`. */
  readonly text: string
  readonly receivedAt: string
}

export interface Draft {
  readonly state: ConversationState
  readonly facts: TurnFact[]
  readonly events: EngineEvent[]
}

export type DeliveryZone = MerchantProfile['delivery']['zones'][number]

/** Draft de départ d'un handler accumulatif : état inchangé, rien à dire encore. */
export function emptyDraft(ctx: Ctx): Draft {
  return { state: ctx.state, facts: [], events: [] }
}

export function withFact(draft: Draft, fact: TurnFact): Draft {
  return { ...draft, facts: [...draft.facts, fact] }
}

/** Minuscules, sans accent, sans espaces de bord — pour apparier des noms de zones saisis à la main. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function findZone(
  profile: MerchantProfile,
  candidate: string | undefined,
): DeliveryZone | undefined {
  if (!candidate) return undefined
  const needle = normalize(candidate)
  return profile.delivery.zones.find((z) => needle.includes(normalize(z.name)))
}

/** `DeliveryQuoted` si la zone est connue du profil, sinon la liste des zones desservies. */
export function zoneFact(profile: MerchantProfile, zone: DeliveryZone | undefined): TurnFact {
  return zone
    ? { kind: 'DeliveryQuoted', zone: zone.name, fee: zone.fee, delayHours: zone.delayHours }
    : { kind: 'ZoneUnknown', zones: profile.delivery.zones.map((z) => z.name) }
}

/** Zone visée par l'intention : `zone` explicite, à défaut l'adresse libre. */
export function zoneCandidate(intent: Intent): string | undefined {
  return intent.zone ?? intent.address
}

/** Prix en vigueur : l'offre déjà négociée l'emporte sur le prix affiché. */
export function currentPrice(state: ConversationState, resolved: ResolvedProduct): number {
  return state.negotiation[resolved.product.productId]?.currentOffer ?? resolved.unitPrice
}

/**
 * `price` par défaut le prix affiché. La négociation passe le prix courant : une fois
 * un prix concédé, le client ne doit plus s'entendre reciter le tarif d'origine.
 */
export function priceFact(resolved: ResolvedProduct, price = resolved.unitPrice): TurnFact {
  const { pricing } = resolved.product
  return {
    kind: 'PriceQuoted',
    productId: resolved.product.productId,
    name: resolved.label,
    price,
    stock: resolved.stock,
    ...(pricing.kind === 'madeToOrder'
      ? { leadTimeDays: pricing.leadTimeDays, depositPercent: pricing.depositPercent }
      : {}),
  }
}

export function cartFact(cart: readonly CartLine[]): TurnFact {
  return {
    kind: 'CartUpdated',
    lines: [...cart],
    subtotal: cart.reduce((sum, l) => sum + l.agreedPrice * l.quantity, 0),
  }
}

export function sameLine(line: CartLine, resolved: ResolvedProduct): boolean {
  return line.productId === resolved.product.productId && line.variantId === resolved.variantId
}

/** Les `limit` premiers produits actifs, réduits à ce que le composer a le droit de citer. */
export function foundProducts(profile: MerchantProfile, limit: number): FoundProduct[] {
  return activeProducts(profile)
    .slice(0, limit)
    .map((product) => resolveProductRef(profile, { productId: product.productId }))
    .filter((resolved): resolved is ResolvedProduct => resolved !== null)
    .map((resolved) => ({
      productId: resolved.product.productId,
      name: resolved.label,
      price: resolved.unitPrice,
      stock: resolved.stock,
    }))
}
