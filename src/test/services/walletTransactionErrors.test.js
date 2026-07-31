import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { getTransactions } from '@/services/walletService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * The `[]`-as-a-fact-about-the-user class, in the wallet.
 *
 * `getTransactions` looked up the user's `wallet_accounts` row with `.single()`.
 * That returns an ERROR (PGRST116) when there are simply no rows, so the two
 * cases had to be collapsed:
 *
 *     if (walletError || !walletAccount) return []
 *
 * which meant a genuine failure — network, RLS, timeout — was reported to
 * WalletView as "you have no wallet transactions". WalletView's
 * `Promise.allSettled` rejected branch, which sets
 * "Failed to load wallet data", was dead code for that failure, exactly as
 * BuyerDashboardView's and RetireView's were before them.
 *
 * `.maybeSingle()` separates the two: no row is `data: null, error: null`.
 *
 * The distinction being drawn is between NO ROWS and NO ANSWER — which is why
 * the last test here asserts the empty case still resolves. A blanket throw
 * would be a different bug, not a fix.
 */

const DB_DOWN = { message: 'connection terminated unexpectedly', code: '08006' }

function clientWhere({ account, txns = { data: [], error: null } }) {
  return {
    from: (table) => {
      if (table === 'wallet_accounts') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve(account),
          // If the service ever regresses to .single(), this throws rather than
          // quietly passing — the mock refuses to model the ambiguous call.
          single: () => {
            throw new Error('use maybeSingle(): .single() cannot distinguish "no row" from an error')
          },
        }
        return chain
      }
      if (table === 'wallet_transactions') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve(txns),
        }
        return chain
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

describe('wallet transactions — a failed read must not read as an empty wallet', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('rejects when the wallet-account lookup fails', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWhere({ account: { data: null, error: DB_DOWN } }),
    )

    await expect(getTransactions('user-1')).rejects.toThrow()
  })

  it('resolves empty when the user genuinely has no wallet yet', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientWhere({ account: { data: null, error: null } }))

    // Nothing topped up: an answer, not a failure.
    await expect(getTransactions('user-1')).resolves.toEqual([])
  })

  it('returns the rows when the wallet exists', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWhere({
        account: { data: { id: 'acct-1' }, error: null },
        txns: { data: [{ id: 't1', amount: 500 }], error: null },
      }),
    )

    await expect(getTransactions('user-1')).resolves.toEqual([{ id: 't1', amount: 500 }])
  })
})
