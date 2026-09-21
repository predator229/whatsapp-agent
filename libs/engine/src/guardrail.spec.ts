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
    ['2,5 kg de gari', [2.5]],
    ['2.5 kg de gari', [2.5]],
    ['je te fais 1.5k', [1500]],
    ['12.000 F', [12000]],
    ['0,5 kg', [0.5]],
    ['la robe est à 12 000', [12000]],
    ['5000 7000 9000', [5000, 7000, 9000]],
    ['1 2000F', [1, 2000]],
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

  it('accepts a fractional bulk quantity', () => {
    const result = checkReply({
      allowedNumbers: [2.5, 600, 1500],
      maxReplyChars: 320,
      text: '2,5 kg de gari à 600F le kg, ça fait 1500F.',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a number that would otherwise merge with its neighbour', () => {
    const result = checkReply({
      allowedNumbers: [1200, 0],
      maxReplyChars: 320,
      text: 'Je te fais 1 2000F, cadeau inclus.',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.offending).toContain(2000)
    }
  })
})
