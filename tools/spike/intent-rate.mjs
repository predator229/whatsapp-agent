// JETABLE — mesure le taux de JSON valide et la précision d'intention d'un modèle Ollama.
// Round 2 : prompt système réaliste (définitions + règles) et few-shot, précision mesurée
// automatiquement contre l'intention attendue de chaque message (messages.json: [{ text, expected }]).
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

const system = `Tu classes le message d'un client d'une boutique béninoise. Réponds UNIQUEMENT en JSON, conforme au schéma fourni.
Produits (productId | nom | alias): ${catalogue.map(p => `${p.productId} | ${p.name} | ${p.aliases.join(', ')}`).join('\n')}

Définitions des intentions (choisis-en une seule) :
- greet : salutation ou small talk, sans aucun contenu produit ("bonsoir", "bien arrivée ?", "ça va ?").
- browse : le client veut voir ce qui est disponible sans viser un produit précis (photos, catalogue général, "montre-moi ce que tu as").
- ask_product : demande si un produit précis de la liste existe/est disponible (taille, couleur, stock), sans en demander le prix.
- ask_price : demande le prix d'un produit, sans proposer de chiffre lui-même.
- negotiate : le client propose ou demande un prix plus bas — n'importe quel chiffre inférieur au prix attendu, ou une formule comme "fais un prix", "dernier prix", "trop cher", "baisse un peu".
- add_to_cart : le client dit explicitement qu'il prend/commande/veut N d'un produit précis, comme décision d'achat — pas une simple question sur ce produit.
- remove_from_cart : le client retire un produit déjà pris de sa commande en cours.
- give_address : le client donne un lieu, un quartier ou un point de repère pour la livraison.
- confirm_order : le client valide/finalise une commande déjà discutée ("je confirme", "c'est bon, envoie", "je valide tout").
- cancel : le client annule sa commande ou abandonne l'achat en cours.
- off_topic : le produit demandé n'est pas dans la liste ci-dessus, ou le sujet n'a rien à voir avec la boutique (dans ce spike, les horaires d'ouverture sont off_topic).
- unclear : aucune des intentions ci-dessus ne correspond clairement au message.

Règles strictes :
- productRefs ne doit contenir que des productId listés ci-dessus, jamais un produit inventé ou absent de la liste.
- quantity ne doit être renseigné que si le client l'indique explicitement.
- counterOffer ne doit être renseigné que si le client énonce lui-même un chiffre de prix.
- N'invente jamais une adresse : le champ address doit rester absent si le client n'en a pas donné une.`

// Few-shot : paires user/assistant précédant le message à classer (pas dans le system prompt).
// Phrases différentes de celles de messages.json.
const fewShot = [
  { role: 'user', content: "Le sac de riz c'est cher pour moi, je peux mettre 8000 ?" },
  { role: 'assistant', content: JSON.stringify({ intent: 'negotiate', productRefs: [{ productId: 'riz-25kg', quantity: 1 }], counterOffer: 8000 }) },
  { role: 'user', content: 'Je prends deux paires de chaussures noires, mets-les de côté' },
  { role: 'assistant', content: JSON.stringify({ intent: 'add_to_cart', productRefs: [{ productId: 'chaussure-noire', quantity: 2 }] }) },
  { role: 'user', content: 'Ma maison est à Cotonou, quartier Zongo, juste après le grand marché' },
  { role: 'assistant', content: JSON.stringify({ intent: 'give_address', productRefs: [], address: 'Cotonou, quartier Zongo, juste après le grand marché' }) },
  { role: 'user', content: "C'est bon pour moi, tu peux valider la commande" },
  { role: 'assistant', content: JSON.stringify({ intent: 'confirm_order', productRefs: [] }) },
  { role: 'user', content: "Salut, comment tu vas aujourd'hui ?" },
  { role: 'assistant', content: JSON.stringify({ intent: 'greet', productRefs: [] }) },
  { role: 'user', content: 'Vous vendez des ordinateurs portables ?' },
  { role: 'assistant', content: JSON.stringify({ intent: 'off_topic', productRefs: [] }) },
  { role: 'user', content: "Le prix de la tenue sur mesure c'est combien ?" },
  { role: 'assistant', content: JSON.stringify({ intent: 'ask_price', productRefs: [{ productId: 'tenue-mesure' }] }) },
  { role: 'user', content: 'En fait je ne veux plus rien, oublie ma commande' },
  { role: 'assistant', content: JSON.stringify({ intent: 'cancel', productRefs: [] }) },
]

async function classify(text) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, stream: false, format: schema, options: { temperature: 0 },
      messages: [{ role: 'system', content: system }, ...fewShot, { role: 'user', content: text }] }),
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

// Erreur "dangereuse" : le modèle mute un panier / invente une donnée sans base dans le message.
function isDangerous(expected, parsed) {
  const falseAddToCart = parsed.intent === 'add_to_cart' && expected !== 'add_to_cart'
  const falseConfirmOrder = parsed.intent === 'confirm_order' && expected !== 'confirm_order'
  const inventedAddress = !!parsed.address && expected !== 'give_address'
  const inventedCounterOffer = parsed.counterOffer !== undefined && expected !== 'negotiate'
  return falseAddToCart || falseConfirmOrder || inventedAddress || inventedCounterOffer
}

const results = []
for (const { text, expected } of messages) {
  const r = await classify(text)
  const correct = r.ok && r.parsed.intent === expected
  const dangerous = r.ok && isDangerous(expected, r.parsed)
  results.push({ text, expected, ...r, correct, dangerous })
  const got = r.ok ? r.parsed.intent : r.error
  const flag = !r.ok ? '' : correct ? 'OK' : dangerous ? 'WRONG+DANGEROUS' : 'WRONG'
  console.log(r.ok ? 'OK ' : 'BAD', `${r.ms}ms`, text.slice(0, 45), `expected=${expected} got=${got}`, flag)
}
const ok = results.filter(r => r.ok).length
const correctCount = results.filter(r => r.correct).length
const dangerousCount = results.filter(r => r.dangerous).length
const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)
console.log(`\nMODEL=${MODEL} valid=${ok}/${results.length} correct=${correctCount}/${results.length} (${Math.round(100 * correctCount / results.length)}%) dangerous=${dangerousCount} avg=${avgMs}ms`)
writeFileSync(new URL('./last-run.json', import.meta.url), JSON.stringify({ MODEL, ok, correct: correctCount, dangerous: dangerousCount, total: results.length, avgMs, results }, null, 2))
