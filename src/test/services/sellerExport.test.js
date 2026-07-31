import { describe, it, expect } from 'vitest'
import { salesToRows, salesByProjectToRows, exportFilename } from '@/services/sellerExportService'

/**
 * A project developer had no way to get their own numbers out of the platform —
 * buyers, LGUs and admins all had exports; the party actually receiving the
 * money did not. These cover the shape an accountant or a registry
 * reconciliation depends on, particularly that the fee and the net travel with
 * every row rather than leaving gross to be explained verbally.
 */

describe('salesToRows', () => {
  const sale = {
    id: 'txn_1',
    quantity: 10,
    price_per_credit: 50,
    total_amount: 500,
    transaction_fee: 25,
    net_amount: 475,
    currency: 'PHP',
    status: 'completed',
    created_at: '2026-07-01T09:30:00.000Z',
    completed_at: '2026-07-02T11:00:00.000Z',
  }

  it('carries gross, fee and net on every row', () => {
    const [r] = salesToRows([sale])
    expect(r.gross).toBe('500.00')
    expect(r.platform_fee).toBe('25.00')
    expect(r.net).toBe('475.00')
  })

  it('prefers completed_at over created_at, as a settlement date', () => {
    expect(salesToRows([sale])[0].date).toBe('2026-07-02')
    const pending = { ...sale, completed_at: null }
    expect(salesToRows([pending])[0].date).toBe('2026-07-01')
  })

  it('derives net itself when the caller passes raw rows', () => {
    const raw = { ...sale, net_amount: undefined }
    expect(salesToRows([raw])[0].net).toBe('475.00')
  })

  it('formats money to a fixed 2dp so a spreadsheet does not guess', () => {
    const r = salesToRows([{ ...sale, total_amount: 500, transaction_fee: 0 }])[0]
    expect(r.platform_fee).toBe('0.00')
    expect(r.gross).toBe('500.00')
  })

  it('exports non-completed sales too, distinguished by status', () => {
    const rows = salesToRows([sale, { ...sale, id: 'txn_2', status: 'refunded' }])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.status)).toEqual(['completed', 'refunded'])
  })

  it('survives empty, missing and malformed input', () => {
    expect(salesToRows([])).toEqual([])
    expect(salesToRows()).toEqual([])
    const [r] = salesToRows([{}])
    expect(r.gross).toBe('0.00')
    expect(r.net).toBe('0.00')
    expect(r.date).toBe('')
    expect(r.currency).toBe('PHP')
  })

  it('does not emit an invalid date for an unparseable timestamp', () => {
    expect(salesToRows([{ created_at: 'not-a-date' }])[0].date).toBe('')
  })
})

describe('salesByProjectToRows', () => {
  it('carries gross, fees and net per project', () => {
    const [r] = salesByProjectToRows([
      {
        projectTitle: 'Mangrove',
        salesCount: 3,
        creditsSold: 30,
        grossEarnings: 1500,
        platformFees: 75,
        netEarnings: 1425,
        currency: 'PHP',
        lastSaleDate: '2026-07-02T11:00:00.000Z',
      },
    ])
    expect(r.project).toBe('Mangrove')
    expect(r.gross).toBe('1500.00')
    expect(r.platform_fees).toBe('75.00')
    expect(r.net).toBe('1425.00')
    expect(r.last_sale).toBe('2026-07-02')
  })

  it('falls back to a readable project name', () => {
    expect(salesByProjectToRows([{}])[0].project).toBe('Unknown Project')
  })

  it('survives empty and missing input', () => {
    expect(salesByProjectToRows([])).toEqual([])
    expect(salesByProjectToRows()).toEqual([])
  })
})

describe('exportFilename', () => {
  it('dates the file so successive exports do not collide', () => {
    expect(exportFilename('sales', new Date('2026-07-26T13:00:00.000Z'))).toBe(
      'carbonify-sales-2026-07-26.csv',
    )
  })
})
