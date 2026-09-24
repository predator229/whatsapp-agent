import type { CartLine, MerchantProfile } from '@wa/domain'
import { resolveProductRef, type ResolvedProduct } from '../catalogue'
import type { ProductRef } from '../intent-schema'
import type { TurnFact } from '../facts'
import {
  cartFact,
  currentPrice,
  emptyDraft,
  sameLine,
  withFact,
  type Ctx,
  type Draft,
} from './shared'

/** Le fait qui bloque l'ajout, ou `null` si la quantité cumulée est servable. */
function blockingFact(resolved: ResolvedProduct, quantity: number): TurnFact | null {
  const { pricing } = resolved.product
  if (pricing.kind === 'bulk' && quantity < pricing.minQuantity) {
    return {
      kind: 'MinQuantity',
      productId: resolved.product.productId,
      name: resolved.label,
      minQuantity: pricing.minQuantity,
      unit: pricing.unitOfMeasure,
    }
  }
  if (resolved.stock !== null && quantity > resolved.stock) {
    return {
      kind: 'OutOfStock',
      productId: resolved.product.productId,
      name: resolved.label,
      available: resolved.stock,
    }
  }
  return null
}

function addRef(ctx: Ctx, draft: Draft, ref: ProductRef): Draft {
  const resolved = resolveProductRef(ctx.profile, ref)
  if (!resolved) return withFact(draft, { kind: 'OutOfScope', query: ref.productId })

  const existing = draft.state.cart.find((l) => sameLine(l, resolved))
  const quantity = (existing?.quantity ?? 0) + (ref.quantity ?? 1)
  const blocked = blockingFact(resolved, quantity)
  if (blocked) return withFact(draft, blocked)

  const line: CartLine = {
    productId: resolved.product.productId,
    ...(resolved.variantId ? { variantId: resolved.variantId } : {}),
    quantity,
    unitPrice: resolved.unitPrice,
    agreedPrice: currentPrice(draft.state, resolved),
  }
  const cart = existing
    ? draft.state.cart.map((l) => (sameLine(l, resolved) ? line : l))
    : [...draft.state.cart, line]
  return { ...draft, state: { ...draft.state, phase: 'cart', cart } }
}

/**
 * Les quantités d'une même ligne s'additionnent, et le contrôle de stock porte sur
 * le cumul : demander 2 puis 2 d'un produit à 3 en stock doit échouer. Si rien n'a
 * pu entrer, le client n'entend que le motif du refus, pas un panier inchangé.
 */
export function handleAddToCart(ctx: Ctx): Draft {
  const draft = ctx.intent.productRefs.reduce<Draft>(
    (acc, ref) => addRef(ctx, acc, ref),
    emptyDraft(ctx),
  )
  return draft.state.cart === ctx.state.cart ? draft : withFact(draft, cartFact(draft.state.cart))
}

interface LineKey {
  readonly productId: string
  readonly variantId: string | undefined
}

/**
 * Identité de la ligne visée. On passe par le catalogue pour retrouver la variante
 * par défaut, et on retombe sur la référence brute pour qu'un produit retiré du
 * catalogue reste retirable du panier.
 */
function keyOf(profile: MerchantProfile, ref: ProductRef): LineKey {
  const resolved = resolveProductRef(profile, ref)
  return resolved
    ? { productId: resolved.product.productId, variantId: resolved.variantId }
    : { productId: ref.productId, variantId: ref.variantId }
}

function matches(line: CartLine, key: LineKey): boolean {
  return line.productId === key.productId && line.variantId === key.variantId
}

function removeRef(cart: readonly CartLine[], profile: MerchantProfile, ref: ProductRef) {
  const key = keyOf(profile, ref)
  const removed = ref.quantity
  if (removed === undefined) return cart.filter((line) => !matches(line, key))
  return cart.flatMap((line) => {
    if (!matches(line, key)) return [line]
    const quantity = line.quantity - removed
    return quantity > 0 ? [{ ...line, quantity }] : []
  })
}

/** Sans quantité on retire la ligne entière ; sans référence du tout on vide le panier. */
export function handleRemoveFromCart(ctx: Ctx): Draft {
  const cart = ctx.intent.productRefs.reduce<CartLine[]>(
    (lines, ref) => removeRef(lines, ctx.profile, ref),
    ctx.intent.productRefs.length === 0 ? [] : [...ctx.state.cart],
  )
  return {
    state: { ...ctx.state, phase: cart.length > 0 ? 'cart' : 'browsing', cart },
    facts: [cartFact(cart)],
    events: [],
  }
}
