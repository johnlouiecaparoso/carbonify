import { creditOwnershipService } from '@/services/creditOwnershipService'
import { downloadBlob } from '@/utils/download'

/**
 * ESG / offset report (Phase 3).
 *
 * Aggregates a buyer's owned + retired carbon credits into a disclosure-ready
 * dataset and exports it as PDF (reusing jsPDF, like certificatePdfService) or
 * CSV. 1 credit = 1 tCO2e.
 *
 * buildEsgDataset / toCsv are pure and unit-tested; the export* helpers do the
 * browser download and are thin wrappers over them.
 */

const TONNES_PER_CREDIT = 1

function sum(records, key) {
  return records.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
}

function groupTotals(records, keyFn, qtyKey = 'quantity') {
  const map = new Map()
  for (const r of records) {
    const key = keyFn(r) || 'Unknown'
    map.set(key, (map.get(key) || 0) + (Number(r[qtyKey]) || 0))
  }
  return Array.from(map, ([label, credits]) => ({ label, credits, tco2e: credits * TONNES_PER_CREDIT }))
}

/**
 * Build the aggregated ESG dataset for a user.
 * @param {string} userId
 * @param {{ service?: object }} [deps]  inject a fake ownership service in tests.
 */
export async function buildEsgDataset(userId, { service = creditOwnershipService } = {}) {
  const [portfolio, history] = await Promise.all([
    service.getUserCreditPortfolio(userId),
    service.getUserTransactionHistory(userId, 1000),
  ])

  const owned = (portfolio || []).filter((p) => p.ownership_status !== 'retired')
  const retirements = (history || []).filter((t) => t.type === 'retirement')
  const purchases = (history || []).filter((t) => t.type === 'purchase')

  const ownedCredits = sum(owned, 'quantity')
  const retiredCredits = sum(retirements, 'quantity')
  const purchasedCredits = sum(purchases, 'quantity')

  return {
    generatedFor: userId,
    totals: {
      ownedCredits,
      retiredCredits,
      purchasedCredits,
      totalCredits: ownedCredits + retiredCredits,
      ownedTco2e: ownedCredits * TONNES_PER_CREDIT,
      retiredTco2e: retiredCredits * TONNES_PER_CREDIT,
    },
    byProject: groupTotals([...owned, ...retirements], (r) => r.project_title),
    byCategory: groupTotals([...owned, ...retirements], (r) => r.project_category),
    retirements,
    purchases,
  }
}

/**
 * Serialize rows to RFC-4180 CSV. `columns` is [{ key, header }].
 * (No CSV utility existed in the codebase; this is the canonical one.)
 */
export function toCsv(rows, columns) {
  const escape = (value) => {
    const s = String(value ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(',')).join('\r\n')
  return body ? `${header}\r\n${body}` : header
}

// The download itself now lives in utils/download.js — this file had the first
// copy of it, and seven more had grown alongside, all revoking the object URL
// in the same tick as the click. See that file's header.

/** Download the ESG report as CSV (one row per project). */
export async function exportEsgReportCsv(userId, deps) {
  const data = await buildEsgDataset(userId, deps)
  const csv = toCsv(data.byProject, [
    { key: 'label', header: 'Project' },
    { key: 'credits', header: 'Credits' },
    { key: 'tco2e', header: 'tCO2e' },
  ])
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `carbonify-esg-report-${userId}.csv`)
  return data
}

/** Download the ESG report as a PDF (reuses jsPDF, like certificatePdfService). */
export async function exportEsgReportPdf(userId, deps) {
  const data = await buildEsgDataset(userId, deps)
  const jsPDF = (await import('jspdf')).default
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text('Carbonify — ESG / Carbon Offset Report', 14, 20)
  doc.setFontSize(10)
  doc.text(`Account: ${userId}`, 14, 28)

  doc.setFontSize(12)
  doc.text('Summary', 14, 42)
  doc.setFontSize(10)
  const t = data.totals
  const summary = [
    `Credits owned: ${t.ownedCredits} (${t.ownedTco2e} tCO2e)`,
    `Credits retired: ${t.retiredCredits} (${t.retiredTco2e} tCO2e)`,
    `Credits purchased (lifetime): ${t.purchasedCredits}`,
    `Total credits held + retired: ${t.totalCredits}`,
  ]
  summary.forEach((line, i) => doc.text(line, 14, 50 + i * 7))

  let y = 50 + summary.length * 7 + 10
  doc.setFontSize(12)
  doc.text('By Project', 14, y)
  y += 8
  doc.setFontSize(10)
  data.byProject.forEach((row) => {
    if (y > 280) {
      doc.addPage()
      y = 20
    }
    doc.text(`${row.label}: ${row.credits} credits (${row.tco2e} tCO2e)`, 14, y)
    y += 7
  })

  doc.save(`carbonify-esg-report-${userId}.pdf`)
  return data
}
