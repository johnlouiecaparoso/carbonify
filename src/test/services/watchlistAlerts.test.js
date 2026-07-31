import { describe, it, expect } from 'vitest'
import { evaluatePriceDrop, MIN_DROP_PERCENT } from '@/services/watchlistService'
import { describeOrderStatus, isUnfinished, attachListingTitles } from '@/services/orderService'

describe('evaluatePriceDrop', () => {
  const saved = { price_at_save: 100, notify_on_drop: true }

  it('alerts on a drop past the threshold', () => {
    const result = evaluatePriceDrop(saved, { price_per_credit: 80 })
    expect(result.alert).toBe(true)
    expect(result.dropPercent).toBe(20)
  })

  it('stays quiet for price noise below the threshold', () => {
    // A 2% wobble is not worth a notification.
    expect(evaluatePriceDrop(saved, { price_per_credit: 98 }).alert).toBe(false)
    expect(MIN_DROP_PERCENT).toBeGreaterThan(2)
  })

  it('stays quiet when the price rises or holds', () => {
    expect(evaluatePriceDrop(saved, { price_per_credit: 120 }).alert).toBe(false)
    expect(evaluatePriceDrop(saved, { price_per_credit: 100 }).alert).toBe(false)
  })

  it('respects the buyer turning alerts off', () => {
    const muted = { ...saved, notify_on_drop: false }
    expect(evaluatePriceDrop(muted, { price_per_credit: 50 }).alert).toBe(false)
  })

  it('skips rows saved before price alerts existed (no baseline)', () => {
    // Back-filling today's price would invent a drop that never happened.
    const legacy = { price_at_save: null, notify_on_drop: true }
    expect(evaluatePriceDrop(legacy, { price_per_credit: 10 }).alert).toBe(false)
  })

  it('skips delisted listings', () => {
    expect(evaluatePriceDrop(saved, null).alert).toBe(false)
  })

  it("won't re-alert at a price the buyer was already told about", () => {
    const alreadyTold = { ...saved, last_alerted_price: 80 }
    expect(evaluatePriceDrop(alreadyTold, { price_per_credit: 80 }).alert).toBe(false)
    expect(evaluatePriceDrop(alreadyTold, { price_per_credit: 85 }).alert).toBe(false)
  })

  it('alerts again when the price falls below the last alerted price', () => {
    const alreadyTold = { ...saved, last_alerted_price: 80 }
    expect(evaluatePriceDrop(alreadyTold, { price_per_credit: 70 }).alert).toBe(true)
  })
})

describe('order status', () => {
  it('treats created and pending as unfinished, everything else as settled', () => {
    expect(isUnfinished({ status: 'created' })).toBe(true)
    expect(isUnfinished({ status: 'pending' })).toBe(true)
    expect(isUnfinished({ status: 'paid' })).toBe(false)
    expect(isUnfinished({ status: 'failed' })).toBe(false)
  })

  it('offers a retry only where restarting checkout makes sense', () => {
    expect(describeOrderStatus('failed').canRetry).toBe(true)
    expect(describeOrderStatus('expired').canRetry).toBe(true)
    // Already paid or mid-flight with the provider — retrying would double-charge.
    expect(describeOrderStatus('paid').canRetry).toBe(false)
    expect(describeOrderStatus('pending').canRetry).toBe(false)
  })

  it('degrades gracefully on an unrecognised status', () => {
    const unknown = describeOrderStatus('something_new')
    expect(unknown.label).toBe('something_new')
    expect(unknown.canRetry).toBe(false)
  })
})

describe('attachListingTitles', () => {
  const listings = [{ listing_id: 'l1', project_title: 'Mangrove Restoration', project_id: 'p1' }]

  it('joins order rows to their listing title', () => {
    const [order] = attachListingTitles([{ id: 'o1', listing_id: 'l1' }], listings)
    expect(order.projectTitle).toBe('Mangrove Restoration')
    expect(order.projectId).toBe('p1')
    expect(order.listingAvailable).toBe(true)
  })

  it('keeps an order whose listing is gone, with a generic label', () => {
    const [order] = attachListingTitles([{ id: 'o2', listing_id: 'gone' }], listings)
    expect(order.projectTitle).toBe('Carbon credits')
    expect(order.listingAvailable).toBe(false)
  })

  it('labels wallet top-ups, which have no listing at all', () => {
    const [order] = attachListingTitles([{ id: 'o3', purpose: 'wallet_topup' }], listings)
    expect(order.projectTitle).toBe('Wallet top-up')
  })
})
