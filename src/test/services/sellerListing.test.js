import { describe, it, expect } from 'vitest'
import {
  validateListingEdit,
  normalizeListingRow,
  indexListingsByProject,
  SELLER_LISTING_STATUSES,
} from '@/services/sellerListingService'

describe('validateListingEdit', () => {
  const base = { pricePerCredit: 500, quantity: 10, status: 'active', creditsAvailable: 100 }

  it('accepts a well-formed edit', () => {
    expect(validateListingEdit(base)).toEqual({ valid: true, error: null })
  })

  it('rejects a zero or negative price', () => {
    expect(validateListingEdit({ ...base, pricePerCredit: 0 }).valid).toBe(false)
    expect(validateListingEdit({ ...base, pricePerCredit: -5 }).valid).toBe(false)
  })

  it('rejects a non-numeric price', () => {
    expect(validateListingEdit({ ...base, pricePerCredit: 'free' }).valid).toBe(false)
    expect(validateListingEdit({ ...base, pricePerCredit: undefined }).valid).toBe(false)
  })

  it('rejects a negative quantity', () => {
    expect(validateListingEdit({ ...base, quantity: -1 }).valid).toBe(false)
  })

  it('allows listing zero credits (holding all inventory back)', () => {
    expect(validateListingEdit({ ...base, quantity: 0 }).valid).toBe(true)
  })

  it('rejects a quantity above the pool ceiling — the oversell guard', () => {
    const result = validateListingEdit({ ...base, quantity: 101, creditsAvailable: 100 })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/100/)
  })

  it('allows a quantity exactly at the ceiling', () => {
    expect(validateListingEdit({ ...base, quantity: 100, creditsAvailable: 100 }).valid).toBe(true)
  })

  it('treats a missing ceiling as zero rather than unlimited', () => {
    expect(validateListingEdit({ pricePerCredit: 10, quantity: 1 }).valid).toBe(false)
  })

  it('rejects a status the seller may not set', () => {
    expect(validateListingEdit({ ...base, status: 'sold' }).valid).toBe(false)
    expect(validateListingEdit({ ...base, status: 'deleted' }).valid).toBe(false)
  })

  it('accepts every seller-settable status', () => {
    for (const status of SELLER_LISTING_STATUSES) {
      expect(validateListingEdit({ ...base, status }).valid).toBe(true)
    }
  })

  it('accepts numeric strings from form inputs', () => {
    expect(validateListingEdit({ ...base, pricePerCredit: '500', quantity: '10' }).valid).toBe(true)
  })
})

describe('normalizeListingRow', () => {
  const row = {
    id: 'l1',
    status: 'active',
    quantity: 40,
    price_per_credit: 250.5,
    currency: 'PHP',
    project_credits: {
      id: 'pc1',
      project_id: 'p1',
      credits_available: 40,
      projects: { id: 'p1', title: 'Mangrove Restoration' },
    },
  }

  it('flattens the joined row', () => {
    expect(normalizeListingRow(row)).toEqual({
      id: 'l1',
      projectId: 'p1',
      projectTitle: 'Mangrove Restoration',
      status: 'active',
      pricePerCredit: 250.5,
      quantity: 40,
      currency: 'PHP',
      creditsAvailable: 40,
    })
  })

  it('returns null when there is no resolvable project', () => {
    expect(normalizeListingRow({ id: 'l1', project_credits: null })).toBeNull()
    expect(normalizeListingRow({ id: 'l1', project_credits: { projects: null } })).toBeNull()
    expect(normalizeListingRow(null)).toBeNull()
    expect(normalizeListingRow({})).toBeNull()
  })

  it('falls back to the nested project id when project_id is absent', () => {
    const r = normalizeListingRow({
      ...row,
      project_credits: { ...row.project_credits, project_id: null },
    })
    expect(r.projectId).toBe('p1')
  })

  it('defaults missing numbers to 0 and missing title to a placeholder', () => {
    const r = normalizeListingRow({
      id: 'l2',
      project_credits: { project_id: 'p2', projects: { id: 'p2' } },
    })
    expect(r.pricePerCredit).toBe(0)
    expect(r.quantity).toBe(0)
    expect(r.creditsAvailable).toBe(0)
    expect(r.currency).toBe('PHP')
    expect(r.status).toBe('active')
    expect(r.projectTitle).toBe('Untitled Project')
  })
})

describe('indexListingsByProject', () => {
  const make = (over) => ({
    id: 'x',
    projectId: 'p1',
    projectTitle: 'T',
    status: 'active',
    pricePerCredit: 1,
    quantity: 1,
    currency: 'PHP',
    creditsAvailable: 1,
    ...over,
  })

  it('returns an empty map for no listings', () => {
    expect(indexListingsByProject([])).toEqual({})
    expect(indexListingsByProject()).toEqual({})
  })

  it('keys one listing per project', () => {
    const index = indexListingsByProject([make({ id: 'a' }), make({ id: 'b', projectId: 'p2' })])
    expect(index.p1.id).toBe('a')
    expect(index.p2.id).toBe('b')
  })

  it('prefers the active listing when a project has both', () => {
    const index = indexListingsByProject([
      make({ id: 'paused', status: 'paused', quantity: 999 }),
      make({ id: 'active', status: 'active', quantity: 1 }),
    ])
    expect(index.p1.id).toBe('active')
  })

  it('keeps the active listing even when the paused one comes second', () => {
    const index = indexListingsByProject([
      make({ id: 'active', status: 'active', quantity: 1 }),
      make({ id: 'paused', status: 'paused', quantity: 999 }),
    ])
    expect(index.p1.id).toBe('active')
  })

  it('falls back to the largest quantity when statuses match', () => {
    const index = indexListingsByProject([
      make({ id: 'small', quantity: 5 }),
      make({ id: 'big', quantity: 50 }),
    ])
    expect(index.p1.id).toBe('big')
  })

  it('skips rows with no project id', () => {
    expect(indexListingsByProject([make({ projectId: null })])).toEqual({})
  })
})
