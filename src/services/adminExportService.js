/**
 * Admin CSV exports — role-needs #3, and the export half of #9.
 *
 * Admin had search and filters but no way to get anything off the screen: an
 * auditor or regulator asking for records got a screenshot. Reporting is listed
 * as a core admin duty, and it was the one part of it with no implementation at
 * all.
 *
 * `toCsv` from esgReportService is the canonical serialiser in this codebase;
 * this module follows the same convention as lguReportService (import toCsv,
 * keep a local triggerDownload).
 *
 * The row builders are pure so the shape of an exported file can be asserted in
 * tests without a DOM.
 */
import { toCsv } from '@/services/esgReportService'

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

/** `carbonify-<kind>-YYYY-MM-DD.csv` */
export function exportFilename(kind, now = new Date()) {
  return `carbonify-${kind}-${now.toISOString().slice(0, 10)}.csv`
}

const AUDIT_COLUMNS = [
  { key: 'timestamp', header: 'Timestamp' },
  { key: 'action', header: 'Action' },
  { key: 'user', header: 'User' },
  { key: 'user_id', header: 'User ID' },
  { key: 'resource_type', header: 'Resource type' },
  { key: 'resource_id', header: 'Resource ID' },
  { key: 'metadata', header: 'Metadata' },
]

/**
 * Flatten audit rows for CSV.
 *
 * Exports whatever the admin is currently looking at, filters included — an
 * investigation usually wants the narrowed set, not the whole table.
 *
 * Pure — exported for unit testing.
 */
export function auditLogsToRows(logs = []) {
  return (logs || []).map((log) => ({
    timestamp: log.created_at || '',
    action: log.action || log.action_type || '',
    user: log.user_name || '',
    user_id: log.user_id || '',
    resource_type: log.resource_type || '',
    resource_id: log.resource_id || '',
    // Serialised rather than dropped: the metadata is often the only record of
    // WHAT changed, which is the point of an audit export.
    metadata: log.metadata ? JSON.stringify(log.metadata) : '',
  }))
}

/** Download the given audit rows as CSV. */
export function exportAuditLogsCsv(logs = []) {
  const csv = toCsv(auditLogsToRows(logs), AUDIT_COLUMNS)
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), exportFilename('audit-logs'))
  return logs.length
}

const TRANSACTION_COLUMNS = [
  { key: 'date', header: 'Date' },
  { key: 'transaction_id', header: 'Transaction ID' },
  { key: 'buyer', header: 'Buyer' },
  { key: 'seller', header: 'Seller' },
  { key: 'quantity', header: 'Credits' },
  { key: 'gross', header: 'Gross' },
  { key: 'fee', header: 'Platform fee' },
  { key: 'net', header: 'Seller net' },
  { key: 'status', header: 'Status' },
]

/**
 * Flatten finance transactions for CSV.
 *
 * Field names differ across the admin finance views (some rows carry
 * `total_amount`, others `amount`), so each column falls back rather than
 * exporting blanks that would read as zero.
 *
 * Pure — exported for unit testing.
 */
export function transactionsToRows(transactions = []) {
  return (transactions || []).map((t) => {
    const gross = Number(t.total_amount ?? t.amount ?? 0)
    const fee = Number(t.platform_fee ?? t.fee ?? 0)
    return {
      date: t.created_at || '',
      transaction_id: t.id || '',
      buyer: t.buyer_name || t.buyer_id || '',
      seller: t.seller_name || t.seller_id || '',
      quantity: Number(t.quantity ?? 0),
      gross,
      fee,
      // Prefer the recorded net; only derive it when absent, so an export never
      // disagrees with the ledger over a rounding difference.
      net: t.seller_net != null ? Number(t.seller_net) : gross - fee,
      status: t.status || '',
    }
  })
}

/** Download the given transactions as CSV. */
export function exportTransactionsCsv(transactions = []) {
  const csv = toCsv(transactionsToRows(transactions), TRANSACTION_COLUMNS)
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    exportFilename('transactions'),
  )
  return transactions.length
}
