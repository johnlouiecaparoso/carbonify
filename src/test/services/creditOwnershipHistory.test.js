import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { creditOwnershipService } from '@/services/creditOwnershipService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * Regression guard for DEFERRED_BACKLOG #11.
 *
 * `getUserTransactionHistory` fetched `limit` purchases and `limit` retirements,
 * merged them, sorted newest-first, then `.slice(0, limit)` the COMBINED list.
 * When a user's purchases were all newer than their retirements, the purchases
 * filled the whole slice and every retirement was dropped.
 *
 * That is not a cosmetic list-length problem. The only caller is
 * `esgReportService.buildEsgDataset`, which derives `retiredCredits`,
 * `retiredTco2e` and the by-project / by-category groupings from precisely
 * these retirement rows — so the ESG report a buyer exports as evidence of
 * their offsetting silently under-reported the one number it exists to state.
 * Nothing errored and nothing looked missing.
 *
 * The suite could not see it: `esgReportService.test.js` injects a fake service,
 * so the real function under test here was never executed.
 */

const PURCHASE_SELECT = `credit_purchases`
const RETIREMENT_SELECT = `credit_retirements`

/** Minimal thenable matching the real chain: .select().eq().order().limit() */
function tableReturning(rows) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain
}

function clientWith({ purchases, retirements }) {
  return {
    from: (table) => {
      if (table === PURCHASE_SELECT) return tableReturning(purchases)
      if (table === RETIREMENT_SELECT) return tableReturning(retirements)
      throw new Error(`unexpected table ${table}`)
    },
  }
}

/** N purchases in 2026-07, i.e. all NEWER than the retirements below. */
function purchasesNewerThanRetirements(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    credits_amount: 1,
    total_amount: 100,
    currency: 'PHP',
    status: 'completed',
    created_at: `2026-07-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    projects: { id: 'proj', title: 'Solar B', category: 'Renewable', location: 'PH' },
  }))
}

const OLDER_RETIREMENTS = [
  {
    id: 'r1',
    quantity: 3,
    retired_at: '2026-06-01T00:00:00Z',
    projects: { id: 'proj', title: 'Solar B', category: 'Renewable', location: 'PH' },
  },
  {
    id: 'r2',
    quantity: 5,
    retired_at: '2026-06-02T00:00:00Z',
    projects: { id: 'proj2', title: 'Mangrove A', category: 'Blue Carbon', location: 'PH' },
  },
]

describe('creditOwnershipService.getUserTransactionHistory', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('keeps retirements even when the limit is filled by newer purchases', async () => {
    const limit = 50
    vi.mocked(getSupabase).mockReturnValue(
      clientWith({
        purchases: purchasesNewerThanRetirements(limit),
        retirements: OLDER_RETIREMENTS,
      }),
    )

    const history = await creditOwnershipService.getUserTransactionHistory('user-1', limit)
    const retirements = history.filter((t) => t.type === 'retirement')

    // The bug: sliced to 50, all of which were purchases -> zero retirements.
    expect(retirements).toHaveLength(2)
    expect(retirements.map((r) => r.quantity).sort()).toEqual([3, 5])
  })

  it('preserves the retired totals an ESG report is built from', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWith({
        purchases: purchasesNewerThanRetirements(50),
        retirements: OLDER_RETIREMENTS,
      }),
    )

    const history = await creditOwnershipService.getUserTransactionHistory('user-1', 50)
    const retiredCredits = history
      .filter((t) => t.type === 'retirement')
      .reduce((n, t) => n + t.quantity, 0)

    // buildEsgDataset reports this as retiredCredits / retiredTco2e.
    expect(retiredCredits).toBe(8)
  })

  it('still sorts the combined history newest-first', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWith({
        purchases: [
          {
            id: 'p-old',
            credits_amount: 1,
            created_at: '2026-05-01T00:00:00Z',
            projects: { title: 'Solar B', category: 'Renewable', location: 'PH' },
          },
        ],
        retirements: OLDER_RETIREMENTS,
      }),
    )

    const history = await creditOwnershipService.getUserTransactionHistory('user-1', 50)
    const dates = history.map((t) => new Date(t.created_at).getTime())

    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    expect(history[0].id).toBe('r2') // 2026-06-02, the newest of the three
  })

  it('caps each type independently, so one type cannot crowd out the other', async () => {
    // 50 of each requested; both types must survive in full.
    vi.mocked(getSupabase).mockReturnValue(
      clientWith({
        purchases: purchasesNewerThanRetirements(50),
        retirements: OLDER_RETIREMENTS,
      }),
    )

    const history = await creditOwnershipService.getUserTransactionHistory('user-1', 50)

    expect(history.filter((t) => t.type === 'purchase')).toHaveLength(50)
    expect(history.filter((t) => t.type === 'retirement')).toHaveLength(2)
    expect(history).toHaveLength(52)
  })
})
