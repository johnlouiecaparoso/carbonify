import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { creditOwnershipService } from '@/services/creditOwnershipService'
import { buildEsgDataset } from '@/services/esgReportService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * Guard for the recurring bug class the 2026-07-26 role review named: a read
 * that fails, swallows the error, and returns `[]` — which the UI then renders
 * as a FACT ABOUT THE USER.
 *
 * These two reads were the financially load-bearing instances:
 *
 *   getUserCreditPortfolio()      -> "you own no credits"
 *   getUserTransactionHistory()   -> "you have retired nothing"
 *
 * The second is the worse one. Its only caller is
 * `esgReportService.buildEsgDataset`, so a failed retirements query produced a
 * downloaded ESG report stating zero offsets — the same wrong-number-on-an-
 * exported-report outcome as #11, reached through the error path rather than
 * through the slice that fix addressed.
 *
 * Neither could be caught before: the suite only ever exercised the happy path,
 * and `esgReportService.test.js` injects a fake service, so the real function
 * never ran. That is exactly why these assert on REJECTION, not on shape.
 */

const DB_DOWN = { message: 'connection terminated unexpectedly', code: '08006' }

/** Chain used by getUserCreditPortfolio: .select().eq().order() */
function ownershipTable(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
  }
  return chain
}

/** Chain used by getUserTransactionHistory: .select().eq().order().limit() */
function historyTable(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
  }
  return chain
}

const OK_ROWS = { data: [], error: null }

describe('creditOwnershipService — a failed read must not read as an empty account', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('getUserCreditPortfolio rejects instead of returning an empty portfolio', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: () => ownershipTable({ data: null, error: DB_DOWN }),
    })

    // The bug: resolved to [], and BuyerDashboardView / CreditPortfolioView /
    // RetireView all showed "no holdings" for a database outage.
    await expect(creditOwnershipService.getUserCreditPortfolio('user-1')).rejects.toThrow()
  })

  it('getUserTransactionHistory rejects when the RETIREMENTS query fails', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: (table) =>
        table === 'credit_retirements'
          ? historyTable({ data: null, error: DB_DOWN })
          : historyTable(OK_ROWS),
    })

    // Previously logged and continued with retirements undefined, so the caller
    // saw a well-formed history containing zero retirements.
    await expect(creditOwnershipService.getUserTransactionHistory('user-1')).rejects.toThrow()
  })

  // `credit_transactions`, not `credit_purchases`. This assertion was pinned to
  // the latter until 2026-08-01 and passed the whole time — the service really
  // did read that table, and the table is one nothing writes. A test can agree
  // with the code and both be wrong about the database.
  it('getUserTransactionHistory rejects when the PURCHASES query fails', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: (table) =>
        table === 'credit_transactions'
          ? historyTable({ data: null, error: DB_DOWN })
          : historyTable(OK_ROWS),
    })

    await expect(creditOwnershipService.getUserTransactionHistory('user-1')).rejects.toThrow()
  })

  it('an ESG report fails loudly rather than reporting zero offsets', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: (table) =>
        table === 'credit_retirements'
          ? historyTable({ data: null, error: DB_DOWN })
          : table === 'credit_purchases'
            ? historyTable(OK_ROWS)
            : ownershipTable(OK_ROWS),
    })

    // The outcome that matters: the user gets an error, NOT a PDF that states
    // they have retired nothing. CreditPortfolioView.downloadEsg catches this
    // and surfaces it; before, it announced "no credits to disclose yet".
    await expect(buildEsgDataset('user-1')).rejects.toThrow()
  })
})
