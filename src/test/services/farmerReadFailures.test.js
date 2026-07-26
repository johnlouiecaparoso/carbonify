import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))
vi.mock('@/services/notificationService', () => ({
  createNotificationsForUsers: vi.fn(),
}))
vi.mock('@/services/storageService', () => ({
  uploadProjectDocument: vi.fn(),
}))

import { getMyParcels, getMyDeliveries, getMyAcceptedRfqs } from '@/services/farmerService'
import { getMyBiomassProducts, getMySellerRfqs } from '@/services/biomassService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * Every read behind the farmer's surfaces used to swallow its error and return
 * [], which on these screens does not read as "something went wrong" — it reads
 * as a statement about the farm:
 *
 *   getMyParcels          -> "No parcels registered yet"      (re-register land?)
 *   getMyDeliveries       -> "No deliveries logged yet"       (earnings show PHP 0)
 *   getMyAcceptedRfqs     -> "You have no accepted quotes"    (cannot log a delivery
 *                                                              they are owed for)
 *   getMyBiomassProducts  -> "no listings"                    (re-list feedstock?)
 *   getMySellerRfqs       -> "no quote requests"              (no buyers want this)
 *
 * None of those are facts about the farmer. They are facts about a failed
 * request, and on a livelihood screen the difference decides what someone does
 * next. Each now rejects so the caller can tell the two apart.
 */

const USER = { data: { user: { id: 'farmer-1' } } }

function tableThatFails(message) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: null, error: { message } }),
    limit: () => Promise.resolve({ data: null, error: { message } }),
  }
  return chain
}

function tableThatReturns(rows) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve({ data: rows, error: null }),
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain
}

const clientWith = (table) => ({
  auth: { getUser: vi.fn().mockResolvedValue(USER) },
  from: () => table,
})

beforeEach(() => vi.clearAllMocks())

describe('farmer reads reject rather than reporting an empty farm', () => {
  const cases = [
    ['getMyParcels', getMyParcels, 'permission denied for table farm_parcels'],
    ['getMyDeliveries', getMyDeliveries, 'connection reset'],
    ['getMyAcceptedRfqs', getMyAcceptedRfqs, 'statement timeout'],
  ]

  for (const [name, fn, message] of cases) {
    it(`${name} rejects on a query error`, async () => {
      getSupabase.mockReturnValue(clientWith(tableThatFails(message)))
      await expect(fn()).rejects.toThrow(new RegExp(message.split(' ')[0], 'i'))
    })
  }

  it('still resolves normally, and an empty result stays empty', async () => {
    getSupabase.mockReturnValue(clientWith(tableThatReturns([])))
    await expect(getMyParcels()).resolves.toEqual([])

    getSupabase.mockReturnValue(clientWith(tableThatReturns([{ id: 'p1', name: 'North field' }])))
    await expect(getMyParcels()).resolves.toEqual([{ id: 'p1', name: 'North field' }])
  })

  it('returns [] without a client rather than throwing, which is a config case', async () => {
    // Not the same as a failed query: there is no session to fail.
    getSupabase.mockReturnValue(null)
    await expect(getMyParcels()).resolves.toEqual([])
    await expect(getMyDeliveries()).resolves.toEqual([])
  })
})

describe('biomass supplier reads reject rather than reporting no demand', () => {
  it('getMyBiomassProducts rejects instead of showing an empty listing set', async () => {
    getSupabase.mockReturnValue(clientWith(tableThatFails('permission denied')))
    await expect(getMyBiomassProducts()).rejects.toThrow(/permission denied/)
  })

  it('getMySellerRfqs rejects instead of implying no buyer wants the feedstock', async () => {
    getSupabase.mockReturnValue(clientWith(tableThatFails('network error')))
    await expect(getMySellerRfqs()).rejects.toThrow(/network error/)
  })

  it('resolves to rows when the query succeeds', async () => {
    getSupabase.mockReturnValue(clientWith(tableThatReturns([{ id: 'r1', status: 'open' }])))
    await expect(getMySellerRfqs()).resolves.toEqual([{ id: 'r1', status: 'open' }])
  })
})
