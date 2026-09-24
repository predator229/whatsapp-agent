import type { TurnFact } from './facts'

/** Nombres toujours tolérés : formulations courantes (« un », « le 1er »). */
const ALWAYS_ALLOWED = [0, 1]

function numbersOf(fact: TurnFact): number[] {
  switch (fact.kind) {
    case 'ProductsFound':
      return fact.products.flatMap((p) => [p.price, ...(p.stock === null ? [] : [p.stock])])
    case 'PriceQuoted':
      return [
        fact.price,
        ...(fact.stock === null ? [] : [fact.stock]),
        ...(fact.leadTimeDays === undefined ? [] : [fact.leadTimeDays]),
        ...(fact.depositPercent === undefined ? [] : [fact.depositPercent]),
      ]
    case 'OutOfStock':
      return [fact.available]
    case 'MinQuantity':
      return [fact.minQuantity]
    case 'NegotiationResult':
      return [fact.offer]
    case 'CartUpdated':
      return [fact.subtotal, ...fact.lines.flatMap((l) => [l.quantity, l.unitPrice, l.agreedPrice])]
    case 'DeliveryQuoted':
      return [fact.fee, fact.delayHours]
    case 'OrderSummary':
      return [
        fact.order.subtotal,
        fact.order.deliveryFee,
        fact.order.total,
        ...(fact.order.depositAmount === undefined ? [] : [fact.order.depositAmount]),
        ...fact.order.lines.flatMap((l) => [l.quantity, l.unitPrice, l.agreedPrice]),
      ]
    default:
      return []
  }
}

/** Tous les nombres que les faits du tour autorisent le composer à citer. */
export function collectAllowedNumbers(facts: readonly TurnFact[]): number[] {
  return [...new Set([...ALWAYS_ALLOWED, ...facts.flatMap(numbersOf)])]
}

function phrasesOf(fact: TurnFact): string[] {
  switch (fact.kind) {
    case 'ProductsFound':
      return fact.products.map((p) => p.name)
    case 'PriceQuoted':
    case 'OutOfStock':
    case 'MinQuantity':
    case 'NegotiationResult':
      return [fact.name]
    case 'DeliveryQuoted':
      return [fact.zone]
    case 'ZoneUnknown':
      return fact.zones
    case 'OrderSummary':
      return [
        ...fact.order.lines.map((l) => l.label),
        ...(fact.order.address.zone ? [fact.order.address.zone] : []),
      ]
    default:
      return []
  }
}

/** Libellés autorisés à contenir des chiffres (noms de produits, zones). */
export function collectAllowedPhrases(facts: readonly TurnFact[]): string[] {
  return [...new Set(facts.flatMap(phrasesOf))]
}
