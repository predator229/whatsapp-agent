/**
 * Nombres français écrits en toutes lettres (« deux mille cinq cents », « quatre-vingt-dix »).
 * Le composer a pour consigne d'écrire en chiffres ; ce module ferme la porte quand il ne
 * le fait pas : un nombre en lettres non détecté serait une ACCEPTATION, pas un faux rejet.
 */

const UNITS: Readonly<Record<string, number>> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
}

const HUNDRED = new Set(['cent', 'cents'])
const SCALES: Readonly<Record<string, number>> = {
  mille: 1000,
  million: 1_000_000,
  millions: 1_000_000,
}

/**
 * « neuf » seul est le plus souvent l'adjectif (« tout neuf ») : on ne le lit comme nombre
 * que s'il compose avec un autre mot-nombre (« neuf mille »). Résidu assumé : « neuf robes »
 * en lettres passe (une quantité, jamais un prix, qui s'écrit avec « cent »/« mille »).
 */
const AMBIGUOUS_ALONE = new Set(['neuf'])

/** « et » ne lie qu'une dizaine à « un »/« onze » : « vingt et un », « soixante et onze ». */
const TENS_LINKED_BY_ET = new Set(['vingt', 'trente', 'quarante', 'cinquante', 'soixante'])
const LINKED_AFTER_ET = new Set(['un', 'une', 'onze'])

function isNumberWord(token: string): boolean {
  return Object.hasOwn(UNITS, token) || HUNDRED.has(token) || Object.hasOwn(SCALES, token)
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Valeur d'une suite de mots-nombres consécutifs, lue de gauche à droite. */
function valueOf(run: readonly string[]): number {
  const { total, current } = run.reduce(
    (acc, token, i) => {
      if (HUNDRED.has(token)) return { ...acc, current: (acc.current || 1) * 100 }
      const scale = SCALES[token]
      if (scale !== undefined) return { total: acc.total + (acc.current || 1) * scale, current: 0 }
      // Seuls des mots-nombres arrivent ici : ni cent ni échelle, donc une unité.
      const unit = UNITS[token]!
      // « quatre-vingt(s) » = 4 × 20 : on retire le 4 déjà compté.
      const fourScore = unit === 20 && run[i - 1] === 'quatre'
      return { ...acc, current: fourScore ? acc.current - 4 + 80 : acc.current + unit }
    },
    { total: 0, current: 0 },
  )
  return total + current
}

/** Découpe le texte en suites de mots-nombres consécutifs. */
function numberRuns(tokens: readonly string[]): string[][] {
  return tokens
    .reduce<string[][]>(
      (runs, token, i) => {
        const last = runs[runs.length - 1]!
        const linking =
          token === 'et' &&
          TENS_LINKED_BY_ET.has(last[last.length - 1] ?? '') &&
          LINKED_AFTER_ET.has(tokens[i + 1] ?? '')
        if (linking) return runs
        if (!isNumberWord(token)) return last.length > 0 ? [...runs, []] : runs
        // « pour cent » est un pourcentage déjà porté par le nombre qui précède.
        if (HUNDRED.has(token) && tokens[i - 1] === 'pour') return runs
        return [...runs.slice(0, -1), [...last, token]]
      },
      [[]],
    )
    .filter((run) => run.length > 0)
    .filter((run) => !(run.length === 1 && AMBIGUOUS_ALONE.has(run.join(''))))
}

/** Tous les nombres écrits en lettres dans le texte, dans l'ordre d'apparition. */
export function extractWordNumbers(text: string): number[] {
  const tokens = normalize(text)
    .split(/[^a-z]+/)
    .filter(Boolean)
  return numberRuns(tokens).map(valueOf)
}
