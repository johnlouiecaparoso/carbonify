import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import {
  getPurchaseAndRetirementHistory,
  getUserRetirementHistory,
} from '@/services/transactionHistoryService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * The `[]`-as-a-fact-about-the-user class, in the last two reads that still had
 * it — and on the screen where it is worst.
 *
 * `getUserRetirementHistory` is what RetireView renders. It is a thin wrapper
 * over `getPurchaseAndRetirementHistory`, which used to:
 *
 *   1. log the retirements error and CONTINUE, leaving `retirements` undefined,
 *      which mapped to [] — "you have retired nothing";
 *   2. log the purchases error, set an unused `purchaseError`, and continue with
 *      `purchases` still [] — "you have bought nothing";
 *   3. catch anything that did escape and return
 *      `{ purchases: [], retirements: [], all: [] }` — re-swallowing both.
 *
 * So a user who had retired credits was told, on the retirement screen, that
 * they had retired none. RetireView already had the catch that surfaces this;
 * like every other instance of this class in the repo, it was dead code.
 *
 * These assert on REJECTION, because the shape of a successful-looking empty
 * result is exactly what the bug produced.
 */

const DB_DOWN = { message: 'connection terminated unexpectedly', code: '08006' }

/** Chain for credit_transactions: .select().eq().eq().order() */
function purchasesTable(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
  }
  return chain
}

/** Chain for credit_retirements: .select().eq().order() */
function retirementsTable(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
  }
  return chain
}

/** Certificates are non-critical enrichment; always answer empty. */
function certificatesTable() {
  const chain = {
    select: () => chain,
    in: () => Promise.resolve({ data: [], error: null }),
    or: () => Promise.resolve({ data: [], error: null }),
    eq: () => chain,
  }
  return chain
}

const OK = { data: [], error: null }

function clientWhere({ purchases = OK, retirements = OK } = {}) {
  return {
    from: (table) => {
      if (table === 'credit_transactions') return purchasesTable(purchases)
      if (table === 'credit_retirements') return retirementsTable(retirements)
      if (table === 'certificates') return certificatesTable()
      throw new Error(`unexpected table ${table}`)
    },
  }
}

describe('a failed history read must not read as an empty history', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('rejects when the RETIREMENTS query fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWhere({ retirements: { data: null, error: DB_DOWN } }),
    )

    await expect(getPurchaseAndRetirementHistory('user-1')).rejects.toThrow()
  })

  it('rejects when the PURCHASES query fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWhere({ purchases: { data: null, error: DB_DOWN } }),
    )

    await expect(getPurchaseAndRetirementHistory('user-1')).rejects.toThrow()
  })

  it('getUserRetirementHistory rejects rather than telling RetireView "nothing retired"', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWhere({ retirements: { data: null, error: DB_DOWN } }),
    )

    // This is the assertion that matters. The wrapper is what RetireView calls,
    // and returning [] here is indistinguishable from a user who has genuinely
    // retired nothing.
    await expect(getUserRetirementHistory('user-1')).rejects.toThrow()
  })

  it('still resolves normally when both reads succeed and are genuinely empty', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientWhere())

    // The counter-example, so this cannot degrade into a blanket throw: no rows
    // is an ANSWER. Only no answer is the failure.
    const history = await getPurchaseAndRetirementHistory('user-1')
    expect(history.purchases).toEqual([])
    expect(history.retirements).toEqual([])
    await expect(getUserRetirementHistory('user-1')).resolves.toEqual([])
  })
})
