import { describe, it, expect } from 'vitest'
import { aggregateSalesByProject, netOf } from '@/services/payoutService'

describe('aggregateSalesByProject', () => {
  it('returns an empty array for no rows', () => {
    expect(aggregateSalesByProject([])).toEqual([])
    expect(aggregateSalesByProject()).toEqual([])
  })

  it('groups completed sales per project and sums credits + gross', () => {
    const rows = [
      { project_id: 'p1', project_title: 'Mangrove', quantity: 10, total_amount: 500, status: 'completed', date: '2026-06-01' },
      { project_id: 'p1', project_title: 'Mangrove', quantity: 5, total_amount: 250, status: 'completed', date: '2026-06-10' },
      { project_id: 'p2', project_title: 'Solar', quantity: 2, total_amount: 100, status: 'completed', date: '2026-06-05' },
    ]
    const r = aggregateSalesByProject(rows)
    expect(r).toHaveLength(2)
    const p1 = r.find((x) => x.projectId === 'p1')
    expect(p1.salesCount).toBe(2)
    expect(p1.creditsSold).toBe(15)
    expect(p1.grossEarnings).toBe(750)
    expect(p1.lastSaleDate).toBe('2026-06-10') // most recent of the two
  })

  it('excludes non-completed sales (pending/refunded)', () => {
    const rows = [
      { project_id: 'p1', project_title: 'Mangrove', quantity: 10, total_amount: 500, status: 'completed', date: '2026-06-01' },
      { project_id: 'p1', project_title: 'Mangrove', quantity: 5, total_amount: 250, status: 'refunded', date: '2026-06-02' },
      { project_id: 'p1', project_title: 'Mangrove', quantity: 3, total_amount: 150, status: 'pending', date: '2026-06-03' },
    ]
    const r = aggregateSalesByProject(rows)
    expect(r).toHaveLength(1)
    expect(r[0].salesCount).toBe(1)
    expect(r[0].creditsSold).toBe(10)
    expect(r[0].grossEarnings).toBe(500)
  })

  it('sorts by gross earnings, highest first', () => {
    const rows = [
      { project_id: 'small', project_title: 'A', quantity: 1, total_amount: 100, status: 'completed' },
      { project_id: 'big', project_title: 'B', quantity: 1, total_amount: 900, status: 'completed' },
      { project_id: 'mid', project_title: 'C', quantity: 1, total_amount: 400, status: 'completed' },
    ]
    const r = aggregateSalesByProject(rows)
    expect(r.map((x) => x.projectId)).toEqual(['big', 'mid', 'small'])
  })

  it('falls back gracefully on missing project id/title and rounds money', () => {
    const rows = [
      { quantity: 2, total_amount: 33.335, status: 'completed' },
    ]
    const r = aggregateSalesByProject(rows)
    expect(r[0].projectId).toBe('unknown')
    expect(r[0].projectTitle).toBe('Unknown Project')
    expect(r[0].grossEarnings).toBe(33.34)
  })
})

/**
 * Seller net = gross − platform fee.
 *
 * These exist because the seller-facing pages showed gross only. The fee is
 * written per transaction by process_marketplace_purchase (v_seller_net :=
 * v_amount - v_fee) but was never selected, so "Total earned" on /sales never
 * reconciled against the withdrawable balance beside it and nothing explained
 * the difference. netOf is the single definition both the per-sale row and this
 * rollup use, so they cannot drift.
 */
describe('netOf', () => {
  it('subtracts the platform fee from the gross', () => {
    expect(netOf({ total_amount: 1000, transaction_fee: 50 })).toBe(950)
  })

  it('treats a missing or null fee as zero rather than NaN', () => {
    expect(netOf({ total_amount: 1000 })).toBe(1000)
    expect(netOf({ total_amount: 1000, transaction_fee: null })).toBe(1000)
  })

  it('handles numeric strings, which is what postgres numeric arrives as', () => {
    expect(netOf({ total_amount: '1000.00', transaction_fee: '25.50' })).toBe(974.5)
  })

  it('rounds to centavos instead of leaking float error', () => {
    // 1000.10 - 333.33 is 666.77 exactly; without rounding this is 666.7700000000001.
    expect(netOf({ total_amount: 1000.1, transaction_fee: 333.33 })).toBe(666.77)
  })

  // Documents a known limit rather than asserting the ideal. 100.1 - 33.335 is
  // 66.765, which half-up would round to 66.77 — but 66.765 * 100 is
  // 6676.499...  in binary floating point, so it lands on 66.76. This is a
  // DISPLAY figure only: the authoritative net is v_seller_net, computed in
  // postgres `numeric` inside process_marketplace_purchase, and it is that
  // value which is credited to seller_payable and drives the withdrawable
  // balance. If these two ever need to agree to the centavo on an exact half,
  // this helper has to move to integer centavos.
  it('can differ from half-up by one centavo on an exact half (display only)', () => {
    expect(netOf({ total_amount: 100.1, transaction_fee: 33.335 })).toBe(66.76)
  })

  it('returns 0 for an empty or absent row', () => {
    expect(netOf({})).toBe(0)
    expect(netOf()).toBe(0)
  })
})

describe('aggregateSalesByProject — fees and net', () => {
  it('sums fees and net alongside gross', () => {
    const rows = [
      { project_id: 'p1', project_title: 'Mangrove', quantity: 10, total_amount: 500, transaction_fee: 25, status: 'completed' },
      { project_id: 'p1', project_title: 'Mangrove', quantity: 5, total_amount: 250, transaction_fee: 12.5, status: 'completed' },
    ]
    const [p1] = aggregateSalesByProject(rows)
    expect(p1.grossEarnings).toBe(750)
    expect(p1.platformFees).toBe(37.5)
    expect(p1.netEarnings).toBe(712.5)
  })

  it('keeps net equal to gross when no fee was charged', () => {
    const rows = [
      { project_id: 'p1', project_title: 'A', quantity: 1, total_amount: 200, status: 'completed' },
    ]
    const [p1] = aggregateSalesByProject(rows)
    expect(p1.platformFees).toBe(0)
    expect(p1.netEarnings).toBe(p1.grossEarnings)
  })

  it('ignores fees on non-completed sales, as it does their gross', () => {
    const rows = [
      { project_id: 'p1', project_title: 'A', quantity: 1, total_amount: 100, transaction_fee: 10, status: 'completed' },
      { project_id: 'p1', project_title: 'A', quantity: 9, total_amount: 900, transaction_fee: 90, status: 'refunded' },
    ]
    const [p1] = aggregateSalesByProject(rows)
    expect(p1.grossEarnings).toBe(100)
    expect(p1.platformFees).toBe(10)
    expect(p1.netEarnings).toBe(90)
  })
})
