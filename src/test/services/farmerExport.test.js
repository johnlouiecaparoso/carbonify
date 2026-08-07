import { describe, it, expect } from 'vitest'
import {
  paymentLabel,
  deliveriesToRows,
  carbonParticipationToRows,
  exportFilename,
} from '@/services/farmerExportService'

/**
 * The farmer's export.
 *
 * The column that carries the weight is `payment`. The farmer portal renders a
 * two-sided payment record on purpose — a buyer marking a delivery paid is an
 * assertion until the farmer acknowledges it, and #26 exists because the product
 * used to present that assertion as fact. An export is where that distinction is
 * most likely to be lost, because a spreadsheet has no badge colours and gets
 * forwarded to people who never saw the screen.
 *
 * The last two cases below are the ones that matter most, because they are the
 * ones this file originally got WRONG. It shipped its own four-branch copy of
 * the state machine with no `payment_resolution` branch at all; the duplicate-
 * export ratchet refused it, and delegating to the canonical
 * `adminFeedstockService.paymentState` fixed a real defect rather than just a
 * naming collision.
 */

describe('paymentLabel', () => {
  it('does not call an unacknowledged claim "paid"', () => {
    const label = paymentLabel({ payment_status: 'paid' })
    expect(label).toBe('Buyer claims paid')
    expect(label).not.toMatch(/^Paid\b/)
  })

  it('reports agreement only once the farmer has confirmed it', () => {
    expect(paymentLabel({ payment_status: 'paid', farmer_payment_ack: 'confirmed' })).toBe(
      'Both parties agree',
    )
  })

  it('reports a dispute ahead of the buyer’s claim', () => {
    // "You said you paid me and did not" must not render as paid just because
    // payment_status says so — the dispute is the more important fact.
    expect(paymentLabel({ payment_status: 'paid', farmer_payment_ack: 'disputed' })).toBe(
      'Disputed by farmer',
    )
  })

  it('reports unpaid when the buyer has claimed nothing', () => {
    expect(paymentLabel({ status: 'confirmed' })).toBe('Confirmed, unpaid')
  })

  it('does not report a STAFF-RESOLVED dispute as still disputed', () => {
    // The defect the ratchet caught. This file's own copy had no branch for
    // payment_resolution, so a dispute staff had already closed exported as
    // "Disputed by farmer" — to the farmer, in the file they send onwards.
    expect(
      paymentLabel({ payment_status: 'paid', payment_resolution: 'paid_confirmed' }),
    ).toBe('Resolved by staff')
  })

  it('distinguishes a re-dispute from a first dispute', () => {
    // A farmer disputing again AFTER staff closed it is a different and worse
    // state than a first dispute. The discarded copy could not express it.
    expect(
      paymentLabel({ farmer_payment_ack: 'disputed', payment_resolution: 'paid_confirmed' }),
    ).toBe('Reopened after resolution')
  })
})

describe('deliveriesToRows', () => {
  const delivery = {
    id: 'd-1',
    rfq_id: 'r-9',
    delivered_on: '2026-08-01T09:00:00Z',
    created_at: '2026-07-30T09:00:00Z',
    quantity: 12,
    unit: 'tonnes',
    price_per_unit: 1500,
    total_amount: 18000,
    currency: 'PHP',
    status: 'confirmed',
    payment_status: 'paid',
    farmer_payment_ack: 'confirmed',
    paid_at: '2026-08-03T04:00:00Z',
  }

  it('maps a delivery to its export row', () => {
    const [row] = deliveriesToRows([delivery])
    expect(row.date).toBe('2026-08-01')
    expect(row.delivery_id).toBe('d-1')
    expect(row.rfq_id).toBe('r-9')
    expect(row.quantity).toBe(12)
    expect(row.tonnes).toBe('12')
    expect(row.total).toBe('18000.00')
    expect(row.payment).toBe('Both parties agree')
    expect(row.paid_on).toBe('2026-08-03')
  })

  it('falls back to created_at when the delivery date is missing', () => {
    const [row] = deliveriesToRows([{ ...delivery, delivered_on: null }])
    expect(row.date).toBe('2026-07-30')
  })

  it('leaves tonnes BLANK for units with no fixed mass, never zero', () => {
    // Sacks and bales depend on bulk density. Writing 0 would understate a real
    // delivery in a file somebody reconciles against.
    const [row] = deliveriesToRows([{ ...delivery, unit: 'sacks' }])
    expect(row.tonnes).toBe('')
    expect(row.quantity).toBe(12)
  })

  it('exports rejected and pending deliveries too', () => {
    const rows = deliveriesToRows([
      { ...delivery, id: 'a', status: 'rejected' },
      { ...delivery, id: 'b', status: 'pending' },
      { ...delivery, id: 'c', status: 'confirmed' },
    ])
    // An export that silently disagrees with the screen it came from is worse
    // than no export: the rejections are exactly what a dispute needs.
    expect(rows.map((r) => r.status)).toEqual(['rejected', 'pending', 'confirmed'])
  })

  it('survives an empty or malformed input', () => {
    expect(deliveriesToRows()).toEqual([])
    expect(deliveriesToRows(null)).toEqual([])
    expect(deliveriesToRows([{}])).toHaveLength(1)
  })

  it('does not emit NaN for a missing amount', () => {
    const [row] = deliveriesToRows([{ id: 'x' }])
    expect(row.total).toBe('0.00')
    expect(row.unit_price).toBe('0.00')
    expect(row.quantity).toBe(0)
  })
})

describe('carbonParticipationToRows', () => {
  it('writes the share as a percentage, not a raw fraction', () => {
    // 0.0271 in a column headed "share" invites being read as 2.71%.
    const [row] = carbonParticipationToRows([
      { projectTitle: 'Rice husk biochar', share: 0.0271, attributedTco2e: 4.5 },
    ])
    expect(row.share_pct).toBe('2.7100')
    expect(row.attributed).toBe('4.5')
  })

  it('names an untitled project rather than exporting a blank', () => {
    const [row] = carbonParticipationToRows([{ share: 0.5 }])
    expect(row.project).toBe('Unknown project')
  })

  it('survives an empty or malformed input', () => {
    expect(carbonParticipationToRows()).toEqual([])
    expect(carbonParticipationToRows(null)).toEqual([])
  })
})

describe('exportFilename', () => {
  it('dates the file so successive exports do not collide', () => {
    expect(exportFilename('deliveries', new Date('2026-08-07T12:00:00Z'))).toBe(
      'carbonify-deliveries-2026-08-07.csv',
    )
  })
})
