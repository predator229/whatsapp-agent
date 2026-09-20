import type { MerchantProfile } from './merchant-profile'
import type { Product } from './product'

export const CATALOGUE_CSV_COLUMNS = [
  'productId', 'name', 'kind', 'variantId', 'label', 'price', 'unitOfMeasure', 'stock', 'leadTimeDays', 'depositPercent', 'active',
] as const

type Row = Record<(typeof CATALOGUE_CSV_COLUMNS)[number], string | number | boolean | null>

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function rowsFor(p: Product): Row[] {
  const base = { productId: p.productId, name: p.name, kind: p.pricing.kind, active: p.active,
    variantId: null, label: null, price: null, unitOfMeasure: null, stock: null, leadTimeDays: null, depositPercent: null }
  switch (p.pricing.kind) {
    case 'unit':
      return p.pricing.variants.map((v) => ({ ...base, variantId: v.variantId, label: v.label, price: v.price, stock: v.stock }))
    case 'bulk':
      return [{ ...base, price: p.pricing.pricePerUnit, unitOfMeasure: p.pricing.unitOfMeasure, stock: p.pricing.stockQuantity }]
    case 'madeToOrder':
      return [{ ...base, price: p.pricing.basePrice, leadTimeDays: p.pricing.leadTimeDays, depositPercent: p.pricing.depositPercent }]
  }
}

/** Export complet, promis au commerçant : CSV catalogue + JSON du profil. Fonction pure. */
export function exportProfile(profile: MerchantProfile): { catalogueCsv: string; profileJson: string } {
  const lines = profile.catalogue.flatMap(rowsFor).map((row) => CATALOGUE_CSV_COLUMNS.map((c) => csvCell(row[c])).join(','))
  return {
    catalogueCsv: [CATALOGUE_CSV_COLUMNS.join(','), ...lines].join('\n') + '\n',
    profileJson: JSON.stringify(profile, null, 2),
  }
}
