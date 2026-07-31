import { describe, it, expect } from 'vitest'
import { summarizePriceSeries, comparePriceToMarket } from '@/services/priceHistoryService'

/** Build a daily bucket the way the RPC returns it (already normalized). */
function point(vwap, credits = 100, minPrice = vwap, maxPrice = vwap) {
  return { day: '2026-07-01', vwap, minPrice, maxPrice, credits, trades: 1 }
}

describe('summarizePriceSeries', () => {
  it('reports no data for an empty series', () => {
    const summary = summarizePriceSeries([])
    expect(summary.hasData).toBe(false)
    expect(summary.average).toBe(0)
  })

  it('ignores buckets with no traded price', () => {
    expect(summarizePriceSeries([{ vwap: 0, credits: 50 }]).hasData).toBe(false)
  })

  it('volume-weights the average so a big trade counts more than a small one', () => {
    // 1 credit at 100, 99 credits at 200 → nearly 200, not the 150 a plain mean gives.
    const summary = summarizePriceSeries([point(100, 1), point(200, 99)])
    expect(summary.average).toBeCloseTo(199, 0)
    expect(summary.totalCredits).toBe(100)
  })

  it('takes low/high from the bucket extremes, not just the averages', () => {
    const summary = summarizePriceSeries([point(150, 10, 120, 180), point(160, 10, 140, 200)])
    expect(summary.low).toBe(120)
    expect(summary.high).toBe(200)
  })

  it('measures trend from the oldest bucket to the newest', () => {
    const summary = summarizePriceSeries([point(100), point(120), point(150)])
    expect(summary.earliest).toBe(100)
    expect(summary.latest).toBe(150)
    expect(summary.changePercent).toBe(50)
  })

  it('reports a negative trend when price falls', () => {
    expect(summarizePriceSeries([point(200), point(150)]).changePercent).toBe(-25)
  })
})

describe('comparePriceToMarket', () => {
  const series = [point(100), point(100), point(100), point(100)]

  it("won't judge a price without enough history", () => {
    expect(comparePriceToMarket(100, [point(100)]).verdict).toBe('unknown')
    expect(comparePriceToMarket(100, [point(100), point(100)]).verdict).toBe('unknown')
    expect(comparePriceToMarket(100, []).verdict).toBe('unknown')
  })

  it("won't judge a nonsense asking price", () => {
    expect(comparePriceToMarket(0, series).verdict).toBe('unknown')
    expect(comparePriceToMarket(-50, series).verdict).toBe('unknown')
  })

  it('treats a price within 10% of the average as fair', () => {
    expect(comparePriceToMarket(100, series).verdict).toBe('fair')
    expect(comparePriceToMarket(109, series).verdict).toBe('fair')
    expect(comparePriceToMarket(91, series).verdict).toBe('fair')
  })

  it('flags clearly cheap and clearly expensive prices', () => {
    const cheap = comparePriceToMarket(80, series)
    expect(cheap.verdict).toBe('below')
    expect(cheap.deltaPercent).toBe(-20)

    const pricey = comparePriceToMarket(130, series)
    expect(pricey.verdict).toBe('above')
    expect(pricey.deltaPercent).toBe(30)
  })
})
