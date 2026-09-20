# Spec 1 — Contrat `MerchantProfile`

Date : 2026-09-20. Statut : validé en brainstorming, à implémenter en premier.

## Objectif

Une seule structure de données, validée par Zod, que tout le système partage :

- **produite** par la saisie manuelle (pilote), plus tard par l'ingestion Facebook et la capture de style ;
- **consommée** par le moteur de conversation, le back-office et l'export.

Lib NX : `libs/domain`. Aucune dépendance runtime autre que `zod`.

## Non-objectifs

- Pas de persistance ici (Firestore vit dans `apps/api`).
- Pas de logique de négociation ni de prompt (lib `engine`).
- Pas de multi-devise : une devise par commerçant, XOF par défaut.

## Structure

```
MerchantProfile
├── merchantId, displayName, currency ("XOF"), locale ("fr-BJ")
├── catalogue: Product[]
├── negotiation: NegotiationPolicy
├── style: StyleProfile
├── delivery: DeliveryPolicy
└── limits: { maxRepliesPerMonth, maxReplyChars }
```

### Product (union discriminée sur `pricing.kind`)

Champs communs : `productId`, `name`, `aliases[]` (noms parlés, ex. « pagne » pour « tissu wax »), `description` (≤ 300 caractères), `photos[]` (URLs), `active` (bool), `tags[]`.

| `pricing.kind` | Champs spécifiques | Exemple |
|---|---|---|
| `unit` | `variants[]` : `{ variantId, label, attributes{}, price, stock }`. Au moins une variante. | Robe, taille M, rouge, 12 000 XOF, stock 3 |
| `bulk` | `unitOfMeasure` (`kg`, `m`, `L`, `piece`), `pricePerUnit`, `minQuantity`, `stepQuantity`, `stockQuantity` | Riz 800 XOF/kg, min 1 kg, pas 0,5 kg |
| `madeToOrder` | `basePrice`, `leadTimeDays`, `depositPercent` (0–100), `options[]` : `{ label, extraPrice }` | Tenue sur mesure, 25 000 XOF, 7 jours, 50 % d'acompte |

Prix : entiers en unité de devise (pas de centimes en XOF). Stock : entier ou `null` = illimité / non suivi.

### NegotiationPolicy

```
{
  enabled: boolean,
  perProduct: Record<productId, { floorPrice: number, steps: number[] }>,
  quantityDiscounts: { productId, minQuantity, percentOff }[],
  maxRounds: number            // tours de négociation avant refus ferme, défaut 3
}
```

Invariants (validés par Zod `.refine`) :
- `floorPrice` ≤ prix affiché de chaque variante du produit.
- `steps` strictement décroissants, tous ≥ `floorPrice`. Vide = pas de remise sur ce produit.
- `percentOff` ∈ ]0, 50].

### StyleProfile

Rempli par questionnaire pour le pilote. Plus tard alimenté par l'analyse d'historique.

```
{
  tone: "chaleureux" | "direct" | "formel",
  greeting: string,                  // ex. « Bonsoir ma sœur, bien arrivée ? »
  signoff: string,
  languageMix: { primary: "fr", secondary?: "fon" | "yoruba" | "en", ratio: 0..1 },
  emojiLevel: 0 | 1 | 2,
  addressForm: "tu" | "vous",
  examples: { customer: string, merchant: string }[],  // 3 à 10 échanges réels ou écrits
  fallbacks: string[]                 // réponses sûres dans le style, ex. « je vérifie et je te redis », ≥ 2
}
```

### DeliveryPolicy

```
{
  zones: { name: string, fee: number, delayHours: number }[],
  pickupAddress?: string,
  paymentMethods: ("cash_on_delivery" | "momo_mtn" | "momo_moov")[]
}
```

Le bot ne cite un délai ou des frais que depuis `zones`. Zone inconnue = « je confirme avec la boutique ».

### Limits

`maxRepliesPerMonth` (palier tarifaire, défaut 1 000), `maxReplyChars` (défaut 320, levier coût et lisibilité mobile).

## Export

Fonction pure `exportProfile(profile) → { catalogue.csv, profile.json }`. CSV : une ligne par variante / produit vrac / produit sur commande, colonnes stables documentées dans le code. Promis au commerçant dès le premier contact (§3.4 du CLAUDE.md), donc livré avec la spec 1.

## Fixtures

`libs/domain/fixtures/pilot-profile.ts` : profil de la boutique pilote (mixte : quelques produits unitaires, un vrac, un sur commande), utilisé par les tests du moteur et le chat web.

## Tests

- Zod : chaque schéma accepte la fixture, rejette 1 cas invalide par invariant listé.
- Export : snapshot du CSV et du JSON sur la fixture.
- Couverture visée : 90 % sur la lib (petite, pure).

## Fichiers

```
libs/domain/src/
  merchant-profile.ts     (schémas Zod + types inférés)
  product.ts
  negotiation.ts
  style.ts
  delivery.ts
  export.ts
  index.ts
libs/domain/fixtures/pilot-profile.ts
libs/domain/src/*.spec.ts
```
