import type { CartLine, Order } from '@wa/domain'

/** Un produit tel que le composer a le droit de le citer : libellé, prix et stock réels. */
export interface FoundProduct {
  readonly productId: string
  readonly name: string
  readonly price: number
  readonly stock: number | null
}

/**
 * Les faits sont les SEULES données que le composer a le droit de mettre en mots.
 * Il ne voit jamais le catalogue : il n'a donc rien à inventer.
 */
export type TurnFact =
  | { kind: 'Greeting' }
  | { kind: 'CatalogueEmpty' }
  | { kind: 'ProductsFound'; products: FoundProduct[] }
  | {
      kind: 'PriceQuoted'
      productId: string
      name: string
      price: number
      stock: number | null
      /** Renseignés uniquement pour un produit `madeToOrder`. */
      leadTimeDays?: number
      depositPercent?: number
    }
  | { kind: 'OutOfScope'; query: string }
  | { kind: 'OutOfStock'; productId: string; name: string; available: number }
  | { kind: 'MinQuantity'; productId: string; name: string; minQuantity: number; unit: string }
  | {
      kind: 'NegotiationResult'
      productId: string
      name: string
      accepted: boolean
      offer: number
      final: boolean
    }
  | { kind: 'CartUpdated'; lines: CartLine[]; subtotal: number }
  | { kind: 'AddressNeeded' }
  | { kind: 'ZoneUnknown'; zones: string[] }
  | { kind: 'DeliveryQuoted'; zone: string; fee: number; delayHours: number }
  | { kind: 'OrderSummary'; order: Order }
  | { kind: 'OrderCancelled' }
  | { kind: 'Unclear' }
  | { kind: 'OffTopic' }
  | { kind: 'QuotaExceeded' }
