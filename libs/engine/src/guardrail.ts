/**
 * Garde-fou anti-hallucination : rejette toute réponse contenant un nombre non
 * autorisé pour ce tour (prix, quantité, etc.).
 *
 * Limites connues, toutes sans risque pour les prix : soit un faux rejet
 * (coûte une réponse, déclenche `GuardrailTripped`), soit un résidu qui ne
 * porte que sur une quantité. Aucune ne laisse jamais passer un prix inventé.
 *
 * Sens sûr (faux rejet uniquement) :
 * - Les nombres écrits en toutes lettres (« deux mille ») ne sont pas détectés ;
 *   le prompt du composer interdit explicitement cette forme.
 * - Les heures (« 14h30 »), les dates (« 25/09 ») et les numéros de téléphone
 *   groupés (« 97 12 34 56 ») ressortent comme autant de nombres distincts
 *   (14 et 30, 25 et 9, 97, 12, 34, 56) plutôt qu'une seule valeur — chacun
 *   doit être autorisé séparément ou couvert par `allowedPhrases`.
 * - Trois chiffres après une virgule sont lus comme un groupe de milliers
 *   (« 12,555 » → 12555), jamais comme trois décimales — l'ambiguïté avec le
 *   séparateur de milliers ne peut pas être levée sans contexte.
 * - Un libellé autorisé collé à un nombre à droite — directement, via des
 *   espaces, via `.`/`,`, ou via un suffixe `k`/`K` — n'est pas retiré du
 *   texte avant extraction ; ses propres chiffres restent donc vérifiés
 *   (voir `stripPhrases`).
 *
 * Résiduel, pas dans le sens sûr par construction mais sans risque pour les
 * prix (au pire une quantité mal lue, jamais un prix inventé accepté) :
 * - À gauche, `stripPhrases` ne détecte le collage que directement ou via des
 *   espaces, pas via `.`/`,` (ex. « 2.500g » avec le libellé « 500g de gari »
 *   se retire quand même, laissant échapper 2 au lieu de 2500 — une quantité,
 *   jamais un prix). Documenté, non corrigé.
 * - Un simple espace entre deux groupes de chiffres est lu comme un
 *   groupement de milliers à la française (« 100 200 » → 100200, « 1 200 »
 *   → 1200) : c'est la lecture correcte dans une prose normale, pas une
 *   fuite. Le risque résiduel est l'énumération brute, sans mot de liaison,
 *   de plusieurs nombres déjà complets (ex. « 100 000 250 000 » →
 *   100000250000) : le déclencheur est une suite de chiffres suivie d'un
 *   séparateur puis d'exactement trois chiffres, répétable — la forme du
 *   premier groupe n'a pas d'importance. La valeur fusionnée qui en résulte
 *   n'est jamais un montant réel du catalogue, donc jamais présente dans
 *   `allowedNumbers` — elle est rejetée, pas acceptée à tort.
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
const NUMBER_PATTERN = /\d+(?:[    .,]\d{3})*(?:[.,]\d{1,2})?(?:[kK]\b)?(?!\d)/g

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

/**
 * Retire les libellés autorisés (« Riz sac 25 kg ») pour que leurs chiffres ne soient pas
 * testés. Remplace par `\n` (jamais un séparateur, jamais un chiffre) pour ne pas recoller
 * deux nombres voisins. Un libellé n'est retiré que s'il n'est collé à un nombre ni à
 * gauche ni à droite : à droite, directement, à travers des espaces, un séparateur décimal
 * (`.`/`,`), ou un suffixe `k`/`K` ; à gauche, directement ou à travers des espaces
 * seulement. Conséquence volontaire : un nom de produit qui contient des chiffres et qui se
 * trouve à côté d'un prix reste dans le texte, donc ses propres chiffres sont vérifiés et le
 * tour peut être rejeté au lieu d'être laissé passer.
 *
 * Résidu documenté, non corrigé : à gauche, un `.`/`,` collé au libellé n'est pas détecté
 * comme glu (ex. « 2.500g » avec le libellé « 500g de gari » se retire quand même, laissant
 * échapper 2 au lieu de 2500). Porte sur une quantité, jamais sur un prix inventé.
 */
function stripPhrases(text: string, phrases: readonly string[]): string {
  const glue = '[\\s\\u00a0\\u202f\\u2009]*'
  return phrases.reduce(
    (acc, phrase) =>
      acc.replace(
        new RegExp(
          `(?<!\\d${glue})${escapeRegExp(phrase)}(?!${glue}(?:\\d|[.,]\\d|[kK]\\b))`,
          'gi',
        ),
        '\n',
      ),
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
