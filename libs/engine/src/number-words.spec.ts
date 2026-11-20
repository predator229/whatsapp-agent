import { describe, expect, it } from 'vitest'
import { extractWordNumbers } from './number-words'
import { checkReply } from './guardrail'

describe('extractWordNumbers', () => {
  it.each([
    ['deux mille francs', [2000]],
    ['Deux mille cinq cents XOF', [2500]],
    ['trois cent cinquante', [350]],
    ['dix-sept mille', [17000]],
    ['soixante-dix', [70]],
    ['soixante et onze', [71]],
    ['vingt et un', [21]],
    ['quatre-vingts', [80]],
    ['quatre-vingt-dix-neuf', [99]],
    ['deux cent mille', [200000]],
    ['un million deux cent mille', [1200000]],
    ['mille', [1000]],
    ['zéro', [0]],
    ['cent francs', [100]],
    ['trente et', [30]],
  ])('reads « %s »', (text, expected) => {
    expect(extractWordNumbers(text)).toEqual(expected)
  })

  it('keeps separate numbers apart', () => {
    expect(extractWordNumbers('deux robes et trois pagnes')).toEqual([2, 3])
  })

  it('ignores words that merely contain a number word', () => {
    expect(extractWordNumbers('en septembre au centre, constructor')).toEqual([])
  })

  it('reads « pour cent » as a percent sign, not as 100', () => {
    expect(extractWordNumbers('cinquante pour cent')).toEqual([50])
  })

  it('reads « neuf » only when it composes a number', () => {
    expect(extractWordNumbers('elle est toute neuve, tout neuf')).toEqual([])
    expect(extractWordNumbers('neuf mille')).toEqual([9000])
  })
})

describe('checkReply — numbers in words and forbidden phrases', () => {
  const base = { allowedNumbers: [0, 1, 2500], maxReplyChars: 320 }

  it('rejects a price written in words that is not allowed', () => {
    const text = 'Pour toi ce sera deux mille francs.'
    expect(checkReply({ ...base, text })).toEqual({ ok: false, offending: [2000] })
  })

  it('accepts an allowed price written in words', () => {
    const text = 'Livraison à deux mille cinq cents.'
    expect(checkReply({ ...base, text })).toEqual({ ok: true, text })
  })

  it('rejects a forbidden promise even without any number', () => {
    const text = 'La livraison est gratuite pour toi !'
    expect(
      checkReply({ ...base, text, forbiddenPhrases: ['gratuit', 'gratuite', 'offert'] }),
    ).toEqual({ ok: false, offending: [], forbidden: ['gratuite'] })
  })

  it('matches forbidden phrases as whole words, accents and case ignored', () => {
    const forbiddenPhrases = ['offert', 'remboursé']
    expect(checkReply({ ...base, text: 'OFFERT !', forbiddenPhrases })).toMatchObject({
      ok: false,
      forbidden: ['offert'],
    })
    expect(checkReply({ ...base, text: 'Rembourse', forbiddenPhrases })).toMatchObject({
      forbidden: ['remboursé'],
    })
    expect(checkReply({ ...base, text: 'Elle est offerte', forbiddenPhrases })).toMatchObject({
      ok: true,
    })
  })
})
