import type { Product } from '@wa/domain'

/** Plafond d'une ligne de panier, même quand le stock est illimité. */
export const MAX_LINE_QUANTITY = 1000

/** Tolérance pour comparer un multiple de `stepQuantity` (0,1 + 0,2 ≠ 0,3 en flottant). */
const STEP_EPSILON = 1e-9

/**
 * Pas de vente : 1 pour une pièce (`unit`, `madeToOrder`), `stepQuantity` pour le vrac
 * (kg, m, L). Seul le vrac peut se vendre en fraction.
 */
export function quantityStep(product: Product): number {
  return product.pricing.kind === 'bulk' ? product.pricing.stepQuantity : 1
}

/** Nombre fini, strictement positif, sous le plafond — quel que soit le produit. */
export function isSaneQuantity(quantity: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_LINE_QUANTITY
}

/**
 * Finie, strictement positive et multiple entier du pas (donc entière pour une pièce).
 * Le plafond, le minimum du vrac et le stock sont contrôlés à part, pour que le client
 * entende le motif le plus utile (« il n'en reste que 3 » plutôt que « trop »).
 */
export function isWholeSteps(product: Product, quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false
  const steps = quantity / quantityStep(product)
  return Math.abs(steps - Math.round(steps)) < STEP_EPSILON
}
