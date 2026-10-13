import { describe, it, expect } from 'vitest'
import { exportProfile, CATALOGUE_CSV_COLUMNS } from './export'
import { pilotProfile } from '../fixtures/pilot-profile'

describe('exportProfile', () => {
  const out = exportProfile(pilotProfile)
  it('starts with the documented header', () => {
    expect(out.catalogueCsv.split('\n')[0]).toBe(CATALOGUE_CSV_COLUMNS.join(','))
  })
  it('has one row per variant, bulk product and made-to-order product, including inactive', () => {
    const rows = out.catalogueCsv.trim().split('\n').slice(1)
    expect(rows).toHaveLength(6) // robe m, robe l, chaussure 40, gari, tenue, ancien-sac
  })
  it('escapes commas and quotes in fields', () => {
    const profile = {
      ...pilotProfile,
      catalogue: [{ ...pilotProfile.catalogue[0]!, name: 'Robe "wax", rouge' }],
    }
    expect(exportProfile(profile).catalogueCsv).toContain('"Robe ""wax"", rouge"')
  })
  it('escapes a carriage return in a field', () => {
    const profile = {
      ...pilotProfile,
      catalogue: [{ ...pilotProfile.catalogue[0]!, name: 'Robe\rrouge' }],
    }
    expect(exportProfile(profile).catalogueCsv).toContain('"Robe\rrouge"')
  })
  it.each(['=HYPERLINK("http://x","clic")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd'])(
    'neutralises a product name that starts like a formula: %s',
    (name) => {
      const profile = {
        ...pilotProfile,
        catalogue: [{ ...pilotProfile.catalogue[0]!, name }],
      }
      const row = exportProfile(profile).catalogueCsv.split('\n')[1]!
      const nameCell = row.split(',')[1]!
      expect(nameCell.replace(/^"/, '').startsWith("'")).toBe(true)
    },
  )
  it('neutralises a formula even when the cell also needs quoting', () => {
    const profile = {
      ...pilotProfile,
      catalogue: [{ ...pilotProfile.catalogue[0]!, name: '=HYPERLINK("u")' }],
    }
    expect(exportProfile(profile).catalogueCsv).toContain(`"'=HYPERLINK(""u"")"`)
  })
  it('profileJson round-trips', () => {
    expect(JSON.parse(out.profileJson)).toEqual(pilotProfile)
  })
  it('matches snapshot', () => {
    expect(out.catalogueCsv).toMatchSnapshot()
  })
})
