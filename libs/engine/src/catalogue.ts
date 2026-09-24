import type { MerchantProfile, Product } from '@wa/domain'
import type { ProductRef } from './intent-schema'

export interface ResolvedProduct {
  readonly product: Product
  readonly variantId?: string
  readonly label: string
  readonly unitPrice: number
  /** `null` = stock illimité. */
  readonly stock: number | null
}

export function activeProducts(profile: MerchantProfile): Product[] {
  return profile.catalogue.filter((product) => product.active)
}

/** Résout une référence produit en prix et stock réels. `null` si absente, inactive ou variante inconnue. */
export function resolveProductRef(
  profile: MerchantProfile,
  ref: ProductRef,
): ResolvedProduct | null {
  const product = activeProducts(profile).find((p) => p.productId === ref.productId)
  if (!product) return null
  const { pricing } = product

  switch (pricing.kind) {
    case 'unit': {
      const variant = ref.variantId
        ? pricing.variants.find((v) => v.variantId === ref.variantId)
        : pricing.variants[0]
      if (!variant) return null
      return {
        product,
        variantId: variant.variantId,
        label: `${product.name} ${variant.label}`.trim(),
        unitPrice: variant.price,
        stock: variant.stock,
      }
    }
    case 'bulk':
      return {
        product,
        label: `${product.name} (${pricing.unitOfMeasure})`,
        unitPrice: pricing.pricePerUnit,
        stock: pricing.stockQuantity,
      }
    case 'madeToOrder':
      return { product, label: product.name, unitPrice: pricing.basePrice, stock: null }
  }
}
