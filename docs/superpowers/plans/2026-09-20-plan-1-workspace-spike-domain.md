# Plan 1 — Workspace NX, spike modèle, lib `domain` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le monorepo NX, mesurer la fiabilité JSON du modèle local candidat, livrer la lib `domain` (contrat `MerchantProfile` + export) testée.

**Architecture:** Monorepo NX à la racine du repo (la landing page statique reste à la racine, servie par GitHub Pages, non touchée). `libs/domain` = schémas Zod purs, zéro I/O. Le spike est un script jetable dans `tools/spike/`, jamais importé par le code produit.

**Tech Stack:** Node 22, npm 10, NX 21 (`@nx/js`), TypeScript 5, Zod 3, Vitest. Ollama 0.34 local pour le spike.

**Spec:** `docs/superpowers/specs/2026-09-20-merchant-profile-contract-design.md` (tâches 3 à 9), `docs/superpowers/specs/2026-09-20-conversation-engine-design.md` § Spike préalable (tâche 2).

## Global Constraints

- Aucune dépendance runtime dans `libs/domain` autre que `zod`.
- Prix : entiers (XOF). Stock : entier ou `null`.
- Pas de `console.log` dans le code produit (le spike, jetable, est exempté).
- Immutabilité : fonctions pures, pas de mutation d'arguments.
- Fichiers ≤ 400 lignes.
- Commits : `<type>: <description>` (feat, fix, chore, test, docs). Pas de ligne d'attribution.
- Ne pas déplacer ni modifier `index.html`, `app.js`, `styles.css`, `logo.png`, `CNAME`.

---

### Task 1: Workspace NX

**Files:**
- Create: `package.json`, `nx.json`, `tsconfig.base.json`, `.gitignore` (modifier), `.prettierrc`
- Test: `npx nx --version` fonctionne

**Interfaces:**
- Produces: workspace où `npx nx g @nx/js:lib` et `npx nx test <lib>` fonctionnent.

- [ ] **Step 1: Initialiser package.json et NX**

```bash
cd "/Users/admin/Desktop/CyberShield Dev Solutions/projects/whatsapp-agent"
npm init -y >/dev/null
npm pkg set name="whatsapp-agent" private=true type="module"
npx --yes nx@latest init --interactive=false --nxCloud=skip
npm i -D @nx/js@latest @nx/vite@latest vitest@^3 @vitest/coverage-v8@^3 typescript@^5 prettier@^3
npm i zod@^3
```

- [ ] **Step 2: Vérifier**

Run: `npx nx --version`
Expected: une version 21.x affichée, `nx.json` présent.

- [ ] **Step 3: .gitignore et prettier**

```bash
cat >> .gitignore <<'EOF'
node_modules
dist
.nx
coverage
*.log
.env
EOF
cat > .prettierrc <<'EOF'
{ "singleQuote": true, "semi": false, "printWidth": 100 }
EOF
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json nx.json tsconfig.base.json .gitignore .prettierrc
git commit -m "chore: init NX workspace"
```

---

### Task 2: Spike jetable — taux de JSON valide du modèle local

**Files:**
- Create: `tools/spike/README.md`, `tools/spike/messages.json`, `tools/spike/intent-rate.mjs`

**Interfaces:**
- Produces: un chiffre (taux de JSON valide au premier essai) et le nom du modèle retenu, écrits dans `tools/spike/README.md`. Rien d'importable.

- [ ] **Step 1: Télécharger le modèle candidat**

```bash
ollama pull qwen2.5:14b-instruct-q4_K_M
```

Expected: ~9 Go téléchargés, `ollama list` affiche le modèle.

- [ ] **Step 2: Écrire les 50 messages clients**

`tools/spike/messages.json` — 50 chaînes en français parlé béninois, mélange d'intentions. Extrait obligatoire (compléter à 50 sur le même ton) :

```json
[
  "Bonsoir tantie c'est combien la robe rouge là",
  "Vous avez le riz en sac de 25kg ?",
  "12000 c'est trop, fais 9000 je prends deux",
  "Je veux 3 mètres de wax bleu",
  "Bien arrivée ?",
  "Est-ce que vous livrez à Calavi",
  "Ok je prends, mon adresse c'est Fidjrossè carrefour pharmacie",
  "Laisse tomber je vais voir ailleurs",
  "Tu peux coudre une tenue pour un mariage samedi prochain ?",
  "C'est quoi le prix du kg de gari",
  "Je confirme la commande",
  "Envoie moi la photo de la chaussure noire",
  "Vous êtes ouverts dimanche ?",
  "Mon frère a dit que tu fais des réductions",
  "Je veux annuler ce que j'ai pris"
]
```

- [ ] **Step 3: Écrire le script**

`tools/spike/intent-rate.mjs` :

```js
// JETABLE — mesure le taux de JSON valide d'un modèle Ollama sur des messages clients.
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

const MODEL = process.env.LLM_MODEL ?? 'qwen2.5:14b-instruct-q4_K_M'
const BASE = process.env.LLM_BASE_URL ?? 'http://localhost:11434'
const messages = JSON.parse(readFileSync(new URL('./messages.json', import.meta.url), 'utf8'))

const Intent = z.object({
  intent: z.enum(['greet','browse','ask_product','ask_price','negotiate','add_to_cart',
    'remove_from_cart','give_address','confirm_order','cancel','off_topic','unclear']),
  productRefs: z.array(z.object({
    productId: z.string(), variantId: z.string().optional(), quantity: z.number().optional(),
  })),
  counterOffer: z.number().optional(),
  address: z.string().optional(),
  zone: z.string().optional(),
})

const schema = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: Intent.shape.intent.options },
    productRefs: { type: 'array', items: { type: 'object', properties: {
      productId: { type: 'string' }, variantId: { type: 'string' }, quantity: { type: 'number' } },
      required: ['productId'] } },
    counterOffer: { type: 'number' }, address: { type: 'string' }, zone: { type: 'string' },
  },
  required: ['intent', 'productRefs'],
}

const catalogue = [
  { productId: 'robe-rouge', name: 'Robe rouge', aliases: ['robe', 'robe rouge'] },
  { productId: 'riz-25kg', name: 'Riz sac 25 kg', aliases: ['riz', 'sac de riz'] },
  { productId: 'wax-bleu', name: 'Tissu wax bleu', aliases: ['wax', 'pagne', 'tissu'] },
  { productId: 'gari', name: 'Gari (kg)', aliases: ['gari'] },
  { productId: 'tenue-mesure', name: 'Tenue sur mesure', aliases: ['tenue', 'couture'] },
  { productId: 'chaussure-noire', name: 'Chaussure noire', aliases: ['chaussure', 'chaussures'] },
]

const system = `Tu classes le message d'un client d'une boutique béninoise. Réponds UNIQUEMENT en JSON.
Produits (productId | nom | alias): ${catalogue.map(p => `${p.productId} | ${p.name} | ${p.aliases.join(', ')}`).join('\n')}
Si le client parle d'un produit absent de la liste, productRefs est vide et intent est off_topic.`

async function classify(text) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, stream: false, format: schema, options: { temperature: 0 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: text }] }),
  })
  const body = await res.json()
  const ms = Date.now() - t0
  try {
    const parsed = Intent.parse(JSON.parse(body.message.content))
    return { ok: true, ms, parsed }
  } catch (e) {
    return { ok: false, ms, raw: body.message?.content, error: String(e).slice(0, 120) }
  }
}

const results = []
for (const text of messages) {
  const r = await classify(text)
  results.push({ text, ...r })
  console.log(r.ok ? 'OK ' : 'BAD', `${r.ms}ms`, text.slice(0, 50), r.ok ? r.parsed.intent : r.error)
}
const ok = results.filter(r => r.ok).length
const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)
console.log(`\nMODEL=${MODEL} valid=${ok}/${results.length} (${Math.round(100 * ok / results.length)}%) avg=${avgMs}ms`)
writeFileSync(new URL('./last-run.json', import.meta.url), JSON.stringify({ MODEL, ok, total: results.length, avgMs, results }, null, 2))
```

- [ ] **Step 4: Lancer**

Run: `node tools/spike/intent-rate.mjs`
Expected: 50 lignes OK/BAD puis une ligne `valid=N/50`. Le premier appel est lent (chargement du modèle).

- [ ] **Step 5: Relire à la main 10 résultats OK**

Ouvrir `tools/spike/last-run.json`. Vérifier que l'intention est **juste**, pas seulement valide, sur 10 cas variés (négociation avec chiffre, adresse, annulation, hors catalogue). Noter le nombre de classifications fausses.

- [ ] **Step 6: Décider et documenter**

Règle : JSON valide ≥ 90 % **et** ≤ 2 intentions fausses sur 10 → modèle retenu. Sinon relancer avec `LLM_MODEL=mistral-small:24b-instruct-2501-q4_K_M` (après `ollama pull`), même règle. Si les deux échouent : noter et retenir le meilleur, le plan 2 ajoutera un retry systématique.

`tools/spike/README.md` :

```markdown
# Spike modèle (jetable)

Date : <date>. Machine : MacBook Pro M4 Pro 24 Go, Ollama 0.34.

| Modèle | JSON valide | Intentions fausses /10 | Latence moyenne |
|---|---|---|---|
| qwen2.5:14b-instruct-q4_K_M | N/50 | n | ms |

Retenu : `<modèle>`. Valeur par défaut de `LLM_MODEL` dans le plan 2.
Relancer : `node tools/spike/intent-rate.mjs`.
```

- [ ] **Step 7: Commit**

```bash
git add tools/spike
git commit -m "chore: model spike, intent JSON validity rate"
```

---

### Task 3: Lib `domain` — génération et schéma `Product`

**Files:**
- Create: `libs/domain/src/product.ts`, `libs/domain/src/product.spec.ts`

**Interfaces:**
- Produces: `ProductSchema` (Zod), types `Product`, `UnitProduct`, `BulkProduct`, `MadeToOrderProduct`, `Variant`. Helper `listedPrices(product: Product): number[]`.

- [ ] **Step 1: Générer la lib**

```bash
npx nx g @nx/js:lib libs/domain --bundler=none --unitTestRunner=vitest --linter=none --importPath=@wa/domain --no-interactive
rm -f libs/domain/src/lib/*.ts
```

Run: `npx nx test domain`
Expected: passe (0 test) ou « no test files », mais pas d'erreur de config.

- [ ] **Step 2: Test qui échoue**

`libs/domain/src/product.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { ProductSchema, listedPrices } from './product'

const base = { productId: 'p1', name: 'Robe', aliases: ['robe'], description: '', photos: [], active: true, tags: [] }

describe('ProductSchema', () => {
  it('accepts a unit product with one variant', () => {
    const p = ProductSchema.parse({ ...base, pricing: { kind: 'unit', variants: [
      { variantId: 'v1', label: 'M rouge', attributes: { taille: 'M' }, price: 12000, stock: 3 } ] } })
    expect(listedPrices(p)).toEqual([12000])
  })
  it('rejects a unit product without variants', () => {
    expect(() => ProductSchema.parse({ ...base, pricing: { kind: 'unit', variants: [] } })).toThrow()
  })
  it('accepts bulk and made-to-order', () => {
    const bulk = ProductSchema.parse({ ...base, pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 800, minQuantity: 1, stepQuantity: 0.5, stockQuantity: null } })
    const mto = ProductSchema.parse({ ...base, pricing: { kind: 'madeToOrder', basePrice: 25000, leadTimeDays: 7, depositPercent: 50, options: [{ label: 'broderie', extraPrice: 5000 }] } })
    expect(listedPrices(bulk)).toEqual([800])
    expect(listedPrices(mto)).toEqual([25000, 30000])
  })
  it('rejects non-integer or negative prices', () => {
    expect(() => ProductSchema.parse({ ...base, pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 800.5, minQuantity: 1, stepQuantity: 1, stockQuantity: null } })).toThrow()
    expect(() => ProductSchema.parse({ ...base, pricing: { kind: 'unit', variants: [{ variantId: 'v', label: 'x', attributes: {}, price: -1, stock: null }] } })).toThrow()
  })
  it('rejects description over 300 chars', () => {
    expect(() => ProductSchema.parse({ ...base, description: 'a'.repeat(301), pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 1, minQuantity: 1, stepQuantity: 1, stockQuantity: null } })).toThrow()
  })
})
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx nx test domain`
Expected: FAIL, `Cannot find module './product'`.

- [ ] **Step 4: Implémenter**

`libs/domain/src/product.ts` :

```ts
import { z } from 'zod'

const price = z.number().int().nonnegative()
const stock = z.number().int().nonnegative().nullable()

export const VariantSchema = z.object({
  variantId: z.string().min(1),
  label: z.string().min(1),
  attributes: z.record(z.string()),
  price,
  stock,
})

const UnitPricing = z.object({ kind: z.literal('unit'), variants: z.array(VariantSchema).min(1) })
const BulkPricing = z.object({
  kind: z.literal('bulk'),
  unitOfMeasure: z.enum(['kg', 'm', 'L', 'piece']),
  pricePerUnit: price,
  minQuantity: z.number().positive(),
  stepQuantity: z.number().positive(),
  stockQuantity: z.number().nonnegative().nullable(),
})
const MadeToOrderPricing = z.object({
  kind: z.literal('madeToOrder'),
  basePrice: price,
  leadTimeDays: z.number().int().positive(),
  depositPercent: z.number().int().min(0).max(100),
  options: z.array(z.object({ label: z.string().min(1), extraPrice: price })),
})

export const ProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  description: z.string().max(300),
  photos: z.array(z.string().url()),
  active: z.boolean(),
  tags: z.array(z.string()),
  pricing: z.discriminatedUnion('kind', [UnitPricing, BulkPricing, MadeToOrderPricing]),
})

export type Variant = z.infer<typeof VariantSchema>
export type Product = z.infer<typeof ProductSchema>
export type UnitProduct = Product & { pricing: z.infer<typeof UnitPricing> }
export type BulkProduct = Product & { pricing: z.infer<typeof BulkPricing> }
export type MadeToOrderProduct = Product & { pricing: z.infer<typeof MadeToOrderPricing> }

/** Tous les prix qu'un client peut se voir citer pour ce produit (base + options pour le sur-commande). */
export function listedPrices(product: Product): number[] {
  const { pricing } = product
  switch (pricing.kind) {
    case 'unit':
      return pricing.variants.map((v) => v.price)
    case 'bulk':
      return [pricing.pricePerUnit]
    case 'madeToOrder':
      return [pricing.basePrice, ...pricing.options.map((o) => pricing.basePrice + o.extraPrice)]
  }
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx nx test domain`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/domain package.json package-lock.json tsconfig.base.json nx.json
git commit -m "feat(domain): product schema with unit, bulk and made-to-order pricing"
```

---

### Task 4: `NegotiationPolicy`

**Files:**
- Create: `libs/domain/src/negotiation.ts`, `libs/domain/src/negotiation.spec.ts`

**Interfaces:**
- Consumes: `Product`, `listedPrices` (Task 3).
- Produces: `NegotiationPolicySchema`, type `NegotiationPolicy`, `validateNegotiationAgainstCatalogue(policy, catalogue: Product[]): string[]` (liste d'erreurs, vide = OK).

- [ ] **Step 1: Test qui échoue**

`libs/domain/src/negotiation.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { NegotiationPolicySchema, validateNegotiationAgainstCatalogue } from './negotiation'
import type { Product } from './product'

const robe: Product = { productId: 'robe', name: 'Robe', aliases: [], description: '', photos: [], active: true, tags: [],
  pricing: { kind: 'unit', variants: [{ variantId: 'm', label: 'M', attributes: {}, price: 12000, stock: 2 }] } }

describe('NegotiationPolicySchema', () => {
  it('accepts a valid policy', () => {
    const p = NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3,
      perProduct: { robe: { floorPrice: 9000, steps: [11000, 10000, 9000] } },
      quantityDiscounts: [{ productId: 'robe', minQuantity: 2, percentOff: 10 }] })
    expect(p.maxRounds).toBe(3)
  })
  it('rejects non-decreasing steps', () => {
    expect(() => NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3,
      perProduct: { robe: { floorPrice: 9000, steps: [10000, 11000] } }, quantityDiscounts: [] })).toThrow()
  })
  it('rejects steps below floor', () => {
    expect(() => NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3,
      perProduct: { robe: { floorPrice: 9000, steps: [8000] } }, quantityDiscounts: [] })).toThrow()
  })
  it('rejects percentOff outside ]0,50]', () => {
    for (const percentOff of [0, 51]) {
      expect(() => NegotiationPolicySchema.parse({ enabled: true, maxRounds: 3, perProduct: {},
        quantityDiscounts: [{ productId: 'robe', minQuantity: 2, percentOff }] })).toThrow()
    }
  })
  it('defaults maxRounds to 3', () => {
    expect(NegotiationPolicySchema.parse({ enabled: false, perProduct: {}, quantityDiscounts: [] }).maxRounds).toBe(3)
  })
})

describe('validateNegotiationAgainstCatalogue', () => {
  it('flags floor above a listed price and unknown productId', () => {
    const policy = NegotiationPolicySchema.parse({ enabled: true, perProduct: {
      robe: { floorPrice: 13000, steps: [] }, ghost: { floorPrice: 1, steps: [] } }, quantityDiscounts: [] })
    const errors = validateNegotiationAgainstCatalogue(policy, [robe])
    expect(errors).toHaveLength(2)
  })
  it('returns no errors for a consistent policy', () => {
    const policy = NegotiationPolicySchema.parse({ enabled: true, perProduct: { robe: { floorPrice: 9000, steps: [10000] } }, quantityDiscounts: [] })
    expect(validateNegotiationAgainstCatalogue(policy, [robe])).toEqual([])
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx nx test domain`
Expected: FAIL, module `./negotiation` introuvable.

- [ ] **Step 3: Implémenter**

`libs/domain/src/negotiation.ts` :

```ts
import { z } from 'zod'
import { listedPrices, type Product } from './product'

const ProductNegotiation = z
  .object({ floorPrice: z.number().int().nonnegative(), steps: z.array(z.number().int().nonnegative()) })
  .refine((p) => p.steps.every((s, i) => i === 0 || s < p.steps[i - 1]), { message: 'steps must be strictly decreasing' })
  .refine((p) => p.steps.every((s) => s >= p.floorPrice), { message: 'steps must be >= floorPrice' })

export const NegotiationPolicySchema = z.object({
  enabled: z.boolean(),
  perProduct: z.record(ProductNegotiation),
  quantityDiscounts: z.array(
    z.object({ productId: z.string().min(1), minQuantity: z.number().positive(), percentOff: z.number().gt(0).max(50) }),
  ),
  maxRounds: z.number().int().positive().default(3),
})

export type NegotiationPolicy = z.infer<typeof NegotiationPolicySchema>

/** Vérifie la cohérence avec le catalogue. Retourne les erreurs, vide si OK. */
export function validateNegotiationAgainstCatalogue(policy: NegotiationPolicy, catalogue: Product[]): string[] {
  const byId = new Map(catalogue.map((p) => [p.productId, p]))
  return Object.entries(policy.perProduct).flatMap(([productId, rule]) => {
    const product = byId.get(productId)
    if (!product) return [`negotiation.perProduct.${productId}: unknown product`]
    const minListed = Math.min(...listedPrices(product))
    return rule.floorPrice > minListed
      ? [`negotiation.perProduct.${productId}: floorPrice ${rule.floorPrice} > listed price ${minListed}`]
      : []
  })
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx nx test domain`
Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/domain/src/negotiation.ts libs/domain/src/negotiation.spec.ts
git commit -m "feat(domain): negotiation policy schema and catalogue consistency check"
```

---

### Task 5: `StyleProfile`, `DeliveryPolicy`, `Limits`

**Files:**
- Create: `libs/domain/src/style.ts`, `libs/domain/src/delivery.ts`, `libs/domain/src/limits.ts`, `libs/domain/src/style.spec.ts`, `libs/domain/src/delivery.spec.ts`

**Interfaces:**
- Produces: `StyleProfileSchema`/`StyleProfile`, `DeliveryPolicySchema`/`DeliveryPolicy`, `LimitsSchema`/`Limits`.

- [ ] **Step 1: Tests qui échouent**

`libs/domain/src/style.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { StyleProfileSchema } from './style'

const valid = { tone: 'chaleureux', greeting: 'Bonsoir ma sœur', signoff: 'Merci hein', languageMix: { primary: 'fr', secondary: 'fon', ratio: 0.2 },
  emojiLevel: 1, addressForm: 'tu', examples: [
    { customer: 'C combien ?', merchant: 'La robe est à 12 000, ma sœur' },
    { customer: 'Trop cher', merchant: 'Je peux te faire 11 000, dernier prix' },
    { customer: 'Ok', merchant: 'Super, tu es où pour la livraison ?' } ],
  fallbacks: ['Je vérifie et je te redis tout de suite', 'Laisse-moi confirmer avec la boutique'] }

describe('StyleProfileSchema', () => {
  it('accepts a valid profile', () => { expect(StyleProfileSchema.parse(valid).tone).toBe('chaleureux') })
  it('requires 3 to 10 examples', () => {
    expect(() => StyleProfileSchema.parse({ ...valid, examples: valid.examples.slice(0, 2) })).toThrow()
    expect(() => StyleProfileSchema.parse({ ...valid, examples: Array(11).fill(valid.examples[0]) })).toThrow()
  })
  it('requires at least 2 fallbacks', () => { expect(() => StyleProfileSchema.parse({ ...valid, fallbacks: ['x'] })).toThrow() })
  it('rejects ratio outside 0..1', () => { expect(() => StyleProfileSchema.parse({ ...valid, languageMix: { primary: 'fr', ratio: 1.5 } })).toThrow() })
})
```

`libs/domain/src/delivery.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { DeliveryPolicySchema } from './delivery'

describe('DeliveryPolicySchema', () => {
  it('accepts zones and payment methods', () => {
    const d = DeliveryPolicySchema.parse({ zones: [{ name: 'Cotonou', fee: 1000, delayHours: 24 }], paymentMethods: ['cash_on_delivery'] })
    expect(d.zones[0].fee).toBe(1000)
  })
  it('requires at least one payment method', () => {
    expect(() => DeliveryPolicySchema.parse({ zones: [], paymentMethods: [] })).toThrow()
  })
  it('rejects unknown payment method', () => {
    expect(() => DeliveryPolicySchema.parse({ zones: [], paymentMethods: ['bitcoin'] })).toThrow()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx nx test domain`
Expected: FAIL sur les deux modules manquants.

- [ ] **Step 3: Implémenter**

`libs/domain/src/style.ts` :

```ts
import { z } from 'zod'

export const StyleProfileSchema = z.object({
  tone: z.enum(['chaleureux', 'direct', 'formel']),
  greeting: z.string().min(1),
  signoff: z.string(),
  languageMix: z.object({
    primary: z.literal('fr'),
    secondary: z.enum(['fon', 'yoruba', 'en']).optional(),
    ratio: z.number().min(0).max(1),
  }),
  emojiLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  addressForm: z.enum(['tu', 'vous']),
  examples: z.array(z.object({ customer: z.string().min(1), merchant: z.string().min(1) })).min(3).max(10),
  fallbacks: z.array(z.string().min(1)).min(2),
})

export type StyleProfile = z.infer<typeof StyleProfileSchema>
```

`libs/domain/src/delivery.ts` :

```ts
import { z } from 'zod'

export const PaymentMethodSchema = z.enum(['cash_on_delivery', 'momo_mtn', 'momo_moov'])

export const DeliveryPolicySchema = z.object({
  zones: z.array(z.object({ name: z.string().min(1), fee: z.number().int().nonnegative(), delayHours: z.number().int().positive() })),
  pickupAddress: z.string().optional(),
  paymentMethods: z.array(PaymentMethodSchema).min(1),
})

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>
export type DeliveryPolicy = z.infer<typeof DeliveryPolicySchema>
```

`libs/domain/src/limits.ts` :

```ts
import { z } from 'zod'

export const LimitsSchema = z.object({
  maxRepliesPerMonth: z.number().int().positive().default(1000),
  maxReplyChars: z.number().int().min(80).max(1000).default(320),
})

export type Limits = z.infer<typeof LimitsSchema>
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx nx test domain`
Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/domain/src/style.ts libs/domain/src/delivery.ts libs/domain/src/limits.ts libs/domain/src/style.spec.ts libs/domain/src/delivery.spec.ts
git commit -m "feat(domain): style, delivery and limits schemas"
```

---

### Task 6: `MerchantProfile` + fixture pilote

**Files:**
- Create: `libs/domain/src/merchant-profile.ts`, `libs/domain/src/merchant-profile.spec.ts`, `libs/domain/fixtures/pilot-profile.ts`

**Interfaces:**
- Consumes: tous les schémas des tâches 3 à 5.
- Produces: `MerchantProfileSchema`, type `MerchantProfile`, `parseMerchantProfile(input: unknown): MerchantProfile` (lance une `Error` listant toutes les erreurs Zod + cohérence négociation), `pilotProfile: MerchantProfile`.

- [ ] **Step 1: Fixture**

`libs/domain/fixtures/pilot-profile.ts` :

```ts
import type { MerchantProfile } from '../src/merchant-profile'

/** Boutique pilote (mixte). Utilisée par les tests du moteur et le chat web. */
export const pilotProfile: MerchantProfile = {
  merchantId: 'pilot',
  displayName: 'Boutique Maman',
  currency: 'XOF',
  locale: 'fr-BJ',
  catalogue: [
    { productId: 'robe-rouge', name: 'Robe rouge', aliases: ['robe', 'robe rouge'], description: 'Robe en wax, coupe droite', photos: [], active: true, tags: ['vêtement'],
      pricing: { kind: 'unit', variants: [
        { variantId: 'm', label: 'Taille M', attributes: { taille: 'M' }, price: 12000, stock: 3 },
        { variantId: 'l', label: 'Taille L', attributes: { taille: 'L' }, price: 12000, stock: 0 } ] } },
    { productId: 'chaussure-noire', name: 'Chaussure noire', aliases: ['chaussure', 'chaussures'], description: 'Sandale cuir', photos: [], active: true, tags: ['chaussure'],
      pricing: { kind: 'unit', variants: [{ variantId: '40', label: 'Pointure 40', attributes: { pointure: '40' }, price: 8000, stock: null }] } },
    { productId: 'gari', name: 'Gari', aliases: ['gari'], description: 'Gari fin, au kilo', photos: [], active: true, tags: ['alimentation'],
      pricing: { kind: 'bulk', unitOfMeasure: 'kg', pricePerUnit: 600, minQuantity: 1, stepQuantity: 0.5, stockQuantity: 40 } },
    { productId: 'tenue-mesure', name: 'Tenue sur mesure', aliases: ['tenue', 'couture', 'tenue de mariage'], description: 'Tenue cousue à vos mesures', photos: [], active: true, tags: ['couture'],
      pricing: { kind: 'madeToOrder', basePrice: 25000, leadTimeDays: 7, depositPercent: 50, options: [{ label: 'broderie', extraPrice: 5000 }] } },
    { productId: 'ancien-sac', name: 'Sac ancien modèle', aliases: ['sac'], description: '', photos: [], active: false, tags: [],
      pricing: { kind: 'unit', variants: [{ variantId: 'u', label: 'Unique', attributes: {}, price: 5000, stock: 0 }] } },
  ],
  negotiation: {
    enabled: true,
    maxRounds: 3,
    perProduct: {
      'robe-rouge': { floorPrice: 10000, steps: [11500, 11000, 10000] },
      'chaussure-noire': { floorPrice: 7000, steps: [7500, 7000] },
      gari: { floorPrice: 600, steps: [] },
    },
    quantityDiscounts: [{ productId: 'robe-rouge', minQuantity: 3, percentOff: 10 }],
  },
  style: {
    tone: 'chaleureux',
    greeting: 'Bonsoir ma sœur, bien arrivée ?',
    signoff: 'Merci hein, à très vite',
    languageMix: { primary: 'fr', secondary: 'fon', ratio: 0.1 },
    emojiLevel: 1,
    addressForm: 'tu',
    examples: [
      { customer: 'La robe rouge c\'est combien ?', merchant: 'La robe rouge est à 12 000 ma sœur, il reste la taille M 🙂' },
      { customer: '12 000 c\'est trop', merchant: 'Je comprends, je te la laisse à 11 500, c\'est déjà un bon prix' },
      { customer: 'Ok je prends', merchant: 'Super ! Tu es où pour la livraison ?' },
      { customer: 'Vous livrez à Calavi ?', merchant: 'Oui, Calavi c\'est 1 500 de livraison, tu l\'as demain' },
    ],
    fallbacks: ['Je vérifie et je te redis tout de suite ma sœur', 'Laisse-moi confirmer avec la boutique, je reviens vers toi'],
  },
  delivery: {
    zones: [
      { name: 'Cotonou', fee: 1000, delayHours: 24 },
      { name: 'Calavi', fee: 1500, delayHours: 24 },
      { name: 'Porto-Novo', fee: 2500, delayHours: 48 },
    ],
    pickupAddress: 'Marché Dantokpa, allée 12',
    paymentMethods: ['cash_on_delivery', 'momo_mtn'],
  },
  limits: { maxRepliesPerMonth: 1000, maxReplyChars: 320 },
}
```

- [ ] **Step 2: Test qui échoue**

`libs/domain/src/merchant-profile.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { MerchantProfileSchema, parseMerchantProfile } from './merchant-profile'
import { pilotProfile } from '../fixtures/pilot-profile'

describe('MerchantProfile', () => {
  it('accepts the pilot fixture', () => {
    expect(MerchantProfileSchema.parse(pilotProfile).merchantId).toBe('pilot')
  })
  it('parseMerchantProfile rejects a floor above listed price with a readable message', () => {
    const bad = { ...pilotProfile, negotiation: { ...pilotProfile.negotiation,
      perProduct: { ...pilotProfile.negotiation.perProduct, gari: { floorPrice: 900, steps: [] } } } }
    expect(() => parseMerchantProfile(bad)).toThrow(/gari/)
  })
  it('parseMerchantProfile rejects duplicate productIds', () => {
    const bad = { ...pilotProfile, catalogue: [...pilotProfile.catalogue, pilotProfile.catalogue[0]] }
    expect(() => parseMerchantProfile(bad)).toThrow(/duplicate/)
  })
  it('parseMerchantProfile reports Zod errors with a path', () => {
    expect(() => parseMerchantProfile({ ...pilotProfile, currency: 'EUR' })).toThrow(/currency/)
  })
})
```

- [ ] **Step 3: Vérifier l'échec**

Run: `npx nx test domain`
Expected: FAIL, module `./merchant-profile` introuvable.

- [ ] **Step 4: Implémenter**

`libs/domain/src/merchant-profile.ts` :

```ts
import { z } from 'zod'
import { ProductSchema } from './product'
import { NegotiationPolicySchema, validateNegotiationAgainstCatalogue } from './negotiation'
import { StyleProfileSchema } from './style'
import { DeliveryPolicySchema } from './delivery'
import { LimitsSchema } from './limits'

export const MerchantProfileSchema = z.object({
  merchantId: z.string().min(1),
  displayName: z.string().min(1),
  currency: z.literal('XOF'),
  locale: z.literal('fr-BJ'),
  catalogue: z.array(ProductSchema),
  negotiation: NegotiationPolicySchema,
  style: StyleProfileSchema,
  delivery: DeliveryPolicySchema,
  limits: LimitsSchema,
})

export type MerchantProfile = z.infer<typeof MerchantProfileSchema>

function duplicateIds(profile: MerchantProfile): string[] {
  const seen = new Set<string>()
  return profile.catalogue
    .map((p) => p.productId)
    .filter((id) => (seen.has(id) ? true : (seen.add(id), false)))
    .map((id) => `catalogue: duplicate productId ${id}`)
}

/** Parse + vérifie la cohérence. Lance une Error listant toutes les erreurs. */
export function parseMerchantProfile(input: unknown): MerchantProfile {
  const result = MerchantProfileSchema.safeParse(input)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid merchant profile:\n${lines.join('\n')}`)
  }
  const profile = result.data
  const errors = [...duplicateIds(profile), ...validateNegotiationAgainstCatalogue(profile.negotiation, profile.catalogue)]
  if (errors.length > 0) throw new Error(`Invalid merchant profile:\n${errors.join('\n')}`)
  return profile
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npx nx test domain`
Expected: tous PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/domain/src/merchant-profile.ts libs/domain/src/merchant-profile.spec.ts libs/domain/fixtures/pilot-profile.ts
git commit -m "feat(domain): merchant profile schema, consistency checks and pilot fixture"
```

---

### Task 7: Export CSV + JSON

**Files:**
- Create: `libs/domain/src/export.ts`, `libs/domain/src/export.spec.ts`, `libs/domain/src/__snapshots__/` (généré)

**Interfaces:**
- Consumes: `MerchantProfile`, `Product`.
- Produces: `exportProfile(profile: MerchantProfile): { catalogueCsv: string; profileJson: string }`, `CATALOGUE_CSV_COLUMNS: readonly string[]`.

- [ ] **Step 1: Test qui échoue**

`libs/domain/src/export.spec.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { exportProfile, CATALOGUE_CSV_COLUMNS } from './export'
import { pilotProfile } from '../fixtures/pilot-profile'

describe('exportProfile', () => {
  const out = exportProfile(pilotProfile)
  it('starts with the documented header', () => {
    expect(out.catalogueCsv.split('\n')[0]).toBe(CATALOGUE_CSV_COLUMNS.join(','))
  })
  it('has one row per variant, bulk product and made-to-order product, including inactive', () => {
    const rows = out.catalogueCsv.trim().split('\n').slice(1)
    expect(rows).toHaveLength(6) // robe m, robe l, chaussure 40, gari, tenue, ancien-sac
  })
  it('escapes commas and quotes in fields', () => {
    const profile = { ...pilotProfile, catalogue: [{ ...pilotProfile.catalogue[0], name: 'Robe "wax", rouge' }] }
    expect(exportProfile(profile).catalogueCsv).toContain('"Robe ""wax"", rouge"')
  })
  it('profileJson round-trips', () => {
    expect(JSON.parse(out.profileJson)).toEqual(pilotProfile)
  })
  it('matches snapshot', () => {
    expect(out.catalogueCsv).toMatchSnapshot()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx nx test domain`
Expected: FAIL, module `./export` introuvable.

- [ ] **Step 3: Implémenter**

`libs/domain/src/export.ts` :

```ts
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
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx nx test domain`
Expected: tous PASS, snapshot écrit.

- [ ] **Step 5: Commit**

```bash
git add libs/domain/src/export.ts libs/domain/src/export.spec.ts libs/domain/src/__snapshots__
git commit -m "feat(domain): catalogue CSV and profile JSON export"
```

---

### Task 8: Index public et couverture

**Files:**
- Modify: `libs/domain/src/index.ts`
- Modify: `libs/domain/vite.config.ts` (seuil de couverture)

**Interfaces:**
- Produces: `@wa/domain` exporte tout ce que les plans 2 et 3 consomment.

- [ ] **Step 1: Index**

`libs/domain/src/index.ts` :

```ts
export * from './product'
export * from './negotiation'
export * from './style'
export * from './delivery'
export * from './limits'
export * from './merchant-profile'
export * from './export'
export { pilotProfile } from '../fixtures/pilot-profile'
```

- [ ] **Step 2: Seuil de couverture**

Dans `libs/domain/vite.config.ts`, section `test.coverage`, ajouter :

```ts
coverage: {
  reportsDirectory: '../../coverage/libs/domain',
  provider: 'v8',
  thresholds: { lines: 90, functions: 90, branches: 85 },
},
```

- [ ] **Step 3: Vérifier**

Run: `npx nx test domain --coverage`
Expected: PASS, seuils respectés. Sinon, ajouter le test manquant (pas baisser le seuil).

Run: `npx tsc -p libs/domain/tsconfig.lib.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add libs/domain/src/index.ts libs/domain/vite.config.ts
git commit -m "chore(domain): public index and coverage thresholds"
```

---

## Self-review

- **Couverture spec 1** : Product (T3), NegotiationPolicy + invariants (T4), StyleProfile/DeliveryPolicy/Limits (T5), MerchantProfile + fixture (T6), Export (T7), tests et seuil 90 % (T8). Spec 2 § spike (T2).
- **Placeholders** : aucun. Le tableau du README du spike est rempli à l'exécution avec les chiffres mesurés.
- **Cohérence des types** : `listedPrices` défini T3, consommé T4. `MerchantProfile` défini T6, consommé T7. `pilotProfile` défini T6, consommé T7 et T8. Noms de champs identiques à la spec 1 (`fallbacks` ajouté à `StyleProfile` dans la spec).
