/**
 * LGU ESG report — emissions trend series + CSV/PDF export.
 *
 * Builds on the saved `lgu_emissions_records` (see lguService) and reuses the
 * canonical CSV serializer from esgReportService and the jsPDF pattern from the
 * buyer ESG report, so a city can hand a council/regulator a real document.
 */
import { toCsv } from '@/services/esgReportService'
import { buildEsgSummary } from '@/services/lguService'

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

/**
 * Group records into an ordered period series for charting. Periods are summed
 * (a city may have several records per period) and sorted by their label, which
 * is typically "2026" / "2026 Q1" and therefore sorts chronologically.
 * @returns {{ labels: string[], avoided: number[], net: number[], generated: number[] }}
 */
const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

/**
 * Sortable key for a free-text period label.
 *
 * period_label is whatever the LGU typed. Sorting the raw strings put
 * "Apr 2026" before "Jan 2026", so a city labelling by month saw its trend
 * plotted in alphabetical order. This pulls out a year and, where present, a
 * quarter or month, and falls back to the raw string only when neither is
 * recognisable — so mixed or unlabelled data still groups predictably instead
 * of throwing.
 *
 * Pure — exported for unit testing.
 */
export function periodSortKey(label) {
  const s = String(label || '').trim().toLowerCase()
  const year = s.match(/\b(19|20)\d{2}\b/)
  if (!year) return { year: Infinity, sub: Infinity, raw: s }

  const quarter = s.match(/\bq([1-4])\b/)
  if (quarter) return { year: Number(year[0]), sub: Number(quarter[1]), raw: s }

  const monthIndex = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(s))
  // Months are spaced past quarters so a mixed set never interleaves them.
  if (monthIndex !== -1) return { year: Number(year[0]), sub: 10 + monthIndex, raw: s }

  // A bare year sorts before any of its sub-periods.
  return { year: Number(year[0]), sub: -1, raw: s }
}

/** Chronological comparator over period labels. */
export function comparePeriods(a, b) {
  const ka = periodSortKey(a)
  const kb = periodSortKey(b)
  if (ka.year !== kb.year) return ka.year - kb.year
  if (ka.sub !== kb.sub) return ka.sub - kb.sub
  return ka.raw.localeCompare(kb.raw)
}

export function buildEmissionsTrend(records = []) {
  const buckets = new Map()
  for (const r of records) {
    const key = r.period_label || 'Unlabeled'
    const b = buckets.get(key) || { avoided: 0, net: 0, generated: 0 }
    b.avoided += Number(r.avoided_emissions_tco2e) || 0
    b.net += Number(r.net_emissions_tco2e) || 0
    b.generated += Number(r.waste_generated_tonnes) || 0
    buckets.set(key, b)
  }
  const labels = [...buckets.keys()].sort(comparePeriods)
  return {
    labels,
    avoided: labels.map((l) => buckets.get(l).avoided),
    net: labels.map((l) => buckets.get(l).net),
    generated: labels.map((l) => buckets.get(l).generated),
  }
}

/** Chart.js dataset for the emissions trend (avoided vs net over periods). */
export function emissionsTrendChartData(records = []) {
  const t = buildEmissionsTrend(records)
  return {
    labels: t.labels,
    datasets: [
      {
        label: 'Emissions avoided (tCO₂e)',
        data: t.avoided,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Net emissions (tCO₂e)',
        data: t.net,
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
}

const CSV_COLUMNS = [
  { key: 'municipality', header: 'Municipality' },
  { key: 'period_label', header: 'Period' },
  { key: 'population', header: 'Population' },
  { key: 'waste_generated_tonnes', header: 'Waste generated (t)' },
  { key: 'waste_diverted_tonnes', header: 'Waste diverted (t)' },
  { key: 'baseline_emissions_tco2e', header: 'Baseline (tCO2e)' },
  { key: 'avoided_emissions_tco2e', header: 'Avoided (tCO2e)' },
  { key: 'net_emissions_tco2e', header: 'Net (tCO2e)' },
  { key: 'notes', header: 'Notes' },
]

/** Download the records as a CSV. */
export function exportLguEsgCsv(records = [], { municipality = 'lgu' } = {}) {
  const csv = toCsv(records, CSV_COLUMNS)
  const safe = String(municipality || 'lgu').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `carbonify-lgu-esg-${safe}.csv`)
}

/** Download a formatted city ESG PDF (summary + per-period table). */
export async function exportLguEsgPdf(records = [], { municipality = '' } = {}) {
  const jsPDF = (await import('jspdf')).default
  const doc = new jsPDF()
  const summary = buildEsgSummary(records)
  const trend = buildEmissionsTrend(records)
  const fmt = (n) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })

  doc.setFontSize(18)
  doc.text('Carbonify — City ESG Report', 14, 20)
  doc.setFontSize(10)
  doc.text(`Local Government Unit: ${municipality || '—'}`, 14, 28)

  doc.setFontSize(12)
  doc.text('Summary', 14, 42)
  doc.setFontSize(10)
  const lines = [
    `Records: ${summary.recordCount}`,
    `Total waste generated: ${fmt(summary.generated)} t`,
    `Total waste diverted: ${fmt(summary.diverted)} t`,
    `Overall diversion rate: ${summary.diversionRate.toFixed(1)}%`,
    `Total emissions avoided: ${fmt(summary.avoided)} tCO2e`,
    `Net emissions: ${fmt(summary.net)} tCO2e`,
  ]
  lines.forEach((line, i) => doc.text(line, 14, 50 + i * 7))

  let y = 50 + lines.length * 7 + 10
  doc.setFontSize(12)
  doc.text('By Period', 14, y)
  y += 8
  doc.setFontSize(10)
  doc.text('Period', 14, y)
  doc.text('Avoided (tCO2e)', 70, y)
  doc.text('Net (tCO2e)', 130, y)
  y += 6
  trend.labels.forEach((label, i) => {
    if (y > 280) {
      doc.addPage()
      y = 20
    }
    doc.text(String(label), 14, y)
    doc.text(fmt(trend.avoided[i]), 70, y)
    doc.text(fmt(trend.net[i]), 130, y)
    y += 6
  })

  if (trend.labels.length === 0) {
    doc.text('No records yet.', 14, y)
  }

  const safe = String(municipality || 'lgu').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`carbonify-lgu-esg-${safe}.pdf`)
}
