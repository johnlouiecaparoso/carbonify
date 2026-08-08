import { describe, it, expect } from 'vitest'
import {
  buildImpactDisclosure,
  disclosureNotes,
  impactFilename,
  splitClaims,
} from '@/services/developerImpactService'
import { aggregateAssetLedger } from '@/services/assetLedgerService'

/**
 * The developer impact disclosure.
 *
 * The assertion that matters most is the double-counting one: a developer must
 * not be handed a document that lets them claim tonnes a buyer has already
 * retired. Everything else here is bookkeeping around that.
 *
 * The dataset is built from `aggregateAssetLedger` rather than from hand-written
 * rows wherever possible, so this file fails if the ledger's field names drift —
 * which is the realistic way this export would silently start reporting zeroes.
 */

describe('splitClaims — who is entitled to the tonnes', () => {
  it('separates retired, sold-not-retired and unsold', () => {
    const claims = splitClaims({ issued: 100, sold: 60, retired: 25, inventory: 40 })
    expect(claims).toEqual({
      issued: 100,
      retired: 25,
      soldUnretired: 35,
      unsold: 40,
      claimableByDeveloper: 40,
    })
  })

  it('never lets the developer claim what a buyer retired', () => {
    // The whole point of the document. If issued is 100 and buyers retired 100,
    // the developer's claimable volume is whatever is unsold — here, nothing.
    const claims = splitClaims({ issued: 100, sold: 100, retired: 100, inventory: 0 })
    expect(claims.claimableByDeveloper).toBe(0)
    expect(claims.retired).toBe(100)
  })

  it('clamps sold-not-retired at zero rather than printing a negative tonnage', () => {
    // `sold` and `retired` come from different tables, so retirements of credits
    // bought before the sale was recorded here can exceed sales. A disclosure
    // showing "-15 tCO2e" would be read as an error in the platform.
    expect(splitClaims({ sold: 10, retired: 25 }).soldUnretired).toBe(0)
  })

  it('treats missing volumes as zero, not NaN', () => {
    expect(splitClaims({})).toEqual({
      issued: 0,
      retired: 0,
      soldUnretired: 0,
      unsold: 0,
      claimableByDeveloper: 0,
    })
  })
})

describe('buildImpactDisclosure', () => {
  const ledger = aggregateAssetLedger({
    projects: [
      {
        id: 'p1',
        title: 'Bohol Biochar',
        status: 'validated',
        category: 'Biochar',
        methodology: 'Puro.earth',
        location: 'Bohol',
        development_status: 'operational',
        estimated_credits: 500,
      },
      { id: 'p2', title: 'Unsubmitted idea', status: 'draft', estimated_credits: 100 },
    ],
    pools: [{ project_id: 'p1', total_credits: 300, credits_available: 120, price_per_credit: 500 }],
    sales: [
      { project_id: 'p1', quantity: 180, total_amount: 90000, status: 'completed', buyer_id: 'b1' },
    ],
    retirements: [{ project_id: 'p1', quantity: 50 }],
  })

  it('carries the registry descriptors through from the ledger', () => {
    const { rows } = buildImpactDisclosure(ledger)
    expect(rows[0]).toMatchObject({
      project: 'Bohol Biochar',
      category: 'Biochar',
      methodology: 'Puro.earth',
      location: 'Bohol',
      development_status: 'operational',
      registry_status: 'validated',
    })
  })

  it('reports the four volumes for a real ledger row', () => {
    const { rows } = buildImpactDisclosure(ledger)
    expect(rows[0]).toMatchObject({
      issued_tco2e: 300,
      retired_tco2e: 50,
      sold_unretired_tco2e: 130,
      unsold_tco2e: 120,
      claimable_tco2e: 120,
    })
  })

  it('excludes drafts, which have no verified volume to disclose', () => {
    const { rows, totals } = buildImpactDisclosure(ledger)
    expect(rows.map((r) => r.project)).not.toContain('Unsubmitted idea')
    expect(totals.projects).toBe(1)
  })

  it('keeps a validated project whose credits are still pending verification', () => {
    const pendingOnly = aggregateAssetLedger({
      projects: [{ id: 'p9', title: 'Awaiting VER', status: 'validated' }],
      vers: [{ project_id: 'p9', approved_quantity: 40, status: 'pending' }],
    })
    const { rows } = buildImpactDisclosure(pendingOnly)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ issued_tco2e: 0, pending_tco2e: 40 })
  })

  it('totals every column across projects', () => {
    const { totals } = buildImpactDisclosure(ledger)
    expect(totals).toMatchObject({
      projects: 1,
      issued: 300,
      retired: 50,
      soldUnretired: 130,
      unsold: 120,
      claimable: 120,
    })
  })

  it('returns an empty disclosure rather than throwing on no projects', () => {
    const { rows, totals } = buildImpactDisclosure({})
    expect(rows).toEqual([])
    expect(totals.projects).toBe(0)
  })
})

describe('disclosureNotes', () => {
  it('states in words that retired tonnes belong to the buyer', () => {
    const notes = disclosureNotes({ issued: 300, retired: 50, soldUnretired: 130, claimable: 120 })
    const text = notes.join(' ')
    expect(text).toMatch(/claimed by them, not by the project developer/)
    expect(text).toMatch(/120 tCO2e remain unsold and are the only volume the developer may claim/)
  })

  it('repeats the registry-backing limit, because the file outlives the screen', () => {
    expect(disclosureNotes({}).join(' ')).toMatch(/not yet backed by an external registry/)
  })
})

describe('impactFilename', () => {
  it('is dated so successive exports do not collide', () => {
    expect(impactFilename(new Date('2026-08-08T09:00:00Z'))).toBe(
      'carbonify-impact-disclosure-2026-08-08.csv',
    )
  })
})
