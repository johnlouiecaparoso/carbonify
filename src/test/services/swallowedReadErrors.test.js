import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))
vi.mock('@/utils/authHelper', () => ({
  getCurrentUserId: vi.fn(async () => 'user-1'),
}))

import { getSupabase } from '@/services/supabaseClient'
import { getAllSettings, listMethodologyFactors, getSetting } from '@/services/settingsService'
import { getMyWatchlist, getMyWatchlistIds } from '@/services/watchlistService'
import { listMySavedSearches } from '@/services/savedSearchService'
import { findDuplicateEvidence } from '@/services/monitoringService'
import { getMyListings } from '@/services/sellerListingService'
import { getProjectPriceHistory, getMarketPriceHistory } from '@/services/priceHistoryService'

/**
 * The #15 tail: the last reads whose ERROR path produced a benign-looking value.
 *
 * Same class the whole project has been chasing — `[]`-on-error reads as a fact
 * about the user — but these are the ones the 07-30 → 08-02 passes did not
 * reach, found by scanning every `catch`/`if (error)` in `src/services` rather
 * than by following a bug report.
 *
 * The sharpest is `getAllSettings`. SystemConfigView binds it straight into
 * editable inputs, so `{}` renders as "platform fee 0%, minimum KYC level 0,
 * both project fees ₱0" — and the admin reading that can press Save and write
 * those zeros into live configuration. That view already builds a
 * "Do not save those sections until this resolves" banner out of a rejected
 * `Promise.allSettled`; returning `{}` is precisely what made that branch
 * unreachable. It is the fifth view found this week whose error handling had
 * been written and could never run.
 *
 * Every test here asserts REJECTION, because the defect was never in the shape
 * of the returned value — a `[]` is indistinguishable from a real empty result,
 * which is the whole problem.
 */

const DB_DOWN = { message: 'connection terminated unexpectedly', code: '08006' }

/** A thenable query chain: every builder method returns itself. */
function chain(result, terminal) {
  const c = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'maybeSingle']) {
    c[m] = () => (m === terminal ? Promise.resolve(result) : c)
  }
  // Un-terminated chains still have to resolve for `await query.limit(20)`.
  c.then = (res, rej) => Promise.resolve(result).then(res, rej)
  return c
}

function clientReturning(result, terminal = 'order') {
  return { from: () => chain(result, terminal), rpc: () => Promise.resolve(result) }
}

beforeEach(() => {
  vi.mocked(getSupabase).mockReset()
})

describe('settingsService — a failed read must not render as live configuration', () => {
  it('getAllSettings rejects instead of returning {}', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: () => chain({ data: null, error: DB_DOWN }, 'select'),
    })
    // The bug: resolved to {}, so SystemConfigView showed platform fee 0%,
    // min KYC 0 and both fees ₱0 — with Save enabled.
    await expect(getAllSettings()).rejects.toThrow()
  })

  it('listMethodologyFactors rejects instead of returning []', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientReturning({ data: null, error: DB_DOWN }))
    await expect(listMethodologyFactors()).rejects.toThrow()
  })

  it('getSetting keeps the caller-supplied fallback — that opt-out is deliberate', async () => {
    // Not every read must throw. Every getSetting caller passes an explicit
    // fallback, which is the CALLER deciding an absence is tolerable. What
    // changed is that a real error is now reported rather than absorbed.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getSupabase).mockReturnValue({
      from: () => chain({ data: null, error: DB_DOWN }, 'maybeSingle'),
    })

    await expect(getSetting('vat_rate', 0.12)).resolves.toBe(0.12)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('getSetting still treats "no such key" as the fallback, silently', async () => {
    // maybeSingle reports a missing row as data:null/error:null. That is not a
    // failure and must not be logged as one.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getSupabase).mockReturnValue({
      from: () => chain({ data: null, error: null }, 'maybeSingle'),
    })

    await expect(getSetting('never_configured', 7)).resolves.toBe(7)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('the remaining reads that spoke for the user', () => {
  it('getMyWatchlist rejects instead of saying the watchlist is empty', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientReturning({ data: null, error: DB_DOWN }))
    // WatchlistView's `error.value = 'Failed to load your watchlist.'` was dead
    // code for as long as this resolved to [].
    await expect(getMyWatchlist()).rejects.toThrow()
  })

  it('getMyWatchlistIds propagates rather than returning an empty Set', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientReturning({ data: null, error: DB_DOWN }))
    await expect(getMyWatchlistIds()).rejects.toThrow()
  })

  it('listMySavedSearches rejects instead of saying nothing was saved', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientReturning({ data: null, error: DB_DOWN }))
    // The buyer's response to "you have no saved searches" is to save it again,
    // so this failure produced a duplicate row and duplicate price alerts.
    await expect(listMySavedSearches()).rejects.toThrow()
  })

  it('getMyListings rejects instead of showing a seller no listings', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'seller-1' } } }) },
      from: () => chain({ data: null, error: DB_DOWN }, 'eq'),
    })
    await expect(getMyListings()).rejects.toThrow()
  })

  it('getProjectPriceHistory rejects instead of drawing an empty chart', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      rpc: async () => ({ data: null, error: DB_DOWN }),
    })
    await expect(getProjectPriceHistory('project-1')).rejects.toThrow()
  })

  it('getMarketPriceHistory rejects too', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      rpc: async () => ({ data: null, error: DB_DOWN }),
    })
    await expect(getMarketPriceHistory()).rejects.toThrow()
  })
})

describe('findDuplicateEvidence — an unanswered fraud check is not a clean one', () => {
  it('rejects instead of reporting zero duplicates', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: () => chain({ data: null, error: DB_DOWN }, 'limit'),
    })
    // [] here is the assertion "these bytes appear on no other report", which
    // is what suppresses the `alert` flag on the verifier's integrity panel.
    // A failed lookup rendered as a passed check, on the screen where credits
    // are approved.
    await expect(findDuplicateEvidence('sha256-abc', 'report-1')).rejects.toThrow()
  })

  it('still short-circuits on a missing hash without touching the database', async () => {
    // Not every empty result is an error: evidence uploaded before hashing
    // existed has no content_hash, and there is nothing to look up.
    vi.mocked(getSupabase).mockReturnValue({
      from: () => {
        throw new Error('must not query')
      },
    })
    await expect(findDuplicateEvidence(null)).resolves.toEqual([])
  })
})

describe('the reads that deliberately still degrade', () => {
  it('a successful read is unaffected — these tests cannot pass vacuously', async () => {
    // If every assertion above were satisfied by the functions simply always
    // throwing, this project would have traded one defect for a worse one.
    vi.mocked(getSupabase).mockReturnValue(
      clientReturning({ data: [{ id: 'w1', listing_id: 'l1' }], error: null }),
    )
    await expect(getMyWatchlist()).resolves.toHaveLength(1)

    vi.mocked(getSupabase).mockReturnValue({
      from: () => chain({ data: [{ key: 'platform_fee_percent', value: 3 }], error: null }, 'select'),
    })
    await expect(getAllSettings()).resolves.toEqual({ platform_fee_percent: 3 })
  })
})
