/**
 * Price history — derived from settled trades, not from listing asks.
 *
 * Backed by the public_price_history / project_price_history RPCs, which
 * aggregate `credit_transactions` into daily volume-weighted buckets. Nothing is
 * stored separately, so there's no capture job to fall behind.
 *
 * The comparison helpers are pure so the "is this a fair price?" judgement is
 * testable without a database.
 */
import { getSupabase } from '@/services/supabaseClient'

/** Normalize an RPC row into plain numbers the UI can rely on. */
function normalizePoint(row) {
  return {
    day: row.day,
    vwap: Number(row.vwap) || 0,
    minPrice: Number(row.min_price) || 0,
    maxPrice: Number(row.max_price) || 0,
    credits: Number(row.credits) || 0,
    trades: Number(row.trades) || 0,
  }
}

/** Market-wide daily price series for the trailing `days`. Empty on failure. */
export async function getMarketPriceHistory(days = 90) {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase.rpc('public_price_history', { p_days: days })
  if (error) {
    console.warn('[price-history] market series failed:', error.message)
    return []
  }
  return (data || []).map(normalizePoint)
}

/** Daily price series for a single project. Empty on failure or if never traded. */
export async function getProjectPriceHistory(projectId, days = 90) {
  const supabase = getSupabase()
  if (!supabase || !projectId) return []

  const { data, error } = await supabase.rpc('project_price_history', {
    p_project_id: projectId,
    p_days: days,
  })
  if (error) {
    console.warn('[price-history] project series failed:', error.message)
    return []
  }
  return (data || []).map(normalizePoint)
}

/**
 * Summarize a series: where price is now, where it's been, and which way it's
 * moving. `changePercent` compares the most recent bucket to the oldest one in
 * the window — over 90 days that's a trend, not a day-to-day tick.
 *
 * @param {Array<{vwap:number,minPrice:number,maxPrice:number,credits:number}>} series
 */
export function summarizePriceSeries(series = []) {
  const points = (series || []).filter((p) => p && p.vwap > 0)
  if (points.length === 0) {
    return {
      hasData: false,
      latest: 0,
      earliest: 0,
      low: 0,
      high: 0,
      average: 0,
      changePercent: 0,
      totalCredits: 0,
    }
  }

  const latest = points[points.length - 1].vwap
  const earliest = points[0].vwap
  const low = Math.min(...points.map((p) => p.minPrice || p.vwap))
  const high = Math.max(...points.map((p) => p.maxPrice || p.vwap))
  const totalCredits = points.reduce((sum, p) => sum + (p.credits || 0), 0)

  // Volume-weighted across the whole window, consistent with each bucket's vwap.
  const weighted = points.reduce((sum, p) => sum + p.vwap * (p.credits || 0), 0)
  const average = totalCredits > 0 ? weighted / totalCredits : latest

  const changePercent =
    earliest > 0 ? Math.round(((latest - earliest) / earliest) * 1000) / 10 : 0

  return {
    hasData: true,
    latest: round2(latest),
    earliest: round2(earliest),
    low: round2(low),
    high: round2(high),
    average: round2(average),
    changePercent,
    totalCredits,
  }
}

/**
 * Judge an asking price against what has actually traded.
 *
 * Deliberately conservative: with fewer than 3 trading days of history there
 * isn't enough signal to tell a buyer anything, so it returns 'unknown' rather
 * than a confident-looking verdict built on one data point.
 *
 * @param {number} askingPrice price per credit being offered
 * @param {Array} series output of get*PriceHistory
 * @returns {{verdict:'below'|'fair'|'above'|'unknown', deltaPercent:number, average:number}}
 */
export function comparePriceToMarket(askingPrice, series = []) {
  const price = Number(askingPrice) || 0
  const summary = summarizePriceSeries(series)
  const tradingDays = (series || []).filter((p) => p && p.vwap > 0).length

  if (price <= 0 || !summary.hasData || tradingDays < 3) {
    return { verdict: 'unknown', deltaPercent: 0, average: summary.average }
  }

  const deltaPercent = Math.round(((price - summary.average) / summary.average) * 1000) / 10

  // ±10% of the volume-weighted average reads as "normal" rather than notable.
  let verdict = 'fair'
  if (deltaPercent < -10) verdict = 'below'
  else if (deltaPercent > 10) verdict = 'above'

  return { verdict, deltaPercent, average: summary.average }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}
