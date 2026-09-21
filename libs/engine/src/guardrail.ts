/**
 * Garde-fou anti-hallucination : rejette toute réponse contenant un nombre non
 * autorisé pour ce tour (prix, quantité, etc.).
 *
 * Limites connues, assumées volontairement, toutes dans le sens sûr — un
 * faux rejet coûte une réponse et déclenche `GuardrailTripped`, jamais il ne
 * laisse passer un prix inventé :
 * - Les nombres écrits en toutes lettres (« deux mille ») ne sont pas détectés ;
 *   le prompt du composer interdit explicitement cette forme.
 * - Les heures (« 14h30 »), les dates (« 25/09 ») et les numéros de téléphone
 *   groupés (« 97 12 34 56 ») ressortent comme autant de nombres distincts
 *   (14 et 30, 25 et 9, 97, 12, 34, 56) plutôt qu'une seule valeur — chacun
 *   doit être autorisé séparément ou couvert par `allowedPhrases`.
 */
export interface GuardrailInput {
  readonly text: string
  readonly allowedNumbers: readonly number[]
  readonly allowedPhrases?: readonly string[]
  readonly maxReplyChars: number
}

export type GuardrailResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly offending: readonly number[] }

/** Espaces utilisées comme séparateur de milliers en français. Jamais décimales. */
const THOUSAND_SPACES = /[    ]/g
const NUMBER_PATTERN = /\d+(?:[    .,]\d{3})*(?:[.,]\d{1,2})?(?:[kK]\b)?/g

/**
 * Un séparateur suivi d'exactement trois chiffres est un groupe de milliers ;
 * un `.` ou `,` suivi d'un ou deux chiffres en fin de nombre est une fraction
 * décimale (ex. quantité en kg d'un produit vendu en vrac).
 */
function toNumber(raw: string): number {
  const isThousands = /[kK]$/.test(raw)
  const body = raw.replace(/[kK]$/, '').replace(THOUSAND_SPACES, '')
  const decimal = body.match(/[.,](\d{1,2})$/)
  const intPart = (decimal ? body.slice(0, -decimal[0].length) : body).replace(/[.,]/g, '')
  const value = Number(decimal ? `${intPart}.${decimal[1]}` : intPart)
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
