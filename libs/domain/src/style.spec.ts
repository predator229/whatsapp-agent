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
