import { describe, expect, it } from 'vitest'
import { pilotProfile, type MerchantProfile } from '@wa/domain'
import { findZone } from './handlers/shared'

const withZones = (names: string[]): MerchantProfile => ({
  ...pilotProfile,
  delivery: {
    ...pilotProfile.delivery,
    zones: names.map((name, i) => ({ name, fee: 1000 + i * 500, delayHours: 24 })),
  },
})

describe('findZone', () => {
  it('reads a single zone from a free-form address', () => {
    expect(findZone(pilotProfile, 'Fidjrossè, à cotonou')?.name).toBe('Cotonou')
  })

  it('refuses to pick the cheapest zone when several are cited', () => {
    const address = 'Porto-Novo, quartier Ouando, en venant de Cotonou'
    expect(findZone(pilotProfile, address)).toBeUndefined()
  })

  it('prefers an exact zone name', () => {
    expect(findZone(withZones(['Abomey-Calavi', 'Calavi']), 'calavi')?.name).toBe('Calavi')
  })

  it('keeps the longest name when one zone name contains another', () => {
    const profile = withZones(['Calavi', 'Abomey-Calavi'])
    expect(findZone(profile, 'je suis à Abomey-Calavi')?.name).toBe('Abomey-Calavi')
  })

  it('returns nothing for an unknown place or an empty candidate', () => {
    expect(findZone(pilotProfile, 'Parakou')).toBeUndefined()
    expect(findZone(pilotProfile, undefined)).toBeUndefined()
  })
})
