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
