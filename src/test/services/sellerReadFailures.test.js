import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { getSellerBalance, getMySales } from '@/services/payoutService'
import { getMyKyb } from '@/services/kybService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * Every read behind /sales used to swallow its error and return [] or zeros.
 *
 * On a money page that inverts the meaning of the screen: a failed query became
 * "No sales yet", "PHP 0.00 available", and — via the KYB lookup — "Business
 * verification required" shown to a seller who had already been verified, with
 * their withdraw button disabled to match. None of those are facts about the
 * user; they are facts about a failed request, and the difference matters most
 * to the person deciding whether they have money to withdraw.
 *
 * These assert the reads now reject so the caller can tell the two apart.
 */

const USER = { data: { user: { id: 'seller-1' } } }

function tableThatFails(message) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: null, error: { message } }),
    single: () => Promise.resolve({ data: null, error: { message } }),
  }
  return chain
}

function tableThatReturns(rows) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
    single: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain
}

beforeEach(() => vi.clearAllMocks())

describe('getSellerBalance', () => {
  it('rejects instead of reporting a balance of zero', async () => {
    getSupabase.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc exploded' } }),
    })
    await expect(getSellerBalance()).rejects.toThrow(/rpc exploded/)
  })

  it('still returns the balance on success', async () => {
    getSupabase.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ available: 1200.5, held: 300, currency: 'PHP' }],
        error: null,
      }),
    })
    await expect(getSellerBalance()).resolves.toEqual({
      available: 1200.5,
      held: 300,
      currency: 'PHP',
    })
  })
})

describe('getMySales', () => {
  it('rejects instead of claiming the seller has made no sales', async () => {
    getSupabase.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue(USER) },
      from: () => tableThatFails('column credit_transactions.transaction_fee does not exist'),
    })
    await expect(getMySales()).rejects.toThrow(/transaction_fee/)
  })

  it('attaches net_amount to each row on success', async () => {
    getSupabase.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue(USER) },
      from: () =>
        tableThatReturns([{ id: 't1', total_amount: 500, transaction_fee: 25, status: 'completed' }]),
    })
    const [row] = await getMySales()
    expect(row.net_amount).toBe(475)
  })
})

describe('getMyKyb', () => {
  it('rejects rather than reporting an unverified business', async () => {
    // The distinction that matters: this seller may well BE verified. Returning
    // verified:false here would have told them otherwise and blocked withdrawal.
    getSupabase.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue(USER) },
      from: () => tableThatFails('permission denied for table profiles'),
    })
    await expect(getMyKyb()).rejects.toThrow(/permission denied/)
  })

  it('reports verified status when the profile reads cleanly', async () => {
    getSupabase.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue(USER) },
      from: (table) =>
        table === 'profiles'
          ? tableThatReturns({ kyb_verified: true })
          : tableThatReturns([{ id: 'app1', status: 'approved' }]),
    })
    const r = await getMyKyb()
    expect(r.verified).toBe(true)
    expect(r.application).toEqual({ id: 'app1', status: 'approved' })
  })

  it('survives a failed applications lookup, which only supplies detail', async () => {
    // Losing the application row degrades the message; it must not invert the
    // verified flag the way a failed profile read would.
    getSupabase.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue(USER) },
      from: (table) =>
        table === 'profiles' ? tableThatReturns({ kyb_verified: true }) : tableThatFails('nope'),
    })
    const r = await getMyKyb()
    expect(r.verified).toBe(true)
    expect(r.application).toBeNull()
  })
})
