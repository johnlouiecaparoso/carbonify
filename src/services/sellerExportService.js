/**
 * Seller data export — the developer's side of the accounting story.
 *
 * Buyers can export an ESG report from their portfolio, LGUs can export a city
 * ESG report, and admins can export audit logs and transactions. A project
 * developer — the party actually RECEIVING money — had no export at all: their
 * sales existed only as an on-screen table. That is a problem for anyone who has
 * to file with an accountant or reconcile against a registry, which is every
 * real seller on the platform.
 *
 * Follows the convention set by lguReportService and adminExportService: import
 * the canonical `toCsv` from esgReportService, keep a local triggerDownload.
 *
 * The row builders are pure so the money columns can be unit-tested without a
 * DOM or a database.
 */

import { toCsv } from '@/services/esgReportService'
import { netOf } from '@/services/payoutService'

function triggerDownload(blob, filename) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** `carbonify-sales-2026-07-26.csv` — dated so successive exports do not collide. */
export function exportFilename(kind, now = new Date()) {
  const stamp = now.toISOString().slice(0, 10)
  return `carbonify-${kind}-${stamp}.csv`
}

/** Money to a fixed 2dp string: a spreadsheet should not have to guess. */
function money(n) {
  return (Number(n) || 0).toFixed(2)
}

function isoDay(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const SALE_COLUMNS = [
  { key: 'date', header: 'Date' },
  { key: 'sale_id', header: 'Sale ID' },
  { key: 'credits', header: 'Credits' },
  { key: 'unit_price', header: 'Unit price' },
  { key: 'gross', header: 'Gross' },
  { key: 'platform_fee', header: 'Platform fee' },
  { key: 'net', header: 'Net to seller' },
  { key: 'currency', header: 'Currency' },
  { key: 'status', header: 'Status' },
]

/**
 * One row per sale, including the fee and the net.
 *
 * Every sale is exported, not just completed ones — a refunded or pending row
 * is exactly what an accountant needs to see to explain a gap, and hiding it
 * would make the export disagree with the page it was downloaded from. The
 * status column is what distinguishes them.
 *
 * @param {Array<object>} sales rows from payoutService.getMySales
 */
export function salesToRows(sales = []) {
  return (sales || []).map((s) => ({
    date: isoDay(s.completed_at || s.created_at),
    sale_id: s.id ?? '',
    credits: Number(s.quantity) || 0,
    unit_price: money(s.price_per_credit),
    gross: money(s.total_amount),
    platform_fee: money(s.transaction_fee),
    // Prefer the value the service already attached, but stay correct if a
    // caller hands over raw rows.
    net: money(s.net_amount ?? netOf(s)),
    currency: s.currency || 'PHP',
    status: s.status || '',
  }))
}

/** Download the seller's sales ledger as CSV. Returns the row count. */
export function exportSalesCsv(sales = []) {
  const rows = salesToRows(sales)
  const csv = toCsv(rows, SALE_COLUMNS)
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    exportFilename('sales'),
  )
  return rows.length
}

const PROJECT_COLUMNS = [
  { key: 'project', header: 'Project' },
  { key: 'sales', header: 'Sales' },
  { key: 'credits_sold', header: 'Credits sold' },
  { key: 'gross', header: 'Gross earned' },
  { key: 'platform_fees', header: 'Platform fees' },
  { key: 'net', header: 'Net earned' },
  { key: 'currency', header: 'Currency' },
  { key: 'last_sale', header: 'Last sale' },
]

/**
 * One row per project.
 *
 * @param {Array<object>} byProject rows from payoutService.getMySalesByProject
 */
export function salesByProjectToRows(byProject = []) {
  return (byProject || []).map((p) => ({
    project: p.projectTitle || 'Unknown Project',
    sales: Number(p.salesCount) || 0,
    credits_sold: Number(p.creditsSold) || 0,
    gross: money(p.grossEarnings),
    platform_fees: money(p.platformFees),
    net: money(p.netEarnings),
    currency: p.currency || 'PHP',
    last_sale: isoDay(p.lastSaleDate),
  }))
}

/** Download the per-project earnings breakdown as CSV. Returns the row count. */
export function exportSalesByProjectCsv(byProject = []) {
  const rows = salesByProjectToRows(byProject)
  const csv = toCsv(rows, PROJECT_COLUMNS)
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    exportFilename('earnings-by-project'),
  )
  return rows.length
}
