# Plan 2 — `llm-provider` + `engine` (moteur de conversation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le moteur de conversation pur et testé : `libs/llm-provider` (interface + mock + client OpenAI-compatible) et `libs/engine` (négociation, garde-fou, machine à états, intention, rédaction, pipeline), plus une dizaine de scénarios YAML rejouables.

**Architecture:** Le LLM décide _quoi_ le client veut (intention, JSON contraint), le code décide _ce qui est vrai et permis_ (machine à états + négociation), le LLM met en mots (composer), le code vérifie (garde-fou sur les nombres). `libs/engine` est **pur** : aucune I/O, aucune horloge, aucun aléatoire hors provider. Toute persistance et tout accès réseau sont repoussés au plan 3 (`apps/api`, `apps/cli`, `apps/backoffice`).

**Tech Stack:** Node 22, NX 23.2.1, TypeScript 5.9, Zod 3, Vitest 3.2, `yaml` (devDependency, scénarios de test uniquement). Aucun SDK fournisseur LLM.

**Spec:** `docs/superpowers/specs/2026-09-20-conversation-engine-design.md` (et spec 1 `docs/superpowers/specs/2026-09-20-merchant-profile-contract-design.md` pour les schémas déjà livrés).

## Global Constraints

- **Pureté** : `libs/engine` n'appelle jamais `Date.now()`, `Math.random()`, `fetch`, ni le système de fichiers. L'horloge est le champ `receivedAt` (ISO 8601) passé en entrée. Le seul effet de bord autorisé est l'appel `provider.complete(...)`.
- **Dépendances runtime** : `libs/llm-provider` → `zod` seulement. `libs/engine` → `zod`, `@wa/domain`, `@wa/llm-provider` seulement.
- **Le LLM n'énonce jamais un nombre non validé** (CLAUDE.md §3.5). Traité par le garde-fou, jamais par le prompt seul.
- **Quota avant tout appel LLM** (spec §Pipeline 1). Un `ProviderDown` **ne décompte pas** le quota ; un `GuardrailTripped` suivi d'une réponse sûre **décompte** (les appels LLM ont eu lieu).
- Prix : entiers (XOF). Stock : entier ou `null` (= illimité).
- Immutabilité : fonctions pures, aucune mutation d'argument, `readonly` partout où c'est naturel.
- Fichiers ≤ 400 lignes, fonctions < 50 lignes, profondeur d'imbrication ≤ 4.
- Pas de `console.log` dans le code produit.
- Prettier avant chaque commit : `npx prettier --write <fichiers>` (`{ "singleQuote": true, "semi": false, "printWidth": 100 }`).
- Commits `<type>: <description>` (feat, fix, chore, test, docs, refactor). **Aucune ligne d'attribution.**
- Ne pas toucher `index.html`, `app.js`, `styles.css`, `logo.png`, `CNAME`.
- Couverture : 90 % lignes/fonctions, 85 % branches sur `libs/llm-provider` et `libs/engine` ; 95 % lignes sur `negotiation-engine.ts` et `guardrail.ts` (vérifié à la lecture du rapport, pas par un seuil par fichier).

## File Structure

```
tools/vitest/nx-coverage.mts          helper partagé : couverture désactivée sur les cibles test-ci--*
libs/domain/src/conversation.ts       ConversationState, ReplyCounter (schémas + helpers purs)
libs/domain/src/order.ts              Order, OrderLine
libs/llm-provider/src/provider.ts     LlmProvider, LlmRequest/Response, erreurs typées
libs/llm-provider/src/mock-provider.ts        MockProvider (file de réponses scriptées)
libs/llm-provider/src/openai-compatible.ts    OpenAiCompatibleProvider (fetch, timeout, retry 5xx)
libs/engine/src/events.ts             EngineEvent (union discriminée)
libs/engine/src/negotiation-engine.ts evaluateNegotiation (pur)
libs/engine/src/guardrail.ts          extractNumbers, checkReply, truncateToSentence (pur)
libs/engine/src/facts.ts              TurnFact (union discriminée)
libs/engine/src/allowed.ts            nombres et libellés que le composer peut citer
libs/engine/src/intent-schema.ts      IntentSchema, ProductRefSchema, INTENT_JSON_SCHEMA (zod seul)
libs/engine/src/catalogue.ts          résolution productRefs → produit + prix + stock (pur)
libs/engine/src/state-machine.ts      transition (pur)
libs/engine/src/intent.ts             classifyIntent (appel LLM n°1)
libs/engine/src/prompts/intent.ts     buildIntentPrompt
libs/engine/src/prompts/composer.ts   buildComposerPrompt
libs/engine/src/composer.ts           composeReply
libs/engine/src/pipeline.ts           handleMessage (orchestration)
libs/engine/src/index.ts              API publique
libs/engine/scenarios/*.yaml          scénarios de bout en bout
libs/engine/src/scenarios.spec.ts     runner des scénarios
```

---

### Task 1: Durcir `tsconfig.base.json` et factoriser le helper de couverture

**Files:**

- Modify: `tsconfig.base.json`, `libs/domain/tsconfig.json`, `libs/domain/vitest.config.mts`
- Create: `tools/vitest/nx-coverage.mts`

**Interfaces:**

- Produces: `tools/vitest/nx-coverage.mts` exporte `coverageEnabledForTarget(): boolean`. Les alias de chemins `@wa/llm-provider` et `@wa/engine` sont ajoutés dans `tsconfig.base.json` (les libs seront créées aux tâches 3 et 5 ; les alias pointent vers des fichiers qui n'existent pas encore, ce qui est sans effet tant que rien ne les importe).

- [ ] **Step 1: Créer la branche**

```bash
git checkout main
git pull --ff-only || true
git checkout -b feat/plan-2-engine
```

- [ ] **Step 2: Constater l'état de départ**

Run: `npx nx run domain:test`
Expected: 47 tests verts (baseline du plan 1). Noter le chiffre, il doit rester ≥ après cette tâche.

- [ ] **Step 3: Durcir `tsconfig.base.json`**

Remplacer le contenu par :

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "lib": ["es2022"],
    "importHelpers": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@wa/domain": ["./libs/domain/src/index.ts"],
      "@wa/llm-provider": ["./libs/llm-provider/src/index.ts"],
      "@wa/engine": ["./libs/engine/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp", "dist"]
}
```

Note : `lib` ne contient plus `"dom"`. `Response`, `RequestInit` et `AbortController` utilisés à la tâche 4 viennent alors des globales `@types/node` (Node 22 les fournit). Si `tsc` les déclare introuvables, ajouter `"lib": ["es2022", "dom"]` **dans `libs/llm-provider/tsconfig.json` seulement**, pas dans la base.

Notes de décision (à ne pas re-débattre) : `moduleResolution: "bundler"` est retenu une fois pour toutes — tout le code est consommé via alias NX et empaqueté par Vite/esbuild ; `emitDecoratorMetadata`, `experimentalDecorators` et `lib: ["dom"]` sont retirés (aucune lib n'en a besoin, Angular arrivera avec son propre tsconfig en plan 3) ; `skipDefaultLibCheck` est redondant avec `skipLibCheck`.

- [ ] **Step 4: Retirer la surcharge `module: commonjs` de la lib domain**

Dans `libs/domain/tsconfig.json`, supprimer la ligne `"module": "commonjs",` et les options désormais héritées de la base (`forceConsistentCasingInFileNames`, `strict`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`). Conserver `importHelpers` et `noPropertyAccessFromIndexSignature`. Résultat attendu :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "importHelpers": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.lib.json" }, { "path": "./tsconfig.spec.json" }]
}
```

- [ ] **Step 5: Typecheck — attendre des erreurs**

Run: `npx tsc -p libs/domain/tsconfig.lib.json --noEmit && npx tsc -p libs/domain/tsconfig.spec.json --noEmit`
Expected: `noUncheckedIndexedAccess` fait probablement remonter des erreurs, notamment dans `libs/domain/src/negotiation.ts` sur `p.steps[i - 1]` (type `number | undefined`).

- [ ] **Step 6: Corriger les erreurs remontées**

Correctif attendu dans `libs/domain/src/negotiation.ts`, refine `steps must be strictly decreasing` :

```ts
  .refine((p) => p.steps.every((s, i) => i === 0 || s < (p.steps[i - 1] as number)), {
    message: 'steps must be strictly decreasing',
  })
```

Préférer une reformulation sans assertion quand elle est aussi lisible :

```ts
  .refine((p) => p.steps.every((s, i) => i === 0 || s < p.steps.slice(0, i).at(-1)!), {
```

Pour toute autre erreur : corriger **le code**, jamais en relâchant une option du tsconfig.

- [ ] **Step 7: Créer le helper de couverture partagé**

`tools/vitest/nx-coverage.mts` :

```ts
/**
 * Les cibles atomisées `test-ci--*` n'exécutent qu'un fichier de spec : la couverture par fichier
 * n'atteint jamais les seuils de la lib entière. On active donc la couverture pour la cible
 * agrégée `test` (et pour un `vitest` nu), pas pour les enfants `test-ci`.
 */
export function coverageEnabledForTarget(): boolean {
  return !(process.env['NX_TASK_TARGET_TARGET'] ?? '').startsWith('test-ci')
}
```

- [ ] **Step 8: Brancher le helper dans `libs/domain/vitest.config.mts`**

Remplacer le bloc de commentaire + `enabled:` par :

```ts
import { coverageEnabledForTarget } from '../../tools/vitest/nx-coverage.mts'
```

et dans `coverage` :

```ts
      enabled: coverageEnabledForTarget(),
```

- [ ] **Step 9: Vérifier**

Run: `npx tsc -p libs/domain/tsconfig.lib.json --noEmit && npx tsc -p libs/domain/tsconfig.spec.json --noEmit && npx nx run domain:test`
Expected: 0 erreur tsc, 47 tests verts, seuils de couverture tenus.

- [ ] **Step 10: Commit**

```bash
npx prettier --write tsconfig.base.json libs/domain tools/vitest
git add tsconfig.base.json libs/domain tools/vitest
git commit -m "chore: strict tsconfig base, shared vitest coverage helper"
```

---

### Task 2: `libs/domain` — `ConversationState`, `ReplyCounter`, `Order`

**Files:**

- Create: `libs/domain/src/conversation.ts`, `libs/domain/src/conversation.spec.ts`, `libs/domain/src/order.ts`, `libs/domain/src/order.spec.ts`
- Modify: `libs/domain/src/index.ts`

**Interfaces:**

- Consumes: `PaymentMethodSchema` (`./delivery`).
- Produces:
  - `ConversationStateSchema`, `type ConversationState`, `type ConversationPhase`, `type ConversationTurn`
  - `newConversationState(merchantId: string, customerId: string, at: string): ConversationState`
  - `appendTurn(state: ConversationState, turn: ConversationTurn): ConversationState` (fenêtre glissante de 12)
  - `expireConversation(state: ConversationState, now: string): ConversationState`
  - `STATE_EXPIRY_HOURS = 72`, `CART_RETENTION_DAYS = 7`, `MAX_TURNS = 12`
  - `ReplyCounterSchema`, `type ReplyCounter`, `periodOf(iso: string): string`, `incrementCounter(counter, at): ReplyCounter`
  - `OrderSchema`, `type Order`, `type OrderLine`

- [ ] **Step 1: Écrire les tests de `conversation.ts`**

`libs/domain/src/conversation.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import {
  appendTurn,
  ConversationStateSchema,
  expireConversation,
  incrementCounter,
  MAX_TURNS,
  newConversationState,
  periodOf,
  ReplyCounterSchema,
} from './conversation'

const at = '2026-09-21T10:00:00.000Z'

describe('newConversationState', () => {
  it('starts idle, empty and parseable', () => {
    const state = newConversationState('m1', 'c1', at)
    expect(state.phase).toBe('idle')
    expect(state.turns).toEqual([])
    expect(state.cart).toEqual([])
    expect(ConversationStateSchema.parse(state)).toEqual(state)
  })
})

describe('appendTurn', () => {
  it('does not mutate the input state', () => {
    const state = newConversationState('m1', 'c1', at)
    appendTurn(state, { role: 'customer', text: 'bonsoir', at })
    expect(state.turns).toEqual([])
  })

  it('keeps only the last MAX_TURNS turns', () => {
    const turns = Array.from({ length: MAX_TURNS + 3 }, (_, i) => ({
      role: 'customer' as const,
      text: `msg ${i}`,
      at,
    }))
    const state = turns.reduce(appendTurn, newConversationState('m1', 'c1', at))
    expect(state.turns).toHaveLength(MAX_TURNS)
    expect(state.turns[0]?.text).toBe('msg 3')
  })

  it('updates lastActivityAt', () => {
    const later = '2026-09-21T11:00:00.000Z'
    const state = appendTurn(newConversationState('m1', 'c1', at), {
      role: 'customer',
      text: 'hi',
      at: later,
    })
    expect(state.lastActivityAt).toBe(later)
  })
})

describe('expireConversation', () => {
  const withCart = {
    ...newConversationState('m1', 'c1', at),
    phase: 'cart' as const,
    cart: [{ productId: 'p1', quantity: 1, unitPrice: 1000, agreedPrice: 1000 }],
    turns: [{ role: 'customer' as const, text: 'hi', at }],
  }

  it('leaves a fresh conversation untouched', () => {
    const now = '2026-09-24T09:00:00.000Z' // 71 h
    expect(expireConversation(withCart, now)).toEqual(withCart)
  })

  it('resets phase and turns after 72 h but keeps the cart', () => {
    const now = '2026-09-24T11:00:00.000Z' // 73 h
    const expired = expireConversation(withCart, now)
    expect(expired.phase).toBe('idle')
    expect(expired.turns).toEqual([])
    expect(expired.cart).toEqual(withCart.cart)
    expect(expired.negotiation).toEqual({})
  })

  it('drops the cart after 7 days', () => {
    const now = '2026-09-29T10:00:01.000Z' // 8 jours
    expect(expireConversation(withCart, now).cart).toEqual([])
  })
})

describe('reply counter', () => {
  it('derives the period from an ISO timestamp', () => {
    expect(periodOf('2026-09-21T10:00:00.000Z')).toBe('2026-09')
  })

  it('increments within the same period', () => {
    const counter = ReplyCounterSchema.parse({ merchantId: 'm1', period: '2026-09', replies: 4 })
    expect(incrementCounter(counter, at)).toEqual({ ...counter, replies: 5 })
  })

  it('resets when the period changes', () => {
    const counter = ReplyCounterSchema.parse({ merchantId: 'm1', period: '2026-08', replies: 900 })
    expect(incrementCounter(counter, at)).toEqual({
      merchantId: 'm1',
      period: '2026-09',
      replies: 1,
    })
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npx vitest run libs/domain/src/conversation.spec.ts`
Expected: FAIL, `Failed to resolve import "./conversation"`.

- [ ] **Step 3: Implémenter `conversation.ts`**

```ts
import { z } from 'zod'

export const MAX_TURNS = 12
export const STATE_EXPIRY_HOURS = 72
export const CART_RETENTION_DAYS = 7

const isoDateTime = z.string().datetime()
const price = z.number().int().nonnegative()

export const ConversationPhaseSchema = z.enum([
  'idle',
  'browsing',
  'negotiating',
  'cart',
  'address',
  'confirmed',
  'cancelled',
])

export const ConversationTurnSchema = z.object({
  role: z.enum(['customer', 'bot']),
  text: z.string(),
  at: isoDateTime,
})

export const CartLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().positive(),
  unitPrice: price,
  agreedPrice: price,
})

export const ConversationStateSchema = z.object({
  merchantId: z.string().min(1),
  customerId: z.string().min(1),
  phase: ConversationPhaseSchema,
  turns: z.array(ConversationTurnSchema).max(MAX_TURNS),
  cart: z.array(CartLineSchema),
  negotiation: z.record(z.object({ round: z.number().int().nonnegative(), currentOffer: price })),
  address: z.object({ text: z.string().min(1), zone: z.string().min(1).optional() }).optional(),
  lastActivityAt: isoDateTime,
})

export type ConversationPhase = z.infer<typeof ConversationPhaseSchema>
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>
export type CartLine = z.infer<typeof CartLineSchema>
export type ConversationState = z.infer<typeof ConversationStateSchema>

export function newConversationState(
  merchantId: string,
  customerId: string,
  at: string,
): ConversationState {
  return {
    merchantId,
    customerId,
    phase: 'idle',
    turns: [],
    cart: [],
    negotiation: {},
    lastActivityAt: at,
  }
}

/** Ajoute un tour et garde la fenêtre glissante des `MAX_TURNS` derniers. */
export function appendTurn(state: ConversationState, turn: ConversationTurn): ConversationState {
  return { ...state, turns: [...state.turns, turn].slice(-MAX_TURNS), lastActivityAt: turn.at }
}

const HOUR_MS = 3_600_000

function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / HOUR_MS
}

/**
 * Applique les péremptions : conversation remise à `idle` après 72 h sans message,
 * panier vidé après 7 jours. `now` est fourni par l'appelant (le moteur n'a pas d'horloge).
 */
export function expireConversation(state: ConversationState, now: string): ConversationState {
  const idleHours = hoursBetween(state.lastActivityAt, now)
  if (idleHours <= STATE_EXPIRY_HOURS) return state
  const cart = idleHours > CART_RETENTION_DAYS * 24 ? [] : state.cart
  return { ...state, phase: 'idle', turns: [], negotiation: {}, address: undefined, cart }
}

export const ReplyCounterSchema = z.object({
  merchantId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  replies: z.number().int().nonnegative(),
})

export type ReplyCounter = z.infer<typeof ReplyCounterSchema>

/** Période de facturation `YYYY-MM` en UTC. */
export function periodOf(iso: string): string {
  return iso.slice(0, 7)
}

export function incrementCounter(counter: ReplyCounter, at: string): ReplyCounter {
  const period = periodOf(at)
  return period === counter.period
    ? { ...counter, replies: counter.replies + 1 }
    : { merchantId: counter.merchantId, period, replies: 1 }
}
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run libs/domain/src/conversation.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Écrire les tests de `order.ts`**

`libs/domain/src/order.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { OrderSchema, orderTotal } from './order'

const line = {
  productId: 'p1',
  label: 'Robe rouge',
  quantity: 2,
  unitPrice: 12000,
  agreedPrice: 10000,
}

const order = {
  orderId: 'm1:c1:2026-09-21T10:00:00.000Z',
  merchantId: 'm1',
  customerId: 'c1',
  lines: [line],
  subtotal: 20000,
  deliveryFee: 1000,
  total: 21000,
  address: { text: 'Fidjrossè carrefour pharmacie', zone: 'Cotonou' },
  paymentMethod: 'cash_on_delivery',
  createdAt: '2026-09-21T10:00:00.000Z',
}

describe('OrderSchema', () => {
  it('accepts a coherent order', () => {
    expect(OrderSchema.parse(order)).toEqual(order)
  })

  it('rejects an order with no line', () => {
    expect(() => OrderSchema.parse({ ...order, lines: [] })).toThrow()
  })

  it('rejects a total that is not subtotal + deliveryFee', () => {
    const result = OrderSchema.safeParse({ ...order, total: 99999 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['total'])
  })

  it('rejects a subtotal that does not match the lines', () => {
    const result = OrderSchema.safeParse({ ...order, subtotal: 1, total: 1001 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['subtotal'])
  })

  it('accepts a deposit for a made-to-order line', () => {
    expect(OrderSchema.parse({ ...order, depositAmount: 5000 }).depositAmount).toBe(5000)
  })
})

describe('orderTotal', () => {
  it('sums agreedPrice times quantity plus the delivery fee', () => {
    expect(orderTotal([line, { ...line, quantity: 1, agreedPrice: 3000 }], 1000)).toEqual({
      subtotal: 23000,
      total: 24000,
    })
  })
})
```

- [ ] **Step 6: Lancer — doit échouer**

Run: `npx vitest run libs/domain/src/order.spec.ts`
Expected: FAIL, import non résolu.

- [ ] **Step 7: Implémenter `order.ts`**

```ts
import { z } from 'zod'
import { PaymentMethodSchema } from './delivery'

const price = z.number().int().nonnegative()

export const OrderLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  label: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: price,
  agreedPrice: price,
})

export type OrderLine = z.infer<typeof OrderLineSchema>

/** Sous-total (prix convenus × quantités) et total livraison comprise. */
export function orderTotal(
  lines: readonly OrderLine[],
  deliveryFee: number,
): { subtotal: number; total: number } {
  const subtotal = lines.reduce((sum, l) => sum + l.agreedPrice * l.quantity, 0)
  return { subtotal, total: subtotal + deliveryFee }
}

export const OrderSchema = z
  .object({
    orderId: z.string().min(1),
    merchantId: z.string().min(1),
    customerId: z.string().min(1),
    lines: z.array(OrderLineSchema).min(1),
    subtotal: price,
    deliveryFee: price,
    total: price,
    address: z.object({ text: z.string().min(1), zone: z.string().min(1).optional() }),
    paymentMethod: PaymentMethodSchema,
    depositAmount: price.optional(),
    createdAt: z.string().datetime(),
  })
  .superRefine((order, ctx) => {
    const { subtotal, total } = orderTotal(order.lines, order.deliveryFee)
    if (order.subtotal !== subtotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subtotal'],
        message: `subtotal ${order.subtotal} does not match lines total ${subtotal}`,
      })
    }
    if (order.total !== order.subtotal + order.deliveryFee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['total'],
        message: `total ${order.total} != subtotal ${order.subtotal} + deliveryFee ${order.deliveryFee}`,
      })
    }
    if (order.depositAmount !== undefined && order.depositAmount > order.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['depositAmount'],
        message: `depositAmount ${order.depositAmount} > total ${order.total}`,
      })
    }
  })

export type Order = z.infer<typeof OrderSchema>
```

- [ ] **Step 8: Exporter et vérifier**

Ajouter dans `libs/domain/src/index.ts`, avant la ligne `export { pilotProfile }` :

```ts
export * from './conversation'
export * from './order'
```

Run: `npx nx run domain:test`
Expected: tous verts, couverture ≥ seuils (90/90/85).

- [ ] **Step 9: Commit**

```bash
npx prettier --write libs/domain
git add libs/domain
git commit -m "feat(domain): conversation state, reply counter and order schemas"
```

---

### Task 3: `libs/llm-provider` — interface et `MockProvider`

**Files:**

- Create: `libs/llm-provider/*` (généré), `libs/llm-provider/src/provider.ts`, `libs/llm-provider/src/mock-provider.ts`, `libs/llm-provider/src/mock-provider.spec.ts`, `libs/llm-provider/src/index.ts`
- Modify: `libs/llm-provider/vitest.config.mts`, `libs/llm-provider/tsconfig.json`

**Interfaces:**

- Produces:
  - `interface LlmProvider { complete(req: LlmRequest): Promise<LlmResponse> }`
  - `interface LlmRequest { system: string; messages: LlmMessage[]; jsonSchema?: object; maxTokens: number }`
  - `interface LlmMessage { role: 'user' | 'assistant'; content: string }`
  - `interface LlmResponse { text: string; usage: { inputTokens: number; outputTokens: number } }`
  - `class LlmUnavailableError extends Error` (timeout, réseau, 5xx après retry, 4xx)
  - `class MockProvider implements LlmProvider` — `new MockProvider(script: MockScript[])`, `type MockScript = string | LlmResponse | Error | ((req: LlmRequest) => LlmResponse)`, propriété `calls: LlmRequest[]`, méthode `pushScript(...)`

- [ ] **Step 1: Générer la lib**

```bash
npx nx g @nx/js:library libs/llm-provider --name=llm-provider --unitTestRunner=vitest \
  --bundler=none --linter=none --importPath=@wa/llm-provider --useProjectJson=true --no-interactive --dry-run
```

Lire la sortie du `--dry-run` : si une option n'existe pas sur cette version du générateur NX, l'ajuster **avant** de relancer sans `--dry-run`.

Expected: `libs/llm-provider/` créé avec `project.json`, `vitest.config.mts`, les trois `tsconfig`. Si le générateur ajoute une entrée `paths` dans `tsconfig.base.json`, la conserver (elle doit être identique à celle de la tâche 1).

- [ ] **Step 2: Aligner la configuration sur celle de `domain`**

- `libs/llm-provider/tsconfig.json` : ne garder que `importHelpers` et `noPropertyAccessFromIndexSignature` dans `compilerOptions` (tout le reste vient de la base durcie).
- `libs/llm-provider/vitest.config.mts` : `test.name: 'llm-provider'`, `cacheDir: '../../node_modules/.vite/libs/llm-provider'`, et le bloc coverage :

```ts
import { coverageEnabledForTarget } from '../../tools/vitest/nx-coverage.mts'
// ...
    coverage: {
      enabled: coverageEnabledForTarget(),
      reportsDirectory: '../../coverage/libs/llm-provider',
      provider: 'v8' as const,
      thresholds: { lines: 90, functions: 90, branches: 85 },
    },
```

- Supprimer les fichiers de démonstration générés (`src/lib/llm-provider.ts` et son spec) s'ils existent.

- [ ] **Step 3: Écrire le test du MockProvider**

`libs/llm-provider/src/mock-provider.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { LlmUnavailableError } from './provider'
import { MockProvider } from './mock-provider'

const req = { system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 100 }

describe('MockProvider', () => {
  it('returns scripted replies in order', async () => {
    const provider = new MockProvider(['first', 'second'])
    expect((await provider.complete(req)).text).toBe('first')
    expect((await provider.complete(req)).text).toBe('second')
  })

  it('records every request it received', async () => {
    const provider = new MockProvider(['ok'])
    await provider.complete(req)
    expect(provider.calls).toEqual([req])
  })

  it('reports a default usage for string scripts', async () => {
    const provider = new MockProvider(['ok'])
    expect((await provider.complete(req)).usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('rejects when the script entry is an Error', async () => {
    const provider = new MockProvider([new LlmUnavailableError('timeout')])
    await expect(provider.complete(req)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('supports a function script that sees the request', async () => {
    const provider = new MockProvider([
      (r) => ({ text: r.system, usage: { inputTokens: 1, outputTokens: 2 } }),
    ])
    expect((await provider.complete(req)).text).toBe('sys')
  })

  it('throws a clear error when the script is exhausted', async () => {
    const provider = new MockProvider([])
    await expect(provider.complete(req)).rejects.toThrow('MockProvider script exhausted')
  })
})
```

- [ ] **Step 4: Lancer — doit échouer**

Run: `npx vitest run libs/llm-provider/src/mock-provider.spec.ts`
Expected: FAIL, imports non résolus.

- [ ] **Step 5: Implémenter `provider.ts`**

```ts
export interface LlmMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface LlmRequest {
  readonly system: string
  readonly messages: readonly LlmMessage[]
  /** Schéma JSON passé au modèle pour contraindre la sortie (mode JSON structuré). */
  readonly jsonSchema?: object
  readonly maxTokens: number
}

export interface LlmUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface LlmResponse {
  readonly text: string
  readonly usage: LlmUsage
}

export interface LlmProvider {
  complete(req: LlmRequest): Promise<LlmResponse>
}

/** Le fournisseur n'a pas pu répondre : timeout, réseau, 5xx après retry, ou réponse illisible. */
export class LlmUnavailableError extends Error {
  override readonly name = 'LlmUnavailableError'
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}
```

- [ ] **Step 6: Implémenter `mock-provider.ts`**

```ts
import type { LlmProvider, LlmRequest, LlmResponse } from './provider'

export type MockScript = string | LlmResponse | Error | ((req: LlmRequest) => LlmResponse)

const NO_USAGE = { inputTokens: 0, outputTokens: 0 } as const

/** Fournisseur scripté pour les tests : consomme une entrée de script par appel. */
export class MockProvider implements LlmProvider {
  readonly calls: LlmRequest[] = []
  private readonly script: MockScript[]

  constructor(script: readonly MockScript[] = []) {
    this.script = [...script]
  }

  pushScript(...entries: MockScript[]): void {
    this.script.push(...entries)
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req)
    const entry = this.script.shift()
    if (entry === undefined) {
      throw new Error(`MockProvider script exhausted after ${this.calls.length} call(s)`)
    }
    if (entry instanceof Error) throw entry
    if (typeof entry === 'string') return { text: entry, usage: NO_USAGE }
    if (typeof entry === 'function') return entry(req)
    return entry
  }
}
```

`calls` et `script` sont des tableaux mutables internes au double de test : l'immutabilité s'applique au code produit, pas au journal d'appels d'un mock.

- [ ] **Step 7: `index.ts` et vérification**

```ts
export * from './provider'
export * from './mock-provider'
```

Run: `npx nx run llm-provider:test`
Expected: 6 tests verts.

- [ ] **Step 8: Commit**

```bash
npx prettier --write libs/llm-provider tsconfig.base.json
git add libs/llm-provider tsconfig.base.json package.json package-lock.json
git commit -m "feat(llm-provider): provider interface and MockProvider"
```

---

### Task 4: `libs/llm-provider` — `OpenAiCompatibleProvider`

**Files:**

- Create: `libs/llm-provider/src/openai-compatible.ts`, `libs/llm-provider/src/openai-compatible.spec.ts`
- Modify: `libs/llm-provider/src/index.ts`

**Interfaces:**

- Consumes: `LlmProvider`, `LlmRequest`, `LlmResponse`, `LlmUnavailableError` (tâche 3).
- Produces: `class OpenAiCompatibleProvider implements LlmProvider`, construit par
  `new OpenAiCompatibleProvider({ baseUrl, model, apiKey?, timeoutMs?, fetchImpl? })`.
  `timeoutMs` par défaut 20000. `fetchImpl` par défaut `globalThis.fetch` — injecté par les tests, jamais par le code produit. **Aucune lecture de `process.env` ici** : la configuration est lue par `apps/api` (plan 3) et passée au constructeur.

- [ ] **Step 1: Écrire les tests**

`libs/llm-provider/src/openai-compatible.spec.ts` :

```ts
import { describe, expect, it, vi } from 'vitest'
import { LlmUnavailableError } from './provider'
import { OpenAiCompatibleProvider, type FetchLike } from './openai-compatible'

const req = {
  system: 'sys',
  messages: [{ role: 'user' as const, content: 'salut' }],
  maxTokens: 120,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const okBody = {
  choices: [{ message: { content: 'bonsoir' } }],
  usage: { prompt_tokens: 42, completion_tokens: 7 },
}

describe('OpenAiCompatibleProvider', () => {
  it('posts to /v1/chat/completions and maps the reply', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5:14b-instruct-q4_K_M',
      fetchImpl,
    })

    const res = await provider.complete(req)

    expect(res).toEqual({ text: 'bonsoir', usage: { inputTokens: 42, outputTokens: 7 } })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse(init!.body as string)
    expect(body.model).toBe('qwen2.5:14b-instruct-q4_K_M')
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(120)
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'salut' },
    ])
    expect(body.response_format).toBeUndefined()
  })

  it('trims a trailing slash on baseUrl', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    await new OpenAiCompatibleProvider({ baseUrl: 'http://x/', model: 'm', fetchImpl }).complete(
      req,
    )
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://x/v1/chat/completions')
  })

  it('sends the json schema as response_format when provided', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    const schema = { type: 'object', properties: {} }

    await provider.complete({ ...req, jsonSchema: schema })

    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'reply', strict: true, schema },
    })
  })

  it('sends the Authorization header only when an apiKey is given', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    await new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl }).complete(req)
    expect(
      (fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>).Authorization,
    ).toBeUndefined()

    const keyed = vi.fn<FetchLike>(async () => jsonResponse(okBody))
    await new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      apiKey: 'k',
      fetchImpl: keyed,
    }).complete(req)
    expect((keyed.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer k',
    )
  })

  it('retries once on 5xx then succeeds', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503))
      .mockResolvedValueOnce(jsonResponse(okBody))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    expect((await provider.complete(req)).text).toBe('bonsoir')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws LlmUnavailableError after a second 5xx', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ error: 'boom' }, 503))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    await expect(provider.complete(req)).rejects.toBeInstanceOf(LlmUnavailableError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 4xx', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ error: 'bad key' }, 401))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })

    await expect(provider.complete(req)).rejects.toThrow(/401/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws LlmUnavailableError when the payload has no content', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ choices: [] }))
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    await expect(provider.complete(req)).rejects.toBeInstanceOf(LlmUnavailableError)
  })

  it('defaults usage to zero when the server omits it', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    const provider = new OpenAiCompatibleProvider({ baseUrl: 'http://x', model: 'm', fetchImpl })
    expect((await provider.complete(req)).usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('aborts and wraps the error when the request times out', async () => {
    const fetchImpl = vi.fn<FetchLike>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          )
        }),
    )
    const provider = new OpenAiCompatibleProvider({
      baseUrl: 'http://x',
      model: 'm',
      timeoutMs: 5,
      fetchImpl,
    })

    await expect(provider.complete(req)).rejects.toThrow(/timeout/i)
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npx vitest run libs/llm-provider/src/openai-compatible.spec.ts`
Expected: FAIL, `./openai-compatible` introuvable.

- [ ] **Step 3: Implémenter `openai-compatible.ts`**

```ts
import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './provider'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface OpenAiCompatibleOptions {
  readonly baseUrl: string
  readonly model: string
  readonly apiKey?: string
  readonly timeoutMs?: number
  readonly fetchImpl?: FetchLike
}

const DEFAULT_TIMEOUT_MS = 20_000
const NO_USAGE = { inputTokens: 0, outputTokens: 0 } as const

interface ChatCompletionBody {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/**
 * Client `/v1/chat/completions` : couvre Ollama, vLLM, Groq, Mistral et tout serveur
 * compatible OpenAI. Timeout configurable, un seul retry et seulement sur 5xx.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly url: string
  private readonly timeoutMs: number
  private readonly fetchImpl: FetchLike

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? ((u, i) => globalThis.fetch(u, i))
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const response = await this.postWithRetry(this.buildBody(req))
    return this.mapResponse(response)
  }

  private buildBody(req: LlmRequest): Record<string, unknown> {
    return {
      model: this.options.model,
      temperature: 0,
      max_tokens: req.maxTokens,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      ...(req.jsonSchema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'reply', strict: true, schema: req.jsonSchema },
            },
          }
        : {}),
    }
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
    }
  }

  private async postOnce(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(this.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new LlmUnavailableError(
        aborted ? `LLM timeout after ${this.timeoutMs}ms` : `LLM request failed: ${String(error)}`,
        error,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  private async postWithRetry(body: Record<string, unknown>): Promise<Response> {
    const first = await this.postOnce(body)
    if (first.status < 500) return first
    const second = await this.postOnce(body)
    if (second.status < 500) return second
    throw new LlmUnavailableError(`LLM server error ${second.status} after 1 retry`)
  }

  private async mapResponse(response: Response): Promise<LlmResponse> {
    if (!response.ok) {
      throw new LlmUnavailableError(`LLM request rejected with status ${response.status}`)
    }
    const body = (await response.json().catch((error: unknown) => {
      throw new LlmUnavailableError('LLM response is not valid JSON', error)
    })) as ChatCompletionBody
    const text = body.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new LlmUnavailableError('LLM response contains no message content')
    }
    return {
      text,
      usage: body.usage
        ? {
            inputTokens: body.usage.prompt_tokens ?? 0,
            outputTokens: body.usage.completion_tokens ?? 0,
          }
        : NO_USAGE,
    }
  }
}
```

- [ ] **Step 4: Exporter et vérifier**

Ajouter `export * from './openai-compatible'` dans `libs/llm-provider/src/index.ts`.

Run: `npx nx run llm-provider:test && npx tsc -p libs/llm-provider/tsconfig.lib.json --noEmit && npx tsc -p libs/llm-provider/tsconfig.spec.json --noEmit`
Expected: 16 tests verts, couverture ≥ seuils, 0 erreur tsc.

- [ ] **Step 5: Commit**

```bash
npx prettier --write libs/llm-provider
git add libs/llm-provider
git commit -m "feat(llm-provider): OpenAI-compatible client with timeout and 5xx retry"
```

---

### Task 5: `libs/engine` — échafaudage et moteur de négociation

**Files:**

- Create: `libs/engine/*` (généré), `libs/engine/src/negotiation-engine.ts`, `libs/engine/src/negotiation-engine.spec.ts`, `libs/engine/src/index.ts`
- Modify: `libs/engine/vitest.config.mts`, `libs/engine/tsconfig.json`

**Interfaces:**

- Consumes: `NegotiationPolicy`, `Product`, `listedPrices` (`@wa/domain`).
- Produces:

```ts
export interface NegotiationInput {
  readonly policy: NegotiationPolicy
  readonly product: Product
  readonly listedPrice: number
  readonly quantity: number
  readonly counterOffer: number
  readonly round: number // tours de négociation déjà joués pour ce produit
}

export type NegotiationReason =
  'not_negotiable' | 'accepted_customer_offer' | 'counter_offer' | 'floor_reached' | 'max_rounds'

export interface NegotiationOutcome {
  readonly accepted: boolean
  readonly offer: number // prix unitaire que le commerçant propose ou accepte
  readonly round: number // nouveau compteur de tours
  readonly reason: NegotiationReason
}

export function evaluateNegotiation(input: NegotiationInput): NegotiationOutcome
export function applyQuantityDiscount(
  policy: NegotiationPolicy,
  productId: string,
  quantity: number,
  listedPrice: number,
): number
```

**Règles (à implémenter telles quelles) :**

1. La remise quantité s'applique **avant tout** : on retient le palier `quantityDiscounts` du produit dont `minQuantity` est le plus élevé parmi ceux `≤ quantity` ; prix de base = `Math.round(listedPrice * (1 - percentOff / 100))`.
2. Si `policy.enabled` est faux **ou** qu'il n'y a pas de règle `perProduct[productId]` : aucun contre-prix. `accepted = counterOffer >= base`, `offer = base`, `reason = 'not_negotiable'`, `round` inchangé.
3. Plancher effectif = `Math.min(rule.floorPrice, base)` (une remise quantité peut descendre sous le plancher nominal ; on ne remonte jamais un prix déjà consenti).
4. Si `counterOffer >= base` : accepté au prix de base (jamais plus cher que l'affiché), `reason = 'accepted_customer_offer'`, `round` inchangé.
5. Sinon, si `round >= policy.maxRounds` : refus ferme, `accepted = false`, `offer = effectiveFloor`, `round + 1`, `reason = 'max_rounds'`.
6. Sinon, le contre-prix est `Math.max(effectiveFloor, Math.min(rule.steps[round] ?? effectiveFloor, base))`. `accepted = counterOffer >= offer`. `round + 1`. `reason = 'floor_reached'` si `offer === effectiveFloor`, sinon `'counter_offer'`.

- [ ] **Step 1: Générer la lib**

```bash
npx nx g @nx/js:library libs/engine --name=engine --unitTestRunner=vitest \
  --bundler=none --linter=none --importPath=@wa/engine --useProjectJson=true --no-interactive
```

Puis aligner `tsconfig.json`, `vitest.config.mts` (`name: 'engine'`, `cacheDir`, `reportsDirectory: '../../coverage/libs/engine'`, `coverageEnabledForTarget()`, seuils `{ lines: 90, functions: 90, branches: 85 }`) exactement comme à la tâche 3, et supprimer les fichiers de démonstration générés.

- [ ] **Step 2: Écrire les tests de négociation (table de cas)**

`libs/engine/src/negotiation-engine.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import type { NegotiationPolicy, Product } from '@wa/domain'
import { applyQuantityDiscount, evaluateNegotiation } from './negotiation-engine'

const robe: Product = {
  productId: 'robe',
  name: 'Robe rouge',
  aliases: ['robe'],
  description: '',
  photos: [],
  active: true,
  tags: [],
  pricing: {
    kind: 'unit',
    variants: [{ variantId: 'm', label: 'M', attributes: {}, price: 12000, stock: 5 }],
  },
}

const policy: NegotiationPolicy = {
  enabled: true,
  perProduct: { robe: { floorPrice: 9000, steps: [11000, 10000, 9500] } },
  quantityDiscounts: [{ productId: 'robe', minQuantity: 3, percentOff: 10 }],
  maxRounds: 3,
}

const base = { policy, product: robe, listedPrice: 12000, quantity: 1 }

describe('applyQuantityDiscount', () => {
  it('returns the listed price below the threshold', () => {
    expect(applyQuantityDiscount(policy, 'robe', 2, 12000)).toBe(12000)
  })

  it('applies the discount at the threshold', () => {
    expect(applyQuantityDiscount(policy, 'robe', 3, 12000)).toBe(10800)
  })

  it('keeps the highest applicable tier', () => {
    const tiered: NegotiationPolicy = {
      ...policy,
      quantityDiscounts: [
        { productId: 'robe', minQuantity: 3, percentOff: 10 },
        { productId: 'robe', minQuantity: 10, percentOff: 20 },
      ],
    }
    expect(applyQuantityDiscount(tiered, 'robe', 10, 12000)).toBe(9600)
  })

  it('ignores discounts for other products', () => {
    expect(applyQuantityDiscount(policy, 'autre', 10, 12000)).toBe(12000)
  })
})

describe('evaluateNegotiation', () => {
  it('accepts an offer at or above the listed price without negotiating', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 12000, round: 0 })).toEqual({
      accepted: true,
      offer: 12000,
      round: 0,
      reason: 'accepted_customer_offer',
    })
  })

  it('counters with the first step on round 0', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 8000, round: 0 })).toEqual({
      accepted: false,
      offer: 11000,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('walks the steps down one round at a time', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 8000, round: 1 }).offer).toBe(10000)
    expect(evaluateNegotiation({ ...base, counterOffer: 8000, round: 2 }).offer).toBe(9500)
  })

  it('accepts when the customer offer meets the current step', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 11000, round: 0 })).toEqual({
      accepted: true,
      offer: 11000,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('never goes below floorPrice when steps run out', () => {
    const shallow: NegotiationPolicy = {
      ...policy,
      perProduct: { robe: { floorPrice: 9000, steps: [11000] } },
      maxRounds: 5,
    }
    const result = evaluateNegotiation({ ...base, policy: shallow, counterOffer: 1, round: 1 })
    expect(result).toEqual({ accepted: false, offer: 9000, round: 2, reason: 'floor_reached' })
  })

  it('refuses firmly once maxRounds is reached', () => {
    expect(evaluateNegotiation({ ...base, counterOffer: 1, round: 3 })).toEqual({
      accepted: false,
      offer: 9000,
      round: 4,
      reason: 'max_rounds',
    })
  })

  it('treats a disabled policy as non-negotiable', () => {
    const off = { ...policy, enabled: false }
    expect(evaluateNegotiation({ ...base, policy: off, counterOffer: 8000, round: 0 })).toEqual({
      accepted: false,
      offer: 12000,
      round: 0,
      reason: 'not_negotiable',
    })
  })

  it('treats a product without a rule as non-negotiable but honours full price', () => {
    const other = { ...robe, productId: 'autre' }
    expect(evaluateNegotiation({ ...base, product: other, counterOffer: 12000, round: 0 })).toEqual(
      { accepted: true, offer: 12000, round: 0, reason: 'not_negotiable' },
    )
  })

  it('applies the quantity discount before the steps', () => {
    // base = 10800 ; premier palier 11000 est plafonné au prix remisé
    expect(evaluateNegotiation({ ...base, quantity: 3, counterOffer: 9200, round: 0 })).toEqual({
      accepted: false,
      offer: 10800,
      round: 1,
      reason: 'counter_offer',
    })
  })

  it('lets a quantity discount go under the nominal floor', () => {
    const deep: NegotiationPolicy = {
      ...policy,
      quantityDiscounts: [{ productId: 'robe', minQuantity: 3, percentOff: 30 }],
    }
    // base = 8400 < floorPrice 9000 : le plancher effectif suit le prix remisé
    expect(
      evaluateNegotiation({ ...base, policy: deep, quantity: 3, counterOffer: 8400, round: 0 }),
    ).toEqual({ accepted: true, offer: 8400, round: 0, reason: 'accepted_customer_offer' })
  })
})
```

- [ ] **Step 3: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/negotiation-engine.spec.ts`
Expected: FAIL, `./negotiation-engine` introuvable.

- [ ] **Step 4: Implémenter `negotiation-engine.ts`**

```ts
import type { NegotiationPolicy, Product } from '@wa/domain'

export interface NegotiationInput {
  readonly policy: NegotiationPolicy
  readonly product: Product
  readonly listedPrice: number
  readonly quantity: number
  readonly counterOffer: number
  readonly round: number
}

export type NegotiationReason =
  'not_negotiable' | 'accepted_customer_offer' | 'counter_offer' | 'floor_reached' | 'max_rounds'

export interface NegotiationOutcome {
  readonly accepted: boolean
  readonly offer: number
  readonly round: number
  readonly reason: NegotiationReason
}

/** Prix unitaire après la meilleure remise quantité applicable. Arrondi à l'entier XOF. */
export function applyQuantityDiscount(
  policy: NegotiationPolicy,
  productId: string,
  quantity: number,
  listedPrice: number,
): number {
  const best = policy.quantityDiscounts
    .filter((d) => d.productId === productId && quantity >= d.minQuantity)
    .reduce<number>((max, d) => Math.max(max, d.percentOff), 0)
  return Math.round(listedPrice * (1 - best / 100))
}

/**
 * Évalue une contre-offre client. Fonction pure : la politique et le produit viennent du
 * profil, `round` vient de `ConversationState.negotiation[productId]`.
 */
export function evaluateNegotiation(input: NegotiationInput): NegotiationOutcome {
  const { policy, product, listedPrice, quantity, counterOffer, round } = input
  const base = applyQuantityDiscount(policy, product.productId, quantity, listedPrice)
  const rule = policy.perProduct[product.productId]

  if (!policy.enabled || !rule) {
    return {
      accepted: counterOffer >= base,
      offer: base,
      round,
      reason: 'not_negotiable',
    }
  }

  if (counterOffer >= base) {
    return { accepted: true, offer: base, round, reason: 'accepted_customer_offer' }
  }

  const effectiveFloor = Math.min(rule.floorPrice, base)

  if (round >= policy.maxRounds) {
    return { accepted: false, offer: effectiveFloor, round: round + 1, reason: 'max_rounds' }
  }

  const step = rule.steps[round] ?? effectiveFloor
  const offer = Math.max(effectiveFloor, Math.min(step, base))
  return {
    accepted: counterOffer >= offer,
    offer,
    round: round + 1,
    reason: offer === effectiveFloor ? 'floor_reached' : 'counter_offer',
  }
}
```

- [ ] **Step 5: Vérifier**

Run: `npx vitest run libs/engine/src/negotiation-engine.spec.ts`
Expected: PASS (15 tests).

- [ ] **Step 6: Commit**

```bash
npx prettier --write libs/engine tsconfig.base.json
echo "export * from './negotiation-engine'" > libs/engine/src/index.ts
npx prettier --write libs/engine/src/index.ts
git add libs/engine tsconfig.base.json package.json package-lock.json
git commit -m "feat(engine): negotiation evaluation with quantity discounts and floor"
```

---

### Task 6: `libs/engine` — garde-fou sur les nombres

**Files:**

- Create: `libs/engine/src/guardrail.ts`, `libs/engine/src/guardrail.spec.ts`
- Modify: `libs/engine/src/index.ts`

**Interfaces:**

- Produces:

```ts
export interface GuardrailInput {
  readonly text: string
  readonly allowedNumbers: readonly number[]
  /** Libellés autorisés à contenir des chiffres (noms de produits, zones) — retirés avant extraction. */
  readonly allowedPhrases?: readonly string[]
  readonly maxReplyChars: number
}

export type GuardrailResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly offending: readonly number[] }

export function extractNumbers(text: string): number[]
export function truncateToSentence(text: string, maxChars: number): string
export function checkReply(input: GuardrailInput): GuardrailResult
```

**Formats reconnus par `extractNumbers`** (français parlé béninois) : `12000`, `12 000` (espace normale, U+00A0, U+202F, espace fine U+2009), `12.000`, `12,000`, `12k` / `12K` (→ 12000), suffixes `F`, `FCFA`, `CFA` ignorés, pourcentages `10%` (→ 10). **Hors périmètre assumé** : les nombres écrits en toutes lettres (« deux mille ») ne sont pas détectés ; le prompt du composer interdit explicitement cette forme. À réévaluer après la première éval live.

- [ ] **Step 1: Écrire les tests**

`libs/engine/src/guardrail.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { checkReply, extractNumbers, truncateToSentence } from './guardrail'

describe('extractNumbers', () => {
  it.each([
    ['la robe est à 12000F', [12000]],
    ['la robe est à 12 000 FCFA', [12000]],
    ['la robe est à 12 000 CFA', [12000]],
    ['la robe est à 12 000', [12000]],
    ['la robe est à 12.000', [12000]],
    ['la robe est à 12,000', [12000]],
    ['je te fais 12k', [12000]],
    ['je te fais 12K', [12000]],
    ['remise de 10%', [10]],
    ['2 robes à 12000 = 24000', [2, 12000, 24000]],
    ['livraison en 48h', [48]],
    ['pas de chiffre ici', []],
  ])('parses %s', (text, expected) => {
    expect(extractNumbers(text)).toEqual(expected)
  })
})

describe('truncateToSentence', () => {
  it('leaves a short text untouched', () => {
    expect(truncateToSentence('Bonsoir.', 100)).toBe('Bonsoir.')
  })

  it('cuts at the last complete sentence', () => {
    const text = 'La robe est à 12000F. Je peux livrer demain. Tu veux la taille M ?'
    expect(truncateToSentence(text, 45)).toBe('La robe est à 12000F. Je peux livrer demain.')
  })

  it('falls back to a hard cut when no sentence fits', () => {
    expect(truncateToSentence('a'.repeat(50), 10)).toHaveLength(10)
  })
})

describe('checkReply', () => {
  const ok = { allowedNumbers: [12000, 2, 24000], maxReplyChars: 320 }

  it('accepts a reply whose numbers are all allowed', () => {
    const result = checkReply({ ...ok, text: '2 robes à 12000F, ça fait 24000F.' })
    expect(result).toEqual({ ok: true, text: '2 robes à 12000F, ça fait 24000F.' })
  })

  it('accepts variants of an allowed number', () => {
    expect(checkReply({ ...ok, text: 'ça fait 12 000 FCFA.' }).ok).toBe(true)
  })

  it('rejects an invented number', () => {
    const result = checkReply({ ...ok, text: 'je te fais 9500F.' })
    expect(result).toEqual({ ok: false, offending: [9500] })
  })

  it('reports every offending number once', () => {
    const result = checkReply({ ...ok, text: '9500F ou 9500F ou 8000F' })
    expect(result).toEqual({ ok: false, offending: [9500, 8000] })
  })

  it('ignores digits inside allowed phrases', () => {
    const result = checkReply({
      ...ok,
      allowedPhrases: ['Riz sac 25 kg'],
      text: 'Le Riz sac 25 kg est à 12000F.',
    })
    expect(result.ok).toBe(true)
  })

  it('matches allowed phrases case-insensitively', () => {
    const result = checkReply({
      ...ok,
      allowedPhrases: ['Riz sac 25 kg'],
      text: 'le riz sac 25 KG est à 12000F.',
    })
    expect(result.ok).toBe(true)
  })

  it('truncates an over-long but valid reply', () => {
    const text = 'La robe est à 12000F. Merci beaucoup pour ta confiance. À bientôt.'
    const result = checkReply({ ...ok, text, maxReplyChars: 25 })
    expect(result).toEqual({ ok: true, text: 'La robe est à 12000F.' })
  })

  it('checks numbers before truncating', () => {
    const text = 'Bonsoir. Je te fais 9500F.'
    expect(checkReply({ ...ok, text, maxReplyChars: 10 })).toEqual({ ok: false, offending: [9500] })
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/guardrail.spec.ts`
Expected: FAIL, `./guardrail` introuvable.

- [ ] **Step 3: Implémenter `guardrail.ts`**

```ts
export interface GuardrailInput {
  readonly text: string
  readonly allowedNumbers: readonly number[]
  readonly allowedPhrases?: readonly string[]
  readonly maxReplyChars: number
}

export type GuardrailResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly offending: readonly number[] }

/** Espaces utilisées comme séparateur de milliers en français. */
const THOUSAND_SPACES = /[    ]/g
const NUMBER_PATTERN = /\d+(?:[    .,]\d{3})*(?:[kK]\b)?/g

function toNumber(raw: string): number {
  const isThousands = /[kK]$/.test(raw)
  const digits = raw.replace(/[kK]$/, '').replace(THOUSAND_SPACES, '').replace(/[.,]/g, '')
  const value = Number(digits)
  return isThousands ? value * 1000 : value
}

/** Tous les nombres cités dans un texte, dans l'ordre d'apparition, doublons compris. */
export function extractNumbers(text: string): number[] {
  return [...text.matchAll(NUMBER_PATTERN)].map((match) => toNumber(match[0]))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Retire les libellés autorisés (« Riz sac 25 kg ») pour que leurs chiffres ne soient pas testés. */
function stripPhrases(text: string, phrases: readonly string[]): string {
  return phrases.reduce(
    (acc, phrase) => acc.replace(new RegExp(escapeRegExp(phrase), 'gi'), ' '),
    text,
  )
}

/** Coupe à la dernière phrase complète qui tient dans `maxChars`, sinon coupe net. */
export function truncateToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const head = text.slice(0, maxChars)
  const lastEnd = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'))
  return lastEnd > 0 ? head.slice(0, lastEnd + 1).trimEnd() : head
}

/**
 * Vérifie qu'aucun nombre du texte n'est inventé, puis borne la longueur.
 * La vérification passe avant la troncature : un nombre faux dans la partie coupée
 * signale quand même un problème de rédaction.
 */
export function checkReply(input: GuardrailInput): GuardrailResult {
  const allowed = new Set(input.allowedNumbers)
  const cleaned = stripPhrases(input.text, input.allowedPhrases ?? [])
  const offending = [...new Set(extractNumbers(cleaned))].filter((n) => !allowed.has(n))
  if (offending.length > 0) return { ok: false, offending }
  return { ok: true, text: truncateToSentence(input.text, input.maxReplyChars) }
}
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run libs/engine/src/guardrail.spec.ts`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write libs/engine
printf "export * from './negotiation-engine'\nexport * from './guardrail'\n" > libs/engine/src/index.ts
npx prettier --write libs/engine/src/index.ts
git add libs/engine
git commit -m "feat(engine): number guardrail with French formats and sentence truncation"
```

---

### Task 7: `libs/engine` — faits, résolution catalogue, machine à états

**Files:**

- Create: `libs/engine/src/facts.ts`, `libs/engine/src/events.ts`, `libs/engine/src/catalogue.ts`, `libs/engine/src/catalogue.spec.ts`, `libs/engine/src/state-machine.ts`, `libs/engine/src/allowed.ts`, `libs/engine/src/state-machine.spec.ts`
- Modify: `libs/engine/src/index.ts`

**Interfaces:**

- Consumes: `MerchantProfile`, `Product`, `ConversationState`, `CartLine`, `Order`, `orderTotal`, `appendTurn`, `expireConversation` (`@wa/domain`), `evaluateNegotiation` (tâche 5), `Intent`, `ProductRef` (`./intent-schema`, créé ici — voir Step 1).
- Produces:

```ts
// facts.ts — les faits sont les SEULES données que le composer a le droit de mettre en mots.
export interface FoundProduct {
  readonly productId: string
  readonly name: string
  readonly price: number
  readonly stock: number | null
}

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

// events.ts — ce que `apps/api` journalise et notifie (plan 3).
export type EngineEvent =
  | { type: 'ReplySent'; at: string; inputTokens: number; outputTokens: number }
  | { type: 'QuotaExceeded'; at: string; merchantId: string }
  | { type: 'GuardrailTripped'; at: string; offending: number[]; draft: string }
  | { type: 'ProviderDown'; at: string; stage: 'intent' | 'composer'; message: string }
  | { type: 'IntentUnclear'; at: string; text: string }
  | { type: 'CatalogueEmpty'; at: string; merchantId: string }
  | { type: 'OrderConfirmed'; at: string; order: Order }

// catalogue.ts
export interface ResolvedProduct {
  readonly product: Product
  readonly variantId?: string
  readonly label: string
  readonly unitPrice: number
  /** `null` = stock illimité. */
  readonly stock: number | null
}
export function resolveProductRef(profile: MerchantProfile, ref: ProductRef): ResolvedProduct | null
export function activeProducts(profile: MerchantProfile): Product[]

// allowed.ts
export function collectAllowedNumbers(facts: readonly TurnFact[]): number[]
export function collectAllowedPhrases(facts: readonly TurnFact[]): string[]

// state-machine.ts
export interface TransitionInput {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly intent: Intent
  /** Message brut du client : journalisé dans l'état et rapporté dans `IntentUnclear`. */
  readonly text: string
  readonly receivedAt: string
}
export interface TransitionResult {
  readonly state: ConversationState
  readonly facts: TurnFact[]
  readonly events: EngineEvent[]
  /** Nombres que le composer a le droit de citer ce tour-ci. */
  readonly allowedNumbers: number[]
  readonly allowedPhrases: string[]
}
export function transition(input: TransitionInput): TransitionResult
```

**Transitions (une ligne par intention, à implémenter telles quelles) :**

| intent                                          | phase après                                   | faits produits                                                  |
| ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `greet`                                         | `browsing`                                    | `Greeting`, `ProductsFound` (3 produits actifs max)             |
| `browse`                                        | `browsing`                                    | `ProductsFound` (5 produits actifs max)                         |
| `ask_product`, `ask_price`                      | `browsing`                                    | `PriceQuoted` par ref résolue, `OutOfScope` par ref non résolue |
| `ask_delivery`                                  | inchangée                                     | `DeliveryQuoted` si zone connue, sinon `ZoneUnknown`            |
| `negotiate`                                     | `negotiating`                                 | `NegotiationResult`, ou `OutOfScope` si ref inconnue            |
| `add_to_cart`                                   | `cart`                                        | `OutOfStock`, `MinQuantity`, ou `CartUpdated`                   |
| `remove_from_cart`                              | `cart`, ou `browsing` si le panier finit vide | `CartUpdated`                                                   |
| `give_address`                                  | `address`                                     | `DeliveryQuoted` si zone reconnue, sinon `ZoneUnknown`          |
| `confirm_order` (panier non vide + zone connue) | `confirmed`                                   | `OrderSummary` + event `OrderConfirmed`                         |
| `confirm_order` (panier vide)                   | `browsing`                                    | `Unclear`                                                       |
| `confirm_order` (adresse ou zone manquante)     | `address`                                     | `AddressNeeded`                                                 |
| `cancel`                                        | `cancelled`                                   | `OrderCancelled` (panier vidé)                                  |
| `off_topic`                                     | inchangée                                     | `OffTopic`                                                      |
| `unclear`                                       | inchangée                                     | `Unclear` + event `IntentUnclear`                               |

Sémantiques à ne pas deviner :

- **Péremption d'abord** : `expireConversation(state, receivedAt)` est appliqué avant toute chose, puis le tour client est journalisé par `appendTurn`. Le tour **bot** est ajouté par le pipeline (tâche 10), pas ici.
- **Catalogue vide** : si `activeProducts(profile)` est vide, toute intention sauf `cancel` produit `CatalogueEmpty` (fait + event) et rien d'autre ; la phase ne change pas.
- **`add_to_cart`** : quantité par défaut 1. Si une ligne existe déjà pour le même `productId` + `variantId`, les quantités **s'additionnent** (le contrôle de stock porte sur le cumul). Produit `bulk` dont la quantité cumulée est sous `minQuantity` → fait `MinQuantity`, aucune modification du panier.
- **`remove_from_cart`** : sans `quantity`, la ligne entière est retirée ; avec `quantity`, elle est décrémentée et retirée si elle tombe à 0 ou moins. Sans `productRefs`, le panier est vidé.
- **`negotiate` sans `counterOffer`** : traité comme `ask_price` sur le prix courant (`state.negotiation[productId]?.currentOffer ?? unitPrice`), sans incrémenter le tour de négociation.
- **Prix retenu** : `state.negotiation[productId]?.currentOffer ?? unitPrice` pour la négociation comme pour la mise au panier (`agreedPrice`).
- **`give_address`** : `address.text` est toujours stocké ; `zone` n'est renseignée que si elle a été reconnue. `zones` dans `ZoneUnknown` liste les noms de zones du profil.
- **Zone** : appariement insensible à la casse et aux accents sur `profile.delivery.zones[].name`, testé contre `intent.zone ?? intent.address`.
- **`orderId`** = `` `${merchantId}:${customerId}:${receivedAt}` `` — déterministe, le moteur n'a pas d'aléatoire.
- **Acompte** : `depositAmount = Σ Math.round(agreedPrice × quantity × depositPercent / 100)` sur les seules lignes dont le produit est `madeToOrder`. Omis (`undefined`) si la somme est 0.
- **`allowedNumbers`** agrège tous les nombres cités par les faits — prix, offres, stocks non nuls, quantités, `minQuantity`, `leadTimeDays`, `depositPercent`, sous-total, frais, `delayHours`, total, acompte — plus `0` et `1`, tolérés parce qu'ils apparaissent dans des formulations courantes.

- [ ] **Step 1: Extraire les types d'intention dans `intent-schema.ts`**

Pour éviter le cycle `intent.ts → prompts/intent.ts → catalogue.ts → intent.ts`, les schémas d'intention vivent dans un module qui n'importe que `zod`. Créer `libs/engine/src/intent-schema.ts` avec `INTENT_NAMES`, `ProductRefSchema`, `IntentSchema`, `ProductRef`, `Intent`, `UNCLEAR_INTENT`, `INTENT_JSON_SCHEMA` — le contenu exact est donné à la tâche 8, Step 5 ; le copier ici et n'écrire `intent.ts` (le classifieur) qu'à la tâche 8. `catalogue.ts` et `state-machine.ts` importent depuis `./intent-schema`.

- [ ] **Step 2: Écrire `facts.ts` et `events.ts`**

Reproduire exactement les unions données ci-dessus dans le bloc **Interfaces**. Fichiers de types purs, sans logique.

- [ ] **Step 3: Écrire les tests de `catalogue.ts`**

`libs/engine/src/catalogue.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { pilotProfile } from '@wa/domain'
import { activeProducts, resolveProductRef } from './catalogue'

describe('activeProducts', () => {
  it('excludes inactive products', () => {
    expect(activeProducts(pilotProfile).map((p) => p.productId)).not.toContain('ancien-sac')
  })
})

describe('resolveProductRef', () => {
  it('returns null for an unknown product', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'inconnu' })).toBeNull()
  })

  it('returns null for an inactive product', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'ancien-sac' })).toBeNull()
  })

  it('resolves a unit product to its first variant by default', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'robe-rouge' })).toMatchObject({
      variantId: 'm',
      label: 'Robe rouge Taille M',
      unitPrice: 12000,
      stock: 3,
    })
  })

  it('resolves an explicit variantId', () => {
    expect(
      resolveProductRef(pilotProfile, { productId: 'robe-rouge', variantId: 'l' }),
    ).toMatchObject({ unitPrice: 12000, stock: 0 })
  })

  it('returns null for an unknown variantId', () => {
    expect(
      resolveProductRef(pilotProfile, { productId: 'robe-rouge', variantId: 'xxl' }),
    ).toBeNull()
  })

  it('treats a null variant stock as unlimited', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'chaussure-noire' })?.stock).toBeNull()
  })

  it('resolves a bulk product to its price per unit', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'gari' })).toMatchObject({
      label: 'Gari (kg)',
      unitPrice: 600,
      stock: 40,
    })
  })

  it('resolves a made-to-order product to its base price with unlimited stock', () => {
    expect(resolveProductRef(pilotProfile, { productId: 'tenue-mesure' })).toMatchObject({
      label: 'Tenue sur mesure',
      unitPrice: 25000,
      stock: null,
    })
  })
})
```

- [ ] **Step 4: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/catalogue.spec.ts`
Expected: FAIL, `./catalogue` introuvable.

- [ ] **Step 5: Implémenter `catalogue.ts`**

```ts
import type { MerchantProfile, Product } from '@wa/domain'
import type { ProductRef } from './intent-schema'

export interface ResolvedProduct {
  readonly product: Product
  readonly variantId?: string
  readonly label: string
  readonly unitPrice: number
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
```

- [ ] **Step 6: Vérifier `catalogue.ts`**

Run: `npx vitest run libs/engine/src/catalogue.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Implémenter `allowed.ts`**

```ts
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
```

- [ ] **Step 8: Écrire les tests de la machine à états**

`libs/engine/src/state-machine.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { newConversationState, pilotProfile, type ConversationState } from '@wa/domain'
import { transition } from './state-machine'
import type { Intent } from './intent-schema'

const at = '2026-09-21T10:00:00.000Z'
const idle = newConversationState(pilotProfile.merchantId, 'c1', at)
const noRefs = { productRefs: [] }

function run(intent: Intent, state: ConversationState = idle, text = 'msg') {
  return transition({ profile: pilotProfile, state, intent, text, receivedAt: at })
}

function cartWithRobe(quantity = 1) {
  return run({ intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity }] }).state
}

describe('transition', () => {
  it('greets and shows at most three products', () => {
    const result = run({ intent: 'greet', ...noRefs })
    expect(result.state.phase).toBe('browsing')
    const found = result.facts.find((f) => f.kind === 'ProductsFound')
    expect(found?.kind === 'ProductsFound' && found.products.length).toBeLessThanOrEqual(3)
  })

  it('logs the customer turn', () => {
    expect(run({ intent: 'greet', ...noRefs }, idle, 'bonsoir').state.turns).toEqual([
      { role: 'customer', text: 'bonsoir', at },
    ])
  })

  it('never mutates the input state', () => {
    const before = JSON.stringify(idle)
    cartWithRobe(2)
    expect(JSON.stringify(idle)).toBe(before)
  })

  it('quotes the price and stock of a known product', () => {
    const result = run({ intent: 'ask_price', productRefs: [{ productId: 'robe-rouge' }] })
    expect(result.facts).toContainEqual({
      kind: 'PriceQuoted',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      price: 12000,
      stock: 3,
    })
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([12000, 3]))
    expect(result.allowedPhrases).toContain('Robe rouge Taille M')
  })

  it('quotes lead time and deposit for a made-to-order product', () => {
    const result = run({ intent: 'ask_price', productRefs: [{ productId: 'tenue-mesure' }] })
    expect(result.facts).toContainEqual({
      kind: 'PriceQuoted',
      productId: 'tenue-mesure',
      name: 'Tenue sur mesure',
      price: 25000,
      stock: null,
      leadTimeDays: 7,
      depositPercent: 50,
    })
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([25000, 7, 50]))
  })

  it('reports OutOfScope for an unknown product', () => {
    const result = run({ intent: 'ask_price', productRefs: [{ productId: 'inconnu' }] })
    expect(result.facts).toContainEqual({ kind: 'OutOfScope', query: 'inconnu' })
  })

  it('reports OutOfStock when the quantity exceeds the stock', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'robe-rouge', quantity: 9999 }],
    })
    expect(result.facts).toContainEqual({
      kind: 'OutOfStock',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      available: 3,
    })
    expect(result.state.cart).toEqual([])
  })

  it('reports MinQuantity for a bulk product below its minimum', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'gari', quantity: 0.5 }],
    })
    expect(result.facts).toContainEqual({
      kind: 'MinQuantity',
      productId: 'gari',
      name: 'Gari (kg)',
      minQuantity: 1,
      unit: 'kg',
    })
    expect(result.state.cart).toEqual([])
  })

  it('adds to the cart and reports the subtotal', () => {
    const result = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'robe-rouge', quantity: 2 }],
    })
    expect(result.state.phase).toBe('cart')
    expect(result.state.cart).toEqual([
      {
        productId: 'robe-rouge',
        variantId: 'm',
        quantity: 2,
        unitPrice: 12000,
        agreedPrice: 12000,
      },
    ])
    expect(result.facts.some((f) => f.kind === 'CartUpdated' && f.subtotal === 24000)).toBe(true)
  })

  it('merges quantities for an existing cart line', () => {
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 2 }] },
      cartWithRobe(1),
    )
    expect(result.state.cart[0]?.quantity).toBe(3)
  })

  it('refuses a merge that exceeds the stock', () => {
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 3 }] },
      cartWithRobe(2),
    )
    expect(result.facts.some((f) => f.kind === 'OutOfStock')).toBe(true)
    expect(result.state.cart[0]?.quantity).toBe(2)
  })

  it('removes a whole line without a quantity', () => {
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge' }] },
      cartWithRobe(2),
    )
    expect(result.state.cart).toEqual([])
    expect(result.state.phase).toBe('browsing')
  })

  it('decrements a line when a quantity is given', () => {
    const result = run(
      { intent: 'remove_from_cart', productRefs: [{ productId: 'robe-rouge', quantity: 1 }] },
      cartWithRobe(3),
    )
    expect(result.state.cart[0]?.quantity).toBe(2)
    expect(result.state.phase).toBe('cart')
  })

  it('records a negotiation round and the agreed offer', () => {
    const result = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'robe-rouge' }],
      counterOffer: 9000,
    })
    expect(result.state.phase).toBe('negotiating')
    expect(result.state.negotiation['robe-rouge']).toEqual({ round: 1, currentOffer: 11500 })
    expect(result.facts).toContainEqual({
      kind: 'NegotiationResult',
      productId: 'robe-rouge',
      name: 'Robe rouge Taille M',
      accepted: false,
      offer: 11500,
      final: false,
    })
  })

  it('marks the last round as final', () => {
    const late = { ...idle, negotiation: { 'robe-rouge': { round: 3, currentOffer: 10000 } } }
    const result = run(
      { intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }], counterOffer: 5000 },
      late,
    )
    expect(result.facts.some((f) => f.kind === 'NegotiationResult' && f.final)).toBe(true)
  })

  it('treats a negotiation without a counter offer as a price question', () => {
    const result = run({ intent: 'negotiate', productRefs: [{ productId: 'robe-rouge' }] })
    expect(result.facts.some((f) => f.kind === 'PriceQuoted')).toBe(true)
    expect(result.state.negotiation['robe-rouge']).toBeUndefined()
  })

  it('carries the agreed offer into the cart', () => {
    const negotiated = run({
      intent: 'negotiate',
      productRefs: [{ productId: 'robe-rouge' }],
      counterOffer: 11500,
    }).state
    const result = run(
      { intent: 'add_to_cart', productRefs: [{ productId: 'robe-rouge', quantity: 1 }] },
      negotiated,
    )
    expect(result.state.cart[0]?.agreedPrice).toBe(11500)
  })

  it('quotes delivery for a known zone, case and accent insensitive', () => {
    const result = run({ intent: 'ask_delivery', ...noRefs, zone: 'je suis à CALAVI' })
    expect(result.facts).toContainEqual({
      kind: 'DeliveryQuoted',
      zone: 'Calavi',
      fee: 1500,
      delayHours: 24,
    })
  })

  it('reports ZoneUnknown for an unlisted zone', () => {
    const result = run({ intent: 'ask_delivery', ...noRefs, zone: 'Ouagadougou' })
    expect(result.facts).toContainEqual({
      kind: 'ZoneUnknown',
      zones: ['Cotonou', 'Calavi', 'Porto-Novo'],
    })
  })

  it('stores the address and its zone', () => {
    const result = run({
      intent: 'give_address',
      ...noRefs,
      address: 'Fidjrossè carrefour, Cotonou',
    })
    expect(result.state.phase).toBe('address')
    expect(result.state.address).toEqual({ text: 'Fidjrossè carrefour, Cotonou', zone: 'Cotonou' })
  })

  it('stores an address with no recognised zone', () => {
    const result = run({ intent: 'give_address', ...noRefs, address: 'derrière le marché' })
    expect(result.state.address).toEqual({ text: 'derrière le marché' })
    expect(result.facts.some((f) => f.kind === 'ZoneUnknown')).toBe(true)
  })

  it('asks for the address before confirming', () => {
    const result = run({ intent: 'confirm_order', ...noRefs }, cartWithRobe(1))
    expect(result.state.phase).toBe('address')
    expect(result.facts).toContainEqual({ kind: 'AddressNeeded' })
  })

  it('confirms an order and emits OrderConfirmed', () => {
    const withAddress = run(
      { intent: 'give_address', ...noRefs, address: 'Fidjrossè, Cotonou' },
      cartWithRobe(2),
    ).state
    const result = run({ intent: 'confirm_order', ...noRefs }, withAddress)

    expect(result.state.phase).toBe('confirmed')
    const event = result.events.find((e) => e.type === 'OrderConfirmed')
    expect(event?.type === 'OrderConfirmed' && event.order).toMatchObject({
      orderId: `pilot:c1:${at}`,
      subtotal: 24000,
      deliveryFee: 1000,
      total: 25000,
      paymentMethod: 'cash_on_delivery',
    })
    expect(result.allowedNumbers).toEqual(expect.arrayContaining([24000, 1000, 25000]))
  })

  it('computes the deposit for a made-to-order line', () => {
    const cart = run({
      intent: 'add_to_cart',
      productRefs: [{ productId: 'tenue-mesure', quantity: 1 }],
    }).state
    const withAddress = run({ intent: 'give_address', ...noRefs, address: 'Cotonou' }, cart).state
    const result = run({ intent: 'confirm_order', ...noRefs }, withAddress)
    const event = result.events.find((e) => e.type === 'OrderConfirmed')
    expect(event?.type === 'OrderConfirmed' && event.order.depositAmount).toBe(12500)
  })

  it('refuses to confirm an empty cart', () => {
    const result = run({ intent: 'confirm_order', ...noRefs })
    expect(result.state.phase).toBe('browsing')
    expect(result.facts).toContainEqual({ kind: 'Unclear' })
  })

  it('cancels and empties the cart', () => {
    const result = run({ intent: 'cancel', ...noRefs }, cartWithRobe(1))
    expect(result.state.phase).toBe('cancelled')
    expect(result.state.cart).toEqual([])
    expect(result.facts).toContainEqual({ kind: 'OrderCancelled' })
  })

  it('reports off topic without changing the phase', () => {
    const result = run({ intent: 'off_topic', ...noRefs }, cartWithRobe(1))
    expect(result.state.phase).toBe('cart')
    expect(result.facts).toContainEqual({ kind: 'OffTopic' })
  })

  it('emits IntentUnclear with the customer text', () => {
    const result = run({ intent: 'unclear', ...noRefs }, idle, 'zzzz')
    expect(result.events).toContainEqual({ type: 'IntentUnclear', at, text: 'zzzz' })
  })

  it('reports an empty catalogue', () => {
    const empty = {
      ...pilotProfile,
      catalogue: [],
      negotiation: { ...pilotProfile.negotiation, perProduct: {}, quantityDiscounts: [] },
    }
    const result = transition({
      profile: empty,
      state: idle,
      intent: { intent: 'browse', ...noRefs },
      text: 'vous avez quoi',
      receivedAt: at,
    })
    expect(result.facts).toContainEqual({ kind: 'CatalogueEmpty' })
    expect(result.events).toContainEqual({ type: 'CatalogueEmpty', at, merchantId: 'pilot' })
  })

  it('restores an expired conversation before applying the intent', () => {
    const stale = { ...cartWithRobe(1), lastActivityAt: '2026-09-01T10:00:00.000Z' }
    const result = run({ intent: 'greet', ...noRefs }, stale, 'bonsoir')
    expect(result.state.cart).toEqual([])
    expect(result.state.turns).toEqual([{ role: 'customer', text: 'bonsoir', at }])
  })
})
```

- [ ] **Step 9: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/state-machine.spec.ts`
Expected: FAIL, `./state-machine` introuvable.

- [ ] **Step 10: Implémenter `state-machine.ts`**

Squelette imposé — l'aiguillage, deux handlers représentatifs et les utilitaires sont donnés ; les handlers restants suivent la même forme (`(ctx: Ctx) => Partial<Draft>`). Si le fichier dépasse 400 lignes, extraire les handlers dans `libs/engine/src/handlers/` (un fichier par groupe d'intentions) — c'est une décomposition attendue, pas un écart au plan.

```ts
import {
  appendTurn,
  expireConversation,
  orderTotal,
  type CartLine,
  type ConversationState,
  type MerchantProfile,
  type Order,
  type OrderLine,
} from '@wa/domain'
import { evaluateNegotiation } from './negotiation-engine'
import { activeProducts, resolveProductRef, type ResolvedProduct } from './catalogue'
import { collectAllowedNumbers, collectAllowedPhrases } from './allowed'
import type { Intent } from './intent-schema'
import type { TurnFact } from './facts'
import type { EngineEvent } from './events'

export interface TransitionInput {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly intent: Intent
  readonly text: string
  readonly receivedAt: string
}

export interface TransitionResult {
  readonly state: ConversationState
  readonly facts: TurnFact[]
  readonly events: EngineEvent[]
  readonly allowedNumbers: number[]
  readonly allowedPhrases: string[]
}

interface Ctx {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly intent: Intent
  readonly receivedAt: string
}

interface Draft {
  readonly state: ConversationState
  readonly facts: TurnFact[]
  readonly events: EngineEvent[]
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function findZone(profile: MerchantProfile, candidate: string | undefined) {
  if (!candidate) return undefined
  const needle = normalize(candidate)
  return profile.delivery.zones.find((z) => needle.includes(normalize(z.name)))
}

function currentPrice(state: ConversationState, resolved: ResolvedProduct): number {
  return state.negotiation[resolved.product.productId]?.currentOffer ?? resolved.unitPrice
}

function priceFact(resolved: ResolvedProduct): TurnFact {
  const { pricing } = resolved.product
  return {
    kind: 'PriceQuoted',
    productId: resolved.product.productId,
    name: resolved.label,
    price: resolved.unitPrice,
    stock: resolved.stock,
    ...(pricing.kind === 'madeToOrder'
      ? { leadTimeDays: pricing.leadTimeDays, depositPercent: pricing.depositPercent }
      : {}),
  }
}

function cartFact(cart: readonly CartLine[]): TurnFact {
  return {
    kind: 'CartUpdated',
    lines: [...cart],
    subtotal: cart.reduce((sum, l) => sum + l.agreedPrice * l.quantity, 0),
  }
}

function sameLine(line: CartLine, resolved: ResolvedProduct): boolean {
  return line.productId === resolved.product.productId && line.variantId === resolved.variantId
}

function handleAddToCart(ctx: Ctx): Draft {
  return ctx.intent.productRefs.reduce<Draft>(
    (draft, ref) => {
      const resolved = resolveProductRef(ctx.profile, ref)
      if (!resolved) {
        return { ...draft, facts: [...draft.facts, { kind: 'OutOfScope', query: ref.productId }] }
      }
      const existing = draft.state.cart.find((l) => sameLine(l, resolved))
      const quantity = (existing?.quantity ?? 0) + (ref.quantity ?? 1)
      const { pricing } = resolved.product

      if (pricing.kind === 'bulk' && quantity < pricing.minQuantity) {
        const fact: TurnFact = {
          kind: 'MinQuantity',
          productId: resolved.product.productId,
          name: resolved.label,
          minQuantity: pricing.minQuantity,
          unit: pricing.unitOfMeasure,
        }
        return { ...draft, facts: [...draft.facts, fact] }
      }
      if (resolved.stock !== null && quantity > resolved.stock) {
        const fact: TurnFact = {
          kind: 'OutOfStock',
          productId: resolved.product.productId,
          name: resolved.label,
          available: resolved.stock,
        }
        return { ...draft, facts: [...draft.facts, fact] }
      }

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
    },
    { state: ctx.state, facts: [], events: [] },
  )
}

function depositFor(profile: MerchantProfile, lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => {
    const product = profile.catalogue.find((p) => p.productId === line.productId)
    if (product?.pricing.kind !== 'madeToOrder') return sum
    return (
      sum + Math.round((line.agreedPrice * line.quantity * product.pricing.depositPercent) / 100)
    )
  }, 0)
}

function handleConfirmOrder(ctx: Ctx): Draft {
  const { state, profile, receivedAt } = ctx
  if (state.cart.length === 0) {
    return { state: { ...state, phase: 'browsing' }, facts: [{ kind: 'Unclear' }], events: [] }
  }
  const zone = findZone(profile, state.address?.zone ?? state.address?.text)
  if (!state.address || !zone) {
    return { state: { ...state, phase: 'address' }, facts: [{ kind: 'AddressNeeded' }], events: [] }
  }

  const lines: OrderLine[] = state.cart.map((line) => ({
    ...line,
    label: resolveProductRef(profile, line)?.label ?? line.productId,
  }))
  const { subtotal, total } = orderTotal(lines, zone.fee)
  const deposit = depositFor(profile, lines)
  const order: Order = {
    orderId: `${state.merchantId}:${state.customerId}:${receivedAt}`,
    merchantId: state.merchantId,
    customerId: state.customerId,
    lines,
    subtotal,
    deliveryFee: zone.fee,
    total,
    address: { text: state.address.text, zone: zone.name },
    paymentMethod: profile.delivery.paymentMethods[0]!,
    ...(deposit > 0 ? { depositAmount: deposit } : {}),
    createdAt: receivedAt,
  }
  return {
    state: { ...state, phase: 'confirmed' },
    facts: [{ kind: 'OrderSummary', order }],
    events: [{ type: 'OrderConfirmed', at: receivedAt, order }],
  }
}

// Mêmes signatures, même forme, une par ligne du tableau de transitions :
// handleGreet, handleBrowse, handleAskProduct (couvre ask_product et ask_price),
// handleAskDelivery, handleNegotiate, handleRemoveFromCart, handleGiveAddress,
// handleCancel, handleOffTopic, handleUnclear.

const HANDLERS: Record<Intent['intent'], (ctx: Ctx) => Draft> = {
  greet: handleGreet,
  browse: handleBrowse,
  ask_product: handleAskProduct,
  ask_price: handleAskProduct,
  ask_delivery: handleAskDelivery,
  negotiate: handleNegotiate,
  add_to_cart: handleAddToCart,
  remove_from_cart: handleRemoveFromCart,
  give_address: handleGiveAddress,
  confirm_order: handleConfirmOrder,
  cancel: handleCancel,
  off_topic: handleOffTopic,
  unclear: handleUnclear,
}

export function transition(input: TransitionInput): TransitionResult {
  const { profile, intent, text, receivedAt } = input
  const state = appendTurn(expireConversation(input.state, receivedAt), {
    role: 'customer',
    text,
    at: receivedAt,
  })

  const draft: Draft =
    activeProducts(profile).length === 0 && intent.intent !== 'cancel'
      ? {
          state,
          facts: [{ kind: 'CatalogueEmpty' }],
          events: [{ type: 'CatalogueEmpty', at: receivedAt, merchantId: state.merchantId }],
        }
      : HANDLERS[intent.intent]({ profile, state, intent, receivedAt })

  return {
    state: draft.state,
    facts: draft.facts,
    events: draft.events,
    allowedNumbers: collectAllowedNumbers(draft.facts),
    allowedPhrases: collectAllowedPhrases(draft.facts),
  }
}
```

`handleNegotiate` en détail (le seul handler restant dont la logique n'est pas triviale) : pour chaque ref résolue, si `intent.counterOffer` est absent → `priceFact(resolved)` et aucun changement d'état ; sinon appeler `evaluateNegotiation({ policy: profile.negotiation, product: resolved.product, listedPrice: resolved.unitPrice, quantity: intent.productRefs[0]?.quantity ?? 1, counterOffer, round: state.negotiation[productId]?.round ?? 0 })`, écrire `negotiation[productId] = { round: outcome.round, currentOffer: outcome.offer }`, phase `negotiating`, fait `NegotiationResult` avec `final: outcome.reason === 'max_rounds' || outcome.reason === 'floor_reached'`.

- [ ] **Step 11: Vérifier**

Run: `npx nx run engine:test`
Expected: tous verts, couverture ≥ seuils.

- [ ] **Step 12: Commit**

```bash
npx prettier --write libs/engine
printf "export * from './events'\nexport * from './facts'\nexport * from './intent-schema'\nexport * from './catalogue'\nexport * from './allowed'\nexport * from './negotiation-engine'\nexport * from './guardrail'\nexport * from './state-machine'\n" > libs/engine/src/index.ts
npx prettier --write libs/engine/src/index.ts
git add libs/engine
git commit -m "feat(engine): turn facts, catalogue resolution and conversation state machine"
```

---

### Task 8: `libs/engine` — classification d'intention

**Files:**

- Create: `libs/engine/src/intent-schema.ts` (déjà créé à la tâche 7, Step 1 — contenu final ci-dessous), `libs/engine/src/intent.ts`, `libs/engine/src/intent.spec.ts`, `libs/engine/src/prompts/intent.ts`
- Modify: `docs/superpowers/specs/2026-09-20-conversation-engine-design.md`, `libs/engine/src/index.ts`

**Interfaces:**

- Consumes: `LlmProvider`, `LlmUnavailableError` (`@wa/llm-provider`), `MerchantProfile`, `ConversationState` (`@wa/domain`).
- Produces (`intent-schema.ts` pour les schémas, `intent.ts` pour le classifieur) :

```ts
export const INTENT_NAMES = [
  'greet',
  'browse',
  'ask_product',
  'ask_price',
  'ask_delivery',
  'negotiate',
  'add_to_cart',
  'remove_from_cart',
  'give_address',
  'confirm_order',
  'cancel',
  'off_topic',
  'unclear',
] as const
export const ProductRefSchema: z.ZodType<ProductRef>
export const IntentSchema: z.ZodType<Intent>
export type ProductRef = { productId: string; variantId?: string; quantity?: number }
export type Intent = {
  intent: (typeof INTENT_NAMES)[number]
  productRefs: ProductRef[]
  counterOffer?: number
  address?: string
  zone?: string
}
export const INTENT_JSON_SCHEMA: object // schéma JSON passé au provider
export function buildIntentPrompt(profile: MerchantProfile, state: ConversationState): string
export async function classifyIntent(
  provider: LlmProvider,
  profile: MerchantProfile,
  state: ConversationState,
  text: string,
): Promise<{ intent: Intent; usage: LlmUsage }>
```

**Décisions de prompt à figer (report du plan 1) :**

- `browse` = aucun produit nommé (« vous avez quoi ? »). `ask_product` = un produit nommé, question non tarifaire (disponibilité, couleur, photo). `ask_price` = un produit nommé, question de prix.
- `ask_delivery` = **nouvelle intention** : zone, frais ou délai de livraison. C'est la seule erreur dangereuse du spike (les questions de livraison tombaient en `off_topic` ou `unclear`).
- Question de logistique hors livraison (horaires d'ouverture, adresse de la boutique) → `off_topic`. `unclear` est réservé aux messages incompréhensibles ou vides de tout signal.

- [ ] **Step 1: Amender la spec 2**

Dans `docs/superpowers/specs/2026-09-20-conversation-engine-design.md`, ajouter sous le bloc de schéma d'intention :

```markdown
> **Amendement 2026-09-21 (plan 2).** L'énumération gagne `ask_delivery` (zone, frais, délai) :
> le spike du plan 1 a montré que les questions de livraison produisaient la seule erreur de
> classification dangereuse. Frontières figées : `browse` = aucun produit nommé ; `ask_product`
> = produit nommé, question non tarifaire ; `ask_price` = produit nommé, question de prix ;
> horaires et adresse boutique = `off_topic` ; `unclear` = message incompréhensible.
```

- [ ] **Step 2: Écrire les tests**

`libs/engine/src/intent.spec.ts` :

````ts
import { describe, expect, it } from 'vitest'
import { LlmUnavailableError, MockProvider } from '@wa/llm-provider'
import { newConversationState, pilotProfile } from '@wa/domain'
import { buildIntentPrompt, classifyIntent } from './intent'
import { IntentSchema } from './intent-schema'

const state = newConversationState(pilotProfile.merchantId, 'c1', '2026-09-21T10:00:00.000Z')
const valid = JSON.stringify({ intent: 'greet', productRefs: [] })

describe('buildIntentPrompt', () => {
  it('lists every active product with its id, name and aliases', () => {
    const prompt = buildIntentPrompt(pilotProfile, state)
    for (const product of pilotProfile.catalogue.filter((p) => p.active)) {
      expect(prompt).toContain(product.productId)
      expect(prompt).toContain(product.name)
    }
  })

  it('lists the delivery zones', () => {
    const prompt = buildIntentPrompt(pilotProfile, state)
    expect(prompt).toContain(pilotProfile.delivery.zones[0]!.name)
  })

  it('includes the last turns of the conversation', () => {
    const withTurns = {
      ...state,
      turns: [{ role: 'customer' as const, text: 'bonsoir tantie', at: state.lastActivityAt }],
    }
    expect(buildIntentPrompt(pilotProfile, withTurns)).toContain('bonsoir tantie')
  })
})

describe('classifyIntent', () => {
  it('parses a valid JSON reply', async () => {
    const provider = new MockProvider([valid])
    const { intent } = await classifyIntent(provider, pilotProfile, state, 'bonsoir')
    expect(intent).toEqual({ intent: 'greet', productRefs: [] })
  })

  it('passes the json schema to the provider', async () => {
    const provider = new MockProvider([valid])
    await classifyIntent(provider, pilotProfile, state, 'bonsoir')
    expect(provider.calls[0]!.jsonSchema).toBeDefined()
  })

  it('strips a markdown code fence around the JSON', async () => {
    const provider = new MockProvider(['```json\n' + valid + '\n```'])
    const { intent } = await classifyIntent(provider, pilotProfile, state, 'bonsoir')
    expect(intent.intent).toBe('greet')
  })

  it('retries once with the validation error then succeeds', async () => {
    const provider = new MockProvider(['pas du json', valid])
    const { intent } = await classifyIntent(provider, pilotProfile, state, 'bonsoir')
    expect(intent.intent).toBe('greet')
    expect(provider.calls).toHaveLength(2)
    expect(JSON.stringify(provider.calls[1])).toContain('pas du json')
  })

  it('falls back to unclear after two invalid replies', async () => {
    const provider = new MockProvider(['nope', '{"intent":"inconnue","productRefs":[]}'])
    const { intent } = await classifyIntent(provider, pilotProfile, state, 'xxxx')
    expect(intent).toEqual({ intent: 'unclear', productRefs: [] })
  })

  it('sums the usage of both attempts', async () => {
    const provider = new MockProvider([
      { text: 'nope', usage: { inputTokens: 10, outputTokens: 1 } },
      { text: valid, usage: { inputTokens: 12, outputTokens: 2 } },
    ])
    const { usage } = await classifyIntent(provider, pilotProfile, state, 'bonsoir')
    expect(usage).toEqual({ inputTokens: 22, outputTokens: 3 })
  })

  it('propagates a provider failure instead of swallowing it', async () => {
    const provider = new MockProvider([new LlmUnavailableError('down')])
    await expect(classifyIntent(provider, pilotProfile, state, 'bonsoir')).rejects.toBeInstanceOf(
      LlmUnavailableError,
    )
  })

  it('accepts every intent name in the schema', () => {
    expect(IntentSchema.parse({ intent: 'ask_delivery', productRefs: [] }).intent).toBe(
      'ask_delivery',
    )
  })
})
````

- [ ] **Step 3: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/intent.spec.ts`
Expected: FAIL (`classifyIntent` non exporté).

- [ ] **Step 4: Implémenter `prompts/intent.ts`**

```ts
import type { ConversationState, MerchantProfile } from '@wa/domain'
import { activeProducts } from '../catalogue'

/** Prompt système du classifieur : catalogue compact, zones, 6 derniers tours, règles de frontière. */
export function buildIntentPrompt(profile: MerchantProfile, state: ConversationState): string {
  const products = activeProducts(profile)
    .map((p) => `${p.productId} | ${p.name} | ${p.aliases.join(', ')}`)
    .join('\n')
  const zones = profile.delivery.zones.map((z) => z.name).join(', ')
  const history = state.turns
    .slice(-6)
    .map((t) => `${t.role === 'customer' ? 'Client' : 'Commerçant'}: ${t.text}`)
    .join('\n')

  return [
    "Tu classes le message d'un client d'une boutique béninoise. Réponds UNIQUEMENT en JSON.",
    '',
    'Produits (productId | nom | alias) :',
    products || '(aucun produit actif)',
    '',
    `Zones de livraison : ${zones}`,
    '',
    'Règles :',
    '- browse : le client ne nomme aucun produit précis (« vous avez quoi ? »).',
    '- ask_product : un produit est nommé, la question ne porte pas sur le prix.',
    '- ask_price : un produit est nommé, la question porte sur le prix.',
    '- ask_delivery : la question porte sur la zone, les frais ou le délai de livraison.',
    '- negotiate : le client propose un prix. Mets le montant proposé dans counterOffer.',
    '- off_topic : horaires, adresse de la boutique, produit absent du catalogue, hors sujet.',
    '- unclear : message incompréhensible ou sans signal.',
    "- productRefs ne contient que des productId de la liste ci-dessus. Jamais d'invention.",
    history ? `\nDerniers tours :\n${history}` : '',
  ].join('\n')
}
```

- [ ] **Step 5: Écrire `intent-schema.ts` puis `intent.ts`**

Deux fichiers. `intent-schema.ts` n'importe que `zod` : c'est ce qui casse le cycle
`intent.ts → prompts/intent.ts → catalogue.ts → intent-schema.ts`.

`libs/engine/src/intent-schema.ts` :

```ts
import { z } from 'zod'

export const INTENT_NAMES = [
  'greet',
  'browse',
  'ask_product',
  'ask_price',
  'ask_delivery',
  'negotiate',
  'add_to_cart',
  'remove_from_cart',
  'give_address',
  'confirm_order',
  'cancel',
  'off_topic',
  'unclear',
] as const

export const ProductRefSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().positive().optional(),
})

export const IntentSchema = z.object({
  intent: z.enum(INTENT_NAMES),
  productRefs: z.array(ProductRefSchema),
  counterOffer: z.number().int().nonnegative().optional(),
  address: z.string().optional(),
  zone: z.string().optional(),
})

export type ProductRef = z.infer<typeof ProductRefSchema>
export type Intent = z.infer<typeof IntentSchema>

export const UNCLEAR_INTENT: Intent = { intent: 'unclear', productRefs: [] }

export const INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'productRefs'],
  properties: {
    intent: { type: 'string', enum: [...INTENT_NAMES] },
    productRefs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['productId'],
        properties: {
          productId: { type: 'string' },
          variantId: { type: 'string' },
          quantity: { type: 'number' },
        },
      },
    },
    counterOffer: { type: 'number' },
    address: { type: 'string' },
    zone: { type: 'string' },
  },
} as const
```

`libs/engine/src/intent.ts` :

````ts
import type { ConversationState, MerchantProfile } from '@wa/domain'
import type { LlmProvider, LlmUsage } from '@wa/llm-provider'
import { INTENT_JSON_SCHEMA, IntentSchema, UNCLEAR_INTENT, type Intent } from './intent-schema'
import { buildIntentPrompt } from './prompts/intent'

const INTENT_MAX_TOKENS = 200

/** Retire une éventuelle clôture markdown ```json ... ``` autour de la réponse. */
function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
}

function parseIntent(raw: string): { ok: true; intent: Intent } | { ok: false; error: string } {
  try {
    const parsed = IntentSchema.safeParse(JSON.parse(stripFence(raw)))
    return parsed.success
      ? { ok: true, intent: parsed.data }
      : { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  } catch (error) {
    return { ok: false, error: `réponse non JSON: ${String(error)}` }
  }
}

export { buildIntentPrompt }

/**
 * Appel LLM n°1. Un seul retry, avec l'erreur de validation et la réponse fautive en contexte.
 * Deuxième échec → `unclear` (le pipeline émettra `IntentUnclear`). Une panne provider remonte.
 */
export async function classifyIntent(
  provider: LlmProvider,
  profile: MerchantProfile,
  state: ConversationState,
  text: string,
): Promise<{ intent: Intent; usage: LlmUsage }> {
  const system = buildIntentPrompt(profile, state)
  const first = await provider.complete({
    system,
    messages: [{ role: 'user', content: text }],
    jsonSchema: INTENT_JSON_SCHEMA,
    maxTokens: INTENT_MAX_TOKENS,
  })
  const parsed = parseIntent(first.text)
  if (parsed.ok) return { intent: parsed.intent, usage: first.usage }

  const retry = await provider.complete({
    system,
    messages: [
      { role: 'user', content: text },
      { role: 'assistant', content: first.text },
      {
        role: 'user',
        content: `JSON invalide (${parsed.error}). Réponds uniquement le JSON valide.`,
      },
    ],
    jsonSchema: INTENT_JSON_SCHEMA,
    maxTokens: INTENT_MAX_TOKENS,
  })
  const usage = {
    inputTokens: first.usage.inputTokens + retry.usage.inputTokens,
    outputTokens: first.usage.outputTokens + retry.usage.outputTokens,
  }
  const second = parseIntent(retry.text)
  return { intent: second.ok ? second.intent : UNCLEAR_INTENT, usage }
}
````

- [ ] **Step 6: Vérifier**

Run: `npx nx run engine:test`
Expected: tous verts.

- [ ] **Step 7: Commit**

```bash
npx prettier --write libs/engine docs
git add libs/engine docs
git commit -m "feat(engine): intent classifier with ask_delivery and single JSON retry"
```

---

### Task 9: `libs/engine` — rédaction (composer)

**Files:**

- Create: `libs/engine/src/prompts/composer.ts`, `libs/engine/src/composer.ts`, `libs/engine/src/composer.spec.ts`
- Modify: `libs/engine/src/index.ts`

**Interfaces:**

- Consumes: `StyleProfile`, `Limits` (`@wa/domain`), `LlmProvider` (`@wa/llm-provider`), `TurnFact` (tâche 7).
- Produces:

```ts
export function buildComposerPrompt(input: {
  style: StyleProfile
  facts: readonly TurnFact[]
  allowedNumbers: readonly number[]
  maxReplyChars: number
}): string

export async function composeReply(
  provider: LlmProvider,
  input: {
    style: StyleProfile
    facts: readonly TurnFact[]
    allowedNumbers: readonly number[]
    maxReplyChars: number
  },
  correction?: { draft: string; offending: readonly number[] },
): Promise<{ text: string; usage: LlmUsage }>
```

- [ ] **Step 1: Écrire les tests**

`libs/engine/src/composer.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { MockProvider } from '@wa/llm-provider'
import { pilotProfile } from '@wa/domain'
import { buildComposerPrompt, composeReply } from './composer'
import type { TurnFact } from './facts'

const style = pilotProfile.style
const facts: TurnFact[] = [
  { kind: 'PriceQuoted', productId: 'robe', name: 'Robe rouge', price: 12000 },
]
const input = { style, facts, allowedNumbers: [12000], maxReplyChars: 320 }

describe('buildComposerPrompt', () => {
  it('states the style, the address form and the emoji level', () => {
    const prompt = buildComposerPrompt(input)
    expect(prompt).toContain(style.tone)
    expect(prompt).toContain(style.addressForm)
  })

  it('lists the allowed numbers explicitly', () => {
    expect(buildComposerPrompt(input)).toContain('12000')
  })

  it('states the character limit', () => {
    expect(buildComposerPrompt(input)).toContain('320')
  })

  it('includes the merchant example replies', () => {
    expect(buildComposerPrompt(input)).toContain(style.examples[0]!.merchant)
  })

  it('forbids inventing numbers and spelling them out', () => {
    const prompt = buildComposerPrompt(input).toLowerCase()
    expect(prompt).toContain('invent')
    expect(prompt).toContain('lettres')
  })

  it('serialises the facts of the turn', () => {
    expect(buildComposerPrompt(input)).toContain('PriceQuoted')
  })
})

describe('composeReply', () => {
  it('returns the provider text and usage', async () => {
    const provider = new MockProvider([
      { text: 'La robe est à 12000F.', usage: { inputTokens: 100, outputTokens: 12 } },
    ])
    expect(await composeReply(provider, input)).toEqual({
      text: 'La robe est à 12000F.',
      usage: { inputTokens: 100, outputTokens: 12 },
    })
  })

  it('does not pass a json schema', async () => {
    const provider = new MockProvider(['ok'])
    await composeReply(provider, input)
    expect(provider.calls[0]!.jsonSchema).toBeUndefined()
  })

  it('names the offending numbers when regenerating', async () => {
    const provider = new MockProvider(['ok'])
    await composeReply(provider, input, { draft: 'je te fais 9500F', offending: [9500] })
    const sent = JSON.stringify(provider.calls[0])
    expect(sent).toContain('9500')
    expect(sent).toContain('je te fais 9500F')
  })

  it('trims surrounding whitespace and quotes', async () => {
    const provider = new MockProvider(['  "La robe est à 12000F."  '])
    expect((await composeReply(provider, input)).text).toBe('La robe est à 12000F.')
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/composer.spec.ts`
Expected: FAIL, `./composer` introuvable.

- [ ] **Step 3: Implémenter `prompts/composer.ts`**

```ts
import type { StyleProfile } from '@wa/domain'
import type { TurnFact } from '../facts'

export interface ComposerPromptInput {
  readonly style: StyleProfile
  readonly facts: readonly TurnFact[]
  readonly allowedNumbers: readonly number[]
  readonly maxReplyChars: number
}

const EMOJI_RULE = ['Aucun emoji.', 'Un emoji maximum.', 'Deux emojis maximum.'] as const

/**
 * Prompt système du rédacteur. Il ne reçoit QUE les faits validés par la machine à états :
 * il n'a jamais accès au catalogue brut, donc rien à inventer.
 */
export function buildComposerPrompt(input: ComposerPromptInput): string {
  const { style, facts, allowedNumbers, maxReplyChars } = input
  const examples = style.examples
    .map((e) => `Client: ${e.customer}\nCommerçant: ${e.merchant}`)
    .join('\n\n')

  return [
    `Tu écris à la place du commerçant, ton ${style.tone}, en disant « ${style.addressForm} ».`,
    `Salutation habituelle : « ${style.greeting} ». Signature : « ${style.signoff} ».`,
    `${EMOJI_RULE[style.emojiLevel]} Français${
      style.languageMix.secondary ? ` avec quelques mots ${style.languageMix.secondary}` : ''
    }.`,
    '',
    'Exemples de ses réponses :',
    examples,
    '',
    'Faits du tour (les seules informations vraies dont tu disposes) :',
    JSON.stringify(facts, null, 2),
    '',
    `Nombres autorisés : ${allowedNumbers.join(', ')}.`,
    "N'écris aucun autre nombre. N'invente ni prix, ni stock, ni délai.",
    "N'écris jamais un nombre en toutes lettres : utilise les chiffres.",
    `Réponds en une à trois phrases, ${maxReplyChars} caractères maximum.`,
    'Réponds uniquement le message, sans guillemets ni commentaire.',
  ].join('\n')
}
```

- [ ] **Step 4: Implémenter `composer.ts`**

```ts
import type { LlmProvider, LlmUsage } from '@wa/llm-provider'
import { buildComposerPrompt, type ComposerPromptInput } from './prompts/composer'

export { buildComposerPrompt }
export type { ComposerPromptInput }

export interface ComposerCorrection {
  readonly draft: string
  readonly offending: readonly number[]
}

function cleanReply(text: string): string {
  return text.trim().replace(/^["«»\s]+|["«»\s]+$/g, '')
}

/** Marge de tokens : ~4 caractères par token, plus une réserve pour la ponctuation. */
function maxTokensFor(maxReplyChars: number): number {
  return Math.ceil(maxReplyChars / 3) + 40
}

/**
 * Appel LLM n°2. `correction` est fourni par le pipeline après un garde-fou en échec :
 * on redemande une réponse en nommant les nombres fautifs.
 */
export async function composeReply(
  provider: LlmProvider,
  input: ComposerPromptInput,
  correction?: ComposerCorrection,
): Promise<{ text: string; usage: LlmUsage }> {
  const system = buildComposerPrompt(input)
  const content = correction
    ? [
        `Ta réponse précédente était : « ${correction.draft} »`,
        `Elle contient des nombres interdits : ${correction.offending.join(', ')}.`,
        'Réécris-la en ne citant que les nombres autorisés.',
      ].join('\n')
    : 'Rédige la réponse.'

  const response = await provider.complete({
    system,
    messages: [{ role: 'user', content }],
    maxTokens: maxTokensFor(input.maxReplyChars),
  })
  return { text: cleanReply(response.text), usage: response.usage }
}
```

- [ ] **Step 5: Vérifier**

Run: `npx nx run engine:test`
Expected: tous verts.

- [ ] **Step 6: Commit**

```bash
npx prettier --write libs/engine
git add libs/engine
git commit -m "feat(engine): style-aware composer bounded to validated facts"
```

---

### Task 10: `libs/engine` — pipeline

**Files:**

- Create: `libs/engine/src/pipeline.ts`, `libs/engine/src/pipeline.spec.ts`
- Modify: `libs/engine/src/index.ts`

**Interfaces:**

- Consumes: tout ce qui précède.
- Produces:

```ts
export interface EngineDeps {
  readonly provider: LlmProvider
}

export interface EngineInput {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly counter: ReplyCounter
  readonly text: string
  readonly receivedAt: string
}

export interface EngineOutput {
  readonly replyText: string
  readonly state: ConversationState
  readonly counter: ReplyCounter
  readonly events: EngineEvent[]
}

export const EMPTY_MESSAGE_REPLY = 'Envoie-moi ton message en texte, je te réponds tout de suite.'

export async function handleMessage(deps: EngineDeps, input: EngineInput): Promise<EngineOutput>
```

**Ordre imposé (spec §Pipeline) :**

1. **Message vide ou blanc** → `EMPTY_MESSAGE_REPLY`, aucun appel LLM, aucun décompte, état inchangé.
2. **Quota** : après recalage de période (`periodOf(receivedAt)` ≠ `counter.period` remet le compteur à 0), si `replies >= profile.limits.maxRepliesPerMonth` → fallback + event `QuotaExceeded`, **aucun appel LLM**, aucun décompte.
3. `classifyIntent`. `LlmUnavailableError` → fallback + `ProviderDown{stage:'intent'}`, **pas de décompte**.
4. `transition` (journalise le tour client, produit faits, events, nombres et libellés autorisés).
5. `composeReply`. `LlmUnavailableError` → fallback + `ProviderDown{stage:'composer'}`, **pas de décompte**.
6. `checkReply`. Échec → un `composeReply` correctif → `checkReply` à nouveau. Second échec → fallback + event `GuardrailTripped`, et le quota **est** décompté (les appels ont eu lieu).
7. Décompte : `incrementCounter`, event `ReplySent` avec la somme des usages de tous les appels (retries compris).
8. Le tour **bot** est ajouté à l'état via `appendTurn` — y compris pour un fallback, sauf dans les cas 1 et 2 où l'état n'est pas touché.

Fallback : `profile.style.fallbacks[0]` (le schéma en garantit au moins 2), tronqué à `maxReplyChars`. Il n'est pas soumis au garde-fou : il vient du commerçant, pas du LLM.

- [ ] **Step 1: Écrire les tests**

`libs/engine/src/pipeline.spec.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { LlmUnavailableError, MockProvider } from '@wa/llm-provider'
import { newConversationState, pilotProfile, ReplyCounterSchema } from '@wa/domain'
import { EMPTY_MESSAGE_REPLY, handleMessage } from './pipeline'

const at = '2026-09-21T10:00:00.000Z'
const state = newConversationState(pilotProfile.merchantId, 'c1', at)
const counter = ReplyCounterSchema.parse({ merchantId: 'pilot', period: '2026-09', replies: 0 })
const base = { profile: pilotProfile, state, counter, receivedAt: at }
const greet = JSON.stringify({ intent: 'greet', productRefs: [] })
const fallback = pilotProfile.style.fallbacks[0]

describe('handleMessage', () => {
  it('answers a greeting, counts the reply and emits ReplySent', async () => {
    const provider = new MockProvider([
      { text: greet, usage: { inputTokens: 10, outputTokens: 2 } },
      { text: 'Bonsoir, bienvenue !', usage: { inputTokens: 20, outputTokens: 5 } },
    ])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })

    expect(out.replyText).toBe('Bonsoir, bienvenue !')
    expect(out.counter.replies).toBe(1)
    expect(out.events).toContainEqual({ type: 'ReplySent', at, inputTokens: 30, outputTokens: 7 })
    expect(out.state.turns).toEqual([
      { role: 'customer', text: 'bonsoir', at },
      { role: 'bot', text: 'Bonsoir, bienvenue !', at },
    ])
  })

  it('answers an empty message without calling the LLM', async () => {
    const provider = new MockProvider([])
    const out = await handleMessage({ provider }, { ...base, text: '   ' })
    expect(provider.calls).toEqual([])
    expect(out.replyText).toBe(EMPTY_MESSAGE_REPLY)
    expect(out.counter.replies).toBe(0)
    expect(out.state).toEqual(state)
  })

  it('short-circuits on quota with no LLM call', async () => {
    const provider = new MockProvider([])
    const full = { ...counter, replies: pilotProfile.limits.maxRepliesPerMonth }
    const out = await handleMessage({ provider }, { ...base, counter: full, text: 'bonsoir' })

    expect(provider.calls).toEqual([])
    expect(out.replyText).toBe(fallback)
    expect(out.counter.replies).toBe(full.replies)
    expect(out.events).toContainEqual({ type: 'QuotaExceeded', at, merchantId: 'pilot' })
  })

  it('resets the quota when the billing period changes', async () => {
    const provider = new MockProvider([greet, 'Bonsoir !'])
    const old = { ...counter, period: '2026-08', replies: 99999 }
    const out = await handleMessage({ provider }, { ...base, counter: old, text: 'bonsoir' })
    expect(out.counter).toEqual({ merchantId: 'pilot', period: '2026-09', replies: 1 })
  })

  it('falls back without counting when the intent call fails', async () => {
    const provider = new MockProvider([new LlmUnavailableError('down')])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })

    expect(out.replyText).toBe(fallback)
    expect(out.counter.replies).toBe(0)
    expect(out.events).toContainEqual({
      type: 'ProviderDown',
      at,
      stage: 'intent',
      message: 'down',
    })
    expect(out.state.turns.at(-1)).toEqual({ role: 'bot', text: fallback, at })
  })

  it('falls back without counting when the composer call fails', async () => {
    const provider = new MockProvider([greet, new LlmUnavailableError('down')])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })
    expect(out.events.some((e) => e.type === 'ProviderDown' && e.stage === 'composer')).toBe(true)
    expect(out.counter.replies).toBe(0)
  })

  it('regenerates once when the guardrail trips, then accepts', async () => {
    const provider = new MockProvider([greet, 'Je te fais 9500F.', 'Bonsoir, bienvenue !'])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })

    expect(out.replyText).toBe('Bonsoir, bienvenue !')
    expect(provider.calls).toHaveLength(3)
    expect(out.events.some((e) => e.type === 'GuardrailTripped')).toBe(false)
    expect(out.counter.replies).toBe(1)
  })

  it('falls back and warns the merchant after two guardrail failures', async () => {
    const provider = new MockProvider([greet, 'Je te fais 9500F.', 'Non, 7300F.'])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })

    expect(out.replyText).toBe(fallback)
    expect(out.counter.replies).toBe(1)
    expect(out.events).toContainEqual({
      type: 'GuardrailTripped',
      at,
      offending: [7300],
      draft: 'Non, 7300F.',
    })
  })

  it('accepts a catalogue price quoted on a greeting', async () => {
    const provider = new MockProvider([greet, 'Bonsoir ! La robe est à 12000F.'])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })
    expect(out.replyText).toBe('Bonsoir ! La robe est à 12000F.')
  })

  it('truncates a reply that exceeds maxReplyChars', async () => {
    const long = `Bonsoir. ${'Merci pour ta confiance. '.repeat(40)}`
    const provider = new MockProvider([greet, long])
    const out = await handleMessage({ provider }, { ...base, text: 'bonsoir' })
    expect(out.replyText.length).toBeLessThanOrEqual(pilotProfile.limits.maxReplyChars)
  })

  it('forwards the state machine events', async () => {
    const unclear = JSON.stringify({ intent: 'unclear', productRefs: [] })
    const provider = new MockProvider([unclear, 'Tu peux répéter ?'])
    const out = await handleMessage({ provider }, { ...base, text: 'zzzz' })
    expect(out.events).toContainEqual({ type: 'IntentUnclear', at, text: 'zzzz' })
  })

  it('never mutates its inputs', async () => {
    const provider = new MockProvider([greet, 'Bonsoir !'])
    const snapshot = JSON.stringify({ state, counter })
    await handleMessage({ provider }, { ...base, text: 'bonsoir' })
    expect(JSON.stringify({ state, counter })).toBe(snapshot)
  })
})
```

- [ ] **Step 2: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/pipeline.spec.ts`
Expected: FAIL, `./pipeline` introuvable.

- [ ] **Step 3: Implémenter `pipeline.ts`**

```ts
import {
  appendTurn,
  incrementCounter,
  periodOf,
  type ConversationState,
  type MerchantProfile,
  type ReplyCounter,
} from '@wa/domain'
import { LlmUnavailableError, type LlmProvider, type LlmUsage } from '@wa/llm-provider'
import { classifyIntent } from './intent'
import { composeReply } from './composer'
import { checkReply, truncateToSentence } from './guardrail'
import { transition, type TransitionResult } from './state-machine'
import type { EngineEvent } from './events'

export interface EngineDeps {
  readonly provider: LlmProvider
}

export interface EngineInput {
  readonly profile: MerchantProfile
  readonly state: ConversationState
  readonly counter: ReplyCounter
  readonly text: string
  readonly receivedAt: string
}

export interface EngineOutput {
  readonly replyText: string
  readonly state: ConversationState
  readonly counter: ReplyCounter
  readonly events: EngineEvent[]
}

export const EMPTY_MESSAGE_REPLY = 'Envoie-moi ton message en texte, je te réponds tout de suite.'

const NO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0 }

function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  }
}

function fallbackText(profile: MerchantProfile): string {
  return truncateToSentence(profile.style.fallbacks[0]!, profile.limits.maxReplyChars)
}

/** Réponse qui ne consomme pas de quota : l'état reçoit quand même le tour bot. */
function withoutCounting(
  input: EngineInput,
  state: ConversationState,
  replyText: string,
  events: EngineEvent[],
): EngineOutput {
  return {
    replyText,
    state: appendTurn(state, { role: 'bot', text: replyText, at: input.receivedAt }),
    counter: input.counter,
    events,
  }
}

interface ComposedReply {
  readonly replyText: string
  readonly usage: LlmUsage
  readonly events: EngineEvent[]
}

/**
 * Rédige, vérifie, régénère une fois si le garde-fou saute, puis retombe sur la réponse
 * sûre du commerçant. Les appels LLM ayant eu lieu, l'appelant décompte le quota dans tous
 * les cas rendus par cette fonction.
 */
async function composeGuarded(
  deps: EngineDeps,
  input: EngineInput,
  turn: TransitionResult,
): Promise<ComposedReply> {
  const { profile, receivedAt } = input
  const promptInput = {
    style: profile.style,
    facts: turn.facts,
    allowedNumbers: turn.allowedNumbers,
    maxReplyChars: profile.limits.maxReplyChars,
  }
  const guard = (text: string) =>
    checkReply({
      text,
      allowedNumbers: turn.allowedNumbers,
      allowedPhrases: turn.allowedPhrases,
      maxReplyChars: profile.limits.maxReplyChars,
    })

  const first = await composeReply(deps.provider, promptInput)
  const firstCheck = guard(first.text)
  if (firstCheck.ok) return { replyText: firstCheck.text, usage: first.usage, events: [] }

  const second = await composeReply(deps.provider, promptInput, {
    draft: first.text,
    offending: firstCheck.offending,
  })
  const usage = addUsage(first.usage, second.usage)
  const secondCheck = guard(second.text)
  if (secondCheck.ok) return { replyText: secondCheck.text, usage, events: [] }

  return {
    replyText: fallbackText(profile),
    usage,
    events: [
      {
        type: 'GuardrailTripped',
        at: receivedAt,
        offending: [...secondCheck.offending],
        draft: second.text,
      },
    ],
  }
}

/**
 * Traite un message client de bout en bout. Fonction pure hors appels au provider :
 * l'horloge est `input.receivedAt`, la persistance est la responsabilité de l'appelant.
 */
export async function handleMessage(deps: EngineDeps, input: EngineInput): Promise<EngineOutput> {
  const { profile, counter, receivedAt } = input
  const text = input.text.trim()

  if (text.length === 0) {
    return { replyText: EMPTY_MESSAGE_REPLY, state: input.state, counter, events: [] }
  }

  const periodCounter =
    periodOf(receivedAt) === counter.period
      ? counter
      : { merchantId: counter.merchantId, period: periodOf(receivedAt), replies: 0 }

  if (periodCounter.replies >= profile.limits.maxRepliesPerMonth) {
    return {
      replyText: fallbackText(profile),
      state: input.state,
      counter: periodCounter,
      events: [{ type: 'QuotaExceeded', at: receivedAt, merchantId: profile.merchantId }],
    }
  }

  let intentUsage: LlmUsage = NO_USAGE
  let turn: TransitionResult
  try {
    const classified = await classifyIntent(deps.provider, profile, input.state, text)
    intentUsage = classified.usage
    turn = transition({ profile, state: input.state, intent: classified.intent, text, receivedAt })
  } catch (error) {
    if (!(error instanceof LlmUnavailableError)) throw error
    return withoutCounting(input, input.state, fallbackText(profile), [
      { type: 'ProviderDown', at: receivedAt, stage: 'intent', message: error.message },
    ])
  }

  let composed: ComposedReply
  try {
    composed = await composeGuarded(deps, input, turn)
  } catch (error) {
    if (!(error instanceof LlmUnavailableError)) throw error
    return withoutCounting(input, turn.state, fallbackText(profile), [
      ...turn.events,
      { type: 'ProviderDown', at: receivedAt, stage: 'composer', message: error.message },
    ])
  }

  const usage = addUsage(intentUsage, composed.usage)
  return {
    replyText: composed.replyText,
    state: appendTurn(turn.state, { role: 'bot', text: composed.replyText, at: receivedAt }),
    counter: incrementCounter(periodCounter, receivedAt),
    events: [
      ...turn.events,
      ...composed.events,
      {
        type: 'ReplySent',
        at: receivedAt,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    ],
  }
}
```

`let` est utilisé pour deux variables locales à `handleMessage` parce que `try/catch` ne permet pas de les lier en `const` ; aucune donnée d'entrée n'est mutée.

- [ ] **Step 4: Vérifier**

Run: `npx nx run engine:test && npx tsc -p libs/engine/tsconfig.lib.json --noEmit && npx tsc -p libs/engine/tsconfig.spec.json --noEmit`
Expected: tous verts, couverture ≥ seuils, 0 erreur tsc.

- [ ] **Step 5: API publique**

`libs/engine/src/index.ts` :

```ts
export * from './events'
export * from './facts'
export * from './intent-schema'
export * from './catalogue'
export * from './allowed'
export * from './negotiation-engine'
export * from './guardrail'
export * from './intent'
export * from './composer'
export * from './state-machine'
export * from './pipeline'
```

- [ ] **Step 6: Commit**

```bash
npx prettier --write libs/engine
git add libs/engine
git commit -m "feat(engine): message pipeline with quota, guardrail retry and events"
```

---

### Task 11: Scénarios YAML de bout en bout

**Files:**

- Create: `libs/engine/scenarios/*.yaml` (10 fichiers), `libs/engine/src/scenarios.spec.ts`, `libs/engine/scenarios/README.md`
- Modify: `package.json` (devDependency `yaml`)

**Interfaces:**

- Consumes: `handleMessage`, `MockProvider`, `pilotProfile`.
- Produces: un runner qui découvre `libs/engine/scenarios/*.yaml` et joue chaque tour.

**Format d'un scénario :**

```yaml
name: achat simple
turns:
  - customer: Bonsoir, la robe rouge c'est combien ?
    intent: { intent: ask_price, productRefs: [{ productId: robe-rouge }] }
    reply: La robe rouge est à 12000F.
    expect:
      phase: browsing
      cartSize: 0
  - customer: Ok j'en prends 2
    intent: { intent: add_to_cart, productRefs: [{ productId: robe-rouge, quantity: 2 }] }
    reply: Parfait, 2 robes, ça fait 24000F.
    expect:
      phase: cart
      cartSize: 1
      events: [ReplySent]
```

`intent` est la réponse scriptée du premier appel LLM (sérialisée en JSON par le runner), `reply` celle du second. `expect` porte sur l'état et les events **après** le tour. Un `reply` qui viole le garde-fou est un cas de test légitime : ajouter alors `replyRetry` pour la régénération.

**Les 10 scénarios (un fichier chacun) :** `achat-simple`, `negociation-acceptee`, `negociation-refusee-plancher`, `vrac`, `sur-commande-acompte`, `hors-catalogue`, `quota-atteint`, `zone-inconnue`, `annulation`, `reprise-apres-expiration`.

- [ ] **Step 1: Installer `yaml`**

```bash
npm i -D yaml
```

- [ ] **Step 2: Écrire le runner**

`libs/engine/src/scenarios.spec.ts` :

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { MockProvider, type MockScript } from '@wa/llm-provider'
import {
  newConversationState,
  pilotProfile,
  ReplyCounterSchema,
  type ConversationState,
} from '@wa/domain'
import { handleMessage } from './pipeline'

interface ScenarioTurn {
  customer: string
  intent: unknown
  reply: string
  replyRetry?: string
  at?: string
  expect?: { phase?: string; cartSize?: number; events?: string[]; replyContains?: string }
}

interface Scenario {
  name: string
  repliesUsed?: number
  turns: ScenarioTurn[]
}

const dir = fileURLToPath(new URL('../scenarios', import.meta.url))
const files = readdirSync(dir).filter((f) => f.endsWith('.yaml'))

describe('scenarios', () => {
  it('discovers every scenario file', () => {
    expect(files.length).toBeGreaterThanOrEqual(10)
  })

  for (const file of files) {
    const scenario = parse(readFileSync(join(dir, file), 'utf8')) as Scenario

    it(`${file}: ${scenario.name}`, async () => {
      let state: ConversationState = newConversationState(
        pilotProfile.merchantId,
        'c1',
        '2026-09-21T10:00:00.000Z',
      )
      let counter = ReplyCounterSchema.parse({
        merchantId: pilotProfile.merchantId,
        period: '2026-09',
        replies: scenario.repliesUsed ?? 0,
      })

      for (const [index, turn] of scenario.turns.entries()) {
        const script: MockScript[] = [JSON.stringify(turn.intent), turn.reply]
        if (turn.replyRetry) script.push(turn.replyRetry)
        const provider = new MockProvider(script)
        const receivedAt = turn.at ?? `2026-09-21T10:0${index}:00.000Z`

        const out = await handleMessage(
          { provider },
          { profile: pilotProfile, state, counter, text: turn.customer, receivedAt },
        )
        state = out.state
        counter = out.counter

        const expected = turn.expect ?? {}
        if (expected.phase) expect(state.phase, `turn ${index}`).toBe(expected.phase)
        if (expected.cartSize !== undefined)
          expect(state.cart, `turn ${index}`).toHaveLength(expected.cartSize)
        if (expected.replyContains) expect(out.replyText).toContain(expected.replyContains)
        for (const type of expected.events ?? []) {
          expect(
            out.events.map((e) => e.type),
            `turn ${index}`,
          ).toContain(type)
        }
      }
    })
  }
})
```

- [ ] **Step 3: Lancer — doit échouer**

Run: `npx vitest run libs/engine/src/scenarios.spec.ts`
Expected: FAIL, le dossier `scenarios` n'existe pas.

- [ ] **Step 4: Écrire les 10 scénarios**

Un fichier par cas de la liste ci-dessus, en s'appuyant sur les `productId` réels de `pilotProfile`. Modèle complet pour `libs/engine/scenarios/hors-catalogue.yaml` :

```yaml
name: produit absent du catalogue
turns:
  - customer: Vous avez des téléviseurs ?
    intent: { intent: off_topic, productRefs: [] }
    reply: Désolée, je ne vends pas ça. Regarde plutôt ce que j'ai en boutique.
    expect:
      phase: idle
      cartSize: 0
      events: [ReplySent]
```

Et pour `libs/engine/scenarios/quota-atteint.yaml` :

```yaml
name: quota mensuel atteint
repliesUsed: 1000
turns:
  - customer: Bonsoir, tu as encore la robe ?
    intent: { intent: ask_product, productRefs: [] }
    reply: ignoré, aucun appel LLM ne doit avoir lieu
    expect:
      events: [QuotaExceeded]
```

- [ ] **Step 5: Documenter le format**

`libs/engine/scenarios/README.md` : le format ci-dessus, la sémantique de `intent` / `reply` / `replyRetry` / `expect`, et la consigne « un scénario = un comportement observable, pas un test unitaire déguisé ».

- [ ] **Step 6: Vérifier l'ensemble**

Run: `npx nx run-many -t test && npx tsc -p libs/engine/tsconfig.lib.json --noEmit && npx tsc -p libs/engine/tsconfig.spec.json --noEmit && npx tsc -p libs/llm-provider/tsconfig.lib.json --noEmit`
Expected: `domain`, `llm-provider` et `engine` verts, couverture ≥ seuils partout, 0 erreur tsc.

- [ ] **Step 7: Vérifier la couverture des deux modules critiques**

Ouvrir `coverage/libs/engine/index.html`. `negotiation-engine.ts` et `guardrail.ts` doivent être ≥ 95 % de lignes. Sinon, ajouter les tests manquants avant de commiter.

- [ ] **Step 8: Commit**

```bash
npx prettier --write libs/engine package.json
git add libs/engine package.json package-lock.json
git commit -m "test(engine): ten end-to-end YAML scenarios and runner"
```

---

## Sortie de branche

Une fois les 11 tâches vertes :

```bash
npx nx run-many -t test
git checkout main && git merge --no-ff feat/plan-2-engine -m "feat: conversation engine (plan 2)"
```

Utiliser la skill `superpowers:finishing-a-development-branch` si un doute subsiste sur l'intégration.

## Hors périmètre (plan 3)

`apps/cli` (scénarios live + éval), `apps/api` (Firestore, endpoint `POST /merchants/:id/test-chat`, notification commerçant), `apps/backoffice` (Angular : catalogue éditable, écran « tester mon bot »), adaptateurs de canal (`libs/channels`), ESLint + règle `no-console`, ingestion Facebook (spec 3).
