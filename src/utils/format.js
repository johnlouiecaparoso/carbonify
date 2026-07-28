/**
 * Canonical display formatters.
 *
 * Closes DEFERRED_BACKLOG #9. Before this module the same helpers were
 * re-declared per view — `peso()` × 15, `shortDate()` × 11, `round2()` × 10,
 * `num()` × 10, `formatCurrency()` × 5 — and they had drifted apart, so the
 * same amount rendered differently depending on which screen you were on.
 *
 * Three of the divergences were real, not cosmetic:
 *
 *  - `BuyerDashboardView` omitted `minimumFractionDigits`, so a balance
 *    rendered `₱1,234.5` — one decimal place, on money.
 *  - `FinanceConsoleView` passed `undefined` as the locale, so digit grouping
 *    followed the viewer's browser locale rather than en-PH.
 *  - `SubmitProjectView` used no fraction digits at all.
 *
 * The first two are fixed by adopting `peso()`. The third is DELIBERATE and is
 * preserved as `pesoWhole()` — CAPEX/OPEX are large capital figures where
 * trailing `.00` is noise. `pesoCode()` is likewise deliberate: a VAT invoice
 * is a tax document and carries the ISO code `PHP`, not the `₱` glyph.
 *
 * If you need a variant, add it here with a comment saying why, rather than
 * re-declaring a local one — that is exactly how the drift above happened.
 */

const PH_LOCALE = 'en-PH'
const TWO_DP = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

/** `₱1,234.50` — the default for money anywhere in the UI. */
export function peso(n) {
  return `₱${Number(n || 0).toLocaleString(PH_LOCALE, TWO_DP)}`
}

/**
 * `PHP 1,234.50` — ISO currency code instead of the glyph.
 * For tax documents (VAT invoices), where the code is the correct form.
 */
export function pesoCode(n) {
  return `PHP ${Number(n || 0).toLocaleString(PH_LOCALE, TWO_DP)}`
}

/**
 * `₱5,000,000` — no decimals.
 * For large capital figures (CAPEX/OPEX) where `.00` is noise.
 */
export function pesoWhole(n) {
  return `₱${Number(n || 0).toLocaleString(PH_LOCALE)}`
}

/** `1,234` — a plain grouped integer (credits, counts). */
export function num(n) {
  return Number(n || 0).toLocaleString(PH_LOCALE)
}

/** Round to 2 decimal places, returning a Number (not a string). */
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * `12.5%` from a FRACTION (0.125 → `12.5%`), em dash when null/undefined.
 * Scaling by 100 here matches how every caller in the app already stores
 * ratios; passing an already-scaled 12.5 would render `1250.0%`.
 */
export function pct(v, digits = 1) {
  return v == null ? '—' : `${(v * 100).toFixed(digits)}%`
}

/** `28 Jul 2026`, or an em dash when absent. */
export function shortDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(PH_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** `28 Jul 2026, 1:05 PM`, or an em dash when absent. */
export function dateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(PH_LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
}
