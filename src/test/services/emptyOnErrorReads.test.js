import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

vi.mock('@/utils/authHelper', () => ({
  getCurrentUserId: vi.fn(async () => 'user-1'),
}))

vi.mock('@/services/authService', () => ({
  getSession: vi.fn(async () => ({ user: { id: 'user-1' } })),
}))

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn(async () => {}),
}))

import { getSupabase } from '@/services/supabaseClient'
import { listAllDisputes, listRecentTransactions, getMyDisputes } from '@/services/disputeService'
import { listKybApplications } from '@/services/kybService'
import { getMyOrders } from '@/services/orderService'
import { getUserCertificates } from '@/services/certificateService'
import { listScreenings, getWatchlist } from '@/services/amlService'
import { listDataSubjectRequests, getMyDataRequests } from '@/services/dataPrivacyService'
import { getMyOfftakes } from '@/services/offtakeService'
import { getMyDataRoomActivity } from '@/services/dataRoomService'
import { listProjectComments } from '@/services/projectCommentService'
import { getMarketplaceListings } from '@/services/marketplaceService'

/**
 * The same bug class as `creditOwnershipErrors.test.js`, in the reads that pass
 * had not reached: a query fails, the service swallows the error and returns
 * `[]`, and the screen renders that as a FACT rather than as an absence of
 * evidence.
 *
 * Each of these had a caller that was ALREADY written to handle a rejection —
 * `AdminRefundsView`'s `Promise.allSettled` + `loadError`, `MyDisputesView`'s
 * catch, `OrdersView`'s catch, `CertificateView`'s catch. Every one of those
 * branches was dead code, exactly as `BuyerDashboardView`'s was before the
 * 2026-07-30 fix. The service never gave them anything to catch.
 *
 * What each one said when it failed:
 *
 *   listAllDisputes()        -> "No open disputes."           (admin console)
 *   listRecentTransactions() -> an empty refund console
 *   listKybApplications()    -> "No pending applications."    (sellers waiting)
 *   getMyDisputes()          -> "you have reported nothing"
 *   getMyOrders()            -> "you have no orders"
 *   getUserCertificates()    -> "you have retired nothing" — and worse, it made
 *                               CertificateView call generateMissingCertificates()
 *                               for a user who already had them
 */

const DB_DOWN = { message: 'connection terminated unexpectedly', code: '08006' }

/** A thenable query chain that resolves to `result` at any depth. */
function failingChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

const FAILS = () => failingChain({ data: null, error: DB_DOWN })

/** Services that resolve the caller through `supabase.auth.getUser()`. */
const AUTH = { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }

describe('a failed read must not present itself as an empty result', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  describe('admin surfaces — an empty console reads as "nothing to do"', () => {
    it('listAllDisputes rejects instead of showing "No open disputes."', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(listAllDisputes()).rejects.toThrow()
    })

    it('listRecentTransactions rejects instead of an empty refund console', async () => {
      vi.mocked(getSupabase).mockReturnValue({
        rpc: async () => ({ data: null, error: DB_DOWN }),
      })
      await expect(listRecentTransactions()).rejects.toThrow()
    })

    it('listKybApplications rejects instead of showing a cleared review queue', async () => {
      // The sharp end: a seller's withdrawals stay locked while the queue that
      // would unlock them reports itself as empty.
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(listKybApplications()).rejects.toThrow()
    })
  })

  describe('buyer surfaces — an empty list reads as a fact about the account', () => {
    it('getMyDisputes rejects instead of "you have reported no problems"', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(getMyDisputes()).rejects.toThrow()
    })

    it('getMyOrders rejects instead of "you have no orders"', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(getMyOrders()).rejects.toThrow()
    })

    it('getUserCertificates rejects instead of "you have retired nothing"', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(getUserCertificates('user-1')).rejects.toThrow()
    })
  })

  describe('compliance queues — an empty queue reads as "nobody is waiting"', () => {
    it('listScreenings rejects instead of an AML queue that reports itself clear', async () => {
      // With status:'open' an empty result means "no subject awaits a
      // compliance decision" — the one conclusion an AML console must never
      // reach because a query failed.
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(listScreenings()).rejects.toThrow()
    })

    it('getWatchlist rejects instead of screening against a silently empty list', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(getWatchlist()).rejects.toThrow()
    })

    it('listDataSubjectRequests rejects instead of an empty DPA erasure queue', async () => {
      // Every row here has a statutory clock running.
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(listDataSubjectRequests()).rejects.toThrow()
    })

    it('getMyDataRequests rejects instead of "you have asked for nothing"', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS, auth: AUTH })
      await expect(getMyDataRequests()).rejects.toThrow()
    })
  })

  describe('the marketplace itself', () => {
    it('getMarketplaceListings rejects instead of "no credits available"', async () => {
      // The buyer's primary surface. An empty marketplace is a statement about
      // the whole platform, not about one query.
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS, auth: AUTH })
      await expect(getMarketplaceListings({ forceRefresh: true })).rejects.toThrow()
    })
  })

  describe('developer and verifier surfaces', () => {
    it('getMyOfftakes rejects instead of "you have no agreements"', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS, auth: AUTH })
      await expect(getMyOfftakes()).rejects.toThrow()
    })

    it('getMyDataRoomActivity rejects instead of "nobody viewed your documents"', async () => {
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS, auth: AUTH })
      await expect(getMyDataRoomActivity()).rejects.toThrow()
    })

    it('listProjectComments rejects instead of an empty revision thread', async () => {
      // An empty thread reads as "the verifier has asked you nothing", on the
      // screen where revisions are requested and answered.
      vi.mocked(getSupabase).mockReturnValue({ from: FAILS })
      await expect(listProjectComments('proj-1')).rejects.toThrow()
    })
  })

  describe('the happy path still resolves, so this is not a blanket throw', () => {
    it('returns rows when the query succeeds', async () => {
      const rows = [{ id: 'd-1' }]
      vi.mocked(getSupabase).mockReturnValue({
        from: () => failingChain({ data: rows, error: null }),
        rpc: async () => ({ data: rows, error: null }),
        auth: AUTH,
      })

      await expect(listAllDisputes()).resolves.toEqual(rows)
      await expect(listRecentTransactions()).resolves.toEqual(rows)
      await expect(listKybApplications()).resolves.toEqual(rows)
      await expect(getMyDisputes()).resolves.toEqual(rows)
      await expect(getMyOrders()).resolves.toEqual(rows)
      await expect(getWatchlist()).resolves.toEqual(rows)
      await expect(getMyDataRequests()).resolves.toEqual(rows)
      await expect(getMyOfftakes()).resolves.toEqual(rows)
      await expect(getMyDataRoomActivity()).resolves.toEqual(rows)
    })
  })
})
