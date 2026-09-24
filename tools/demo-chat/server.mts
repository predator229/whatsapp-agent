/**
 * DÉMO JETABLE — chat local pour essayer l'agent avant que `apps/api` existe (plan 3).
 *
 * Utilise le vrai code livré : `transition` (machine à états), `checkReply` (garde-fou),
 * `evaluateNegotiation` via la machine, et `OpenAiCompatibleProvider` branché sur Ollama.
 * Ce qui est provisoire ici, et sera remplacé par les tâches 8/9/10 du plan 2 :
 * les deux prompts et la boucle d'orchestration ci-dessous.
 *
 * Lancer : npm run chat
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  newConversationState,
  pilotProfile,
  type ConversationState,
  type MerchantProfile,
} from '../../libs/domain/src/index'
import { OpenAiCompatibleProvider, LlmUnavailableError } from '../../libs/llm-provider/src/index'
import { transition } from '../../libs/engine/src/state-machine'
import { activeProducts } from '../../libs/engine/src/catalogue'
import { checkReply, truncateToSentence } from '../../libs/engine/src/guardrail'
import {
  IntentSchema,
  INTENT_JSON_SCHEMA,
  UNCLEAR_INTENT,
} from '../../libs/engine/src/intent-schema'
import type { Intent } from '../../libs/engine/src/intent-schema'
import type { TurnFact } from '../../libs/engine/src/facts'

const PORT = Number(process.env['PORT'] ?? 5173)
const provider = new OpenAiCompatibleProvider({
  baseUrl: process.env['LLM_BASE_URL'] ?? 'http://localhost:11434',
  model: process.env['LLM_MODEL'] ?? 'qwen2.5:14b-instruct-q4_K_M',
  timeoutMs: 120_000,
})

const profile: MerchantProfile = pilotProfile
const sessions = new Map<string, ConversationState>()

function intentPrompt(p: MerchantProfile, state: ConversationState): string {
  const products = activeProducts(p)
    .map((x) => `${x.productId} | ${x.name} | ${x.aliases.join(', ')}`)
    .join('\n')
  const history = state.turns
    .slice(-6)
    .map((t) => `${t.role === 'customer' ? 'Client' : 'Commerçant'}: ${t.text}`)
    .join('\n')
  return [
    "Tu classes le message d'un client d'une boutique béninoise. Réponds UNIQUEMENT en JSON.",
    '',
    'Produits (productId | nom | alias) :',
    products,
    '',
    `Zones de livraison : ${p.delivery.zones.map((z) => z.name).join(', ')}`,
    '',
    'Règles :',
    '- greet : le client salue ou ouvre la conversation sans rien demander (« yo », « bonsoir »).',
    '- browse : le client demande ce que tu vends, sans nommer de produit précis.',
    '- ask_product : un produit est nommé, la question ne porte pas sur le prix.',
    '- ask_price : un produit est nommé, la question porte sur le prix.',
    '- ask_delivery : la question porte sur la zone, les frais ou le délai de livraison.',
    '- negotiate : le client propose un prix. Mets le montant proposé dans counterOffer.',
    '- add_to_cart : le client veut acheter. Mets la quantité dans productRefs[].quantity.',
    '- give_address : le client donne son adresse. Mets-la dans address.',
    '- remove_from_cart : le client retire un article du panier.',
    '- confirm_order : le client valide sa commande.',
    '- cancel : le client renonce à tout.',
    '- off_topic : horaires, adresse de la boutique, produit absent du catalogue.',
    '- unclear : message incompréhensible.',
    "- productRefs ne contient que des productId de la liste. Jamais d'invention.",
    history ? `\nDerniers tours :\n${history}` : '',
  ].join('\n')
}

const EMOJI_RULE = ['Aucun emoji.', 'Un emoji maximum.', 'Deux emojis maximum.'] as const

function composerPrompt(
  p: MerchantProfile,
  facts: TurnFact[],
  allowed: number[],
  state: ConversationState,
): string {
  const s = p.style
  const liste = facts.some((f) => f.kind === 'ProductsFound')
  const histoire = state.turns
    .slice(-4)
    .map((t) => `${t.role === 'customer' ? 'Client' : 'Toi'}: ${t.text}`)
    .join('\n')
  return [
    `Tu écris à la place du commerçant, ton ${s.tone}, en disant « ${s.addressForm} ».`,
    `Salutation habituelle : « ${s.greeting} ». Signature : « ${s.signoff} ».`,
    `${EMOJI_RULE[s.emojiLevel]} Français.`,
    '',
    'Exemples de ses réponses :',
    s.examples.map((e) => `Client: ${e.customer}\nCommerçant: ${e.merchant}`).join('\n\n'),
    '',
    'Faits du tour (les seules informations vraies dont tu disposes) :',
    JSON.stringify(facts, null, 2),
    '',
    histoire ? `Ce qui vient d'être dit :\n${histoire}\n` : '',
    'Ne répète jamais mot pour mot ta réponse précédente : le client a relancé, fais avancer la vente.',
    liste
      ? 'Le fait « ProductsFound » est une liste : cite CHAQUE produit avec son prix, sans en oublier un seul.'
      : '',
    `Nombres autorisés : ${allowed.join(', ')}.`,
    "N'écris aucun autre nombre. N'invente ni prix, ni stock, ni délai.",
    "N'écris jamais un nombre en toutes lettres : utilise les chiffres.",
    `Réponds en une à trois phrases, ${p.limits.maxReplyChars} caractères maximum.`,
    'Réponds uniquement le message, sans guillemets ni commentaire.',
  ].join('\n')
}

function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
}

async function classify(text: string, state: ConversationState): Promise<Intent> {
  const res = await provider.complete({
    system: intentPrompt(profile, state),
    messages: [{ role: 'user', content: text }],
    jsonSchema: INTENT_JSON_SCHEMA,
    maxTokens: 200,
  })
  const parsed = IntentSchema.safeParse(JSON.parse(stripFence(res.text)))
  return parsed.success ? parsed.data : UNCLEAR_INTENT
}

async function compose(
  facts: TurnFact[],
  allowed: number[],
  state: ConversationState,
  correction?: { draft: string; offending: readonly number[] },
): Promise<string> {
  const res = await provider.complete({
    system: composerPrompt(profile, facts, allowed, state),
    messages: [
      {
        role: 'user',
        content: correction
          ? `Ta réponse précédente était : « ${correction.draft} »\nElle contient des nombres interdits : ${correction.offending.join(', ')}.\nRéécris-la en ne citant que les nombres autorisés.`
          : 'Rédige la réponse.',
      },
    ],
    maxTokens: Math.ceil(profile.limits.maxReplyChars / 3) + 40,
  })
  return res.text.trim().replace(/^["«»\s]+|["«»\s]+$/g, '')
}

interface TurnResult {
  reply: string
  intent: Intent
  facts: TurnFact[]
  allowedNumbers: number[]
  allowedPhrases: string[]
  phase: string
  cart: unknown[]
  guardrail: 'ok' | 'regenerated' | 'fallback'
  events: string[]
  ms: number
}

async function handleTurn(sessionId: string, text: string): Promise<TurnResult> {
  const started = Date.now()
  const receivedAt = new Date().toISOString()
  const state =
    sessions.get(sessionId) ?? newConversationState(profile.merchantId, sessionId, receivedAt)

  const intent = await classify(text, state)
  const turn = transition({ profile, state, intent, text, receivedAt })

  const guard = (draft: string) =>
    checkReply({
      text: draft,
      allowedNumbers: turn.allowedNumbers,
      allowedPhrases: turn.allowedPhrases,
      maxReplyChars: profile.limits.maxReplyChars,
    })

  let verdict: TurnResult['guardrail'] = 'ok'
  let reply: string
  const first = await compose(turn.facts, turn.allowedNumbers, state)
  const firstCheck = guard(first)
  if (firstCheck.ok) {
    reply = firstCheck.text
  } else {
    verdict = 'regenerated'
    const second = await compose(turn.facts, turn.allowedNumbers, state, {
      draft: first,
      offending: firstCheck.offending,
    })
    const secondCheck = guard(second)
    if (secondCheck.ok) {
      reply = secondCheck.text
    } else {
      verdict = 'fallback'
      reply = truncateToSentence(profile.style.fallbacks[0]!, profile.limits.maxReplyChars)
    }
  }

  sessions.set(sessionId, {
    ...turn.state,
    turns: [...turn.state.turns, { role: 'bot', text: reply, at: receivedAt }].slice(-12),
  })

  return {
    reply,
    intent,
    facts: turn.facts,
    allowedNumbers: turn.allowedNumbers,
    allowedPhrases: turn.allowedPhrases,
    phase: turn.state.phase,
    cart: turn.state.cart,
    guardrail: verdict,
    events: turn.events.map((e) => e.type),
    ms: Date.now() - started,
  }
}

const pagePath = fileURLToPath(new URL('./index.html', import.meta.url))
/** Relu à chaque requête : démo, on itère sur le HTML sans relancer le serveur. */
const page = () => readFileSync(pagePath, 'utf8')

const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page())
    return
  }
  if (req.method === 'GET' && req.url === '/catalogue') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ merchant: profile.displayName, products: activeProducts(profile) }))
    return
  }
  if (req.method === 'POST' && req.url === '/chat') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      void (async () => {
        try {
          const { sessionId, text } = JSON.parse(body) as { sessionId: string; text: string }
          const result = await handleTurn(sessionId, text)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch (error) {
          const down = error instanceof LlmUnavailableError
          res.writeHead(down ? 503 : 500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: String(error) }))
        }
      })()
    })
    return
  }
  if (req.method === 'POST' && req.url === '/reset') {
    sessions.clear()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"ok":true}')
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, () => {
  process.stdout.write(
    `\n  Chat de démo : http://localhost:${PORT}\n  Modèle : ${process.env['LLM_MODEL'] ?? 'qwen2.5:14b-instruct-q4_K_M'}\n  Boutique : ${profile.displayName}\n\n`,
  )
})
