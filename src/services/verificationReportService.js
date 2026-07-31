/**
 * Verification report export — role-needs #9.
 *
 * A verifier's decisions are defensible only if they can be handed to someone
 * else: DENR/CCC, an auditor, or the verifier's own file. Everything needed was
 * already stored (the rubric in verification_assessments, the decision on the
 * project, the history in audit_logs); none of it could leave the screen.
 *
 * buildVerificationReport is pure so the assembled document can be asserted in
 * tests without a database or a DOM. The export* helpers do the I/O.
 *
 * Follows the existing export convention: `toCsv` is the canonical serializer
 * (esgReportService) and each service keeps its own tiny triggerDownload, the
 * way lguReportService does.
 */
import { toCsv } from '@/services/esgReportService'
import { CHECKLIST_ITEMS, ITEM_BY_KEY } from '@/constants/verificationChecklist'
import { getAssessment, getProjectAuditTrail, buildProjectTimeline } from '@/services/verificationService'

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

/** A filename-safe slug of the project title. */
export function reportSlug(title) {
  const slug = String(title || 'project')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'project'
}

const DECISION_LABELS = {
  validated: 'Validated',
  approved: 'Validated',
  rejected: 'Rejected',
  needs_revision: 'Revision requested',
  in_review: 'Under review',
  under_review: 'Under review',
  submitted: 'Awaiting review',
  pending: 'Awaiting review',
  draft: 'Draft (not submitted)',
}

/**
 * Assemble everything a reviewer would need to justify the decision.
 *
 * Pure — exported for unit testing.
 *
 * @param {Object} input
 * @param {Object} input.project
 * @param {Object} [input.checklist] - key → score map from verification_assessments
 * @param {Array<Object>} [input.auditRows]
 * @returns {Object} the report document
 */
export function buildVerificationReport({ project, checklist = {}, auditRows = [] } = {}) {
  const rubric = CHECKLIST_ITEMS.map((item) => {
    const score = checklist?.[item.key]
    return {
      key: item.key,
      label: item.label,
      required: !!item.required,
      weight: item.weight,
      // An unassessed item is reported as such rather than as a zero, which
      // would read as "assessed and failed".
      score: score == null ? null : Number(score),
      assessed: score != null,
    }
  })

  const requiredItems = rubric.filter((r) => r.required)
  const assessedRequired = requiredItems.filter((r) => r.assessed)

  return {
    project: {
      id: project?.id || null,
      title: project?.title || 'Untitled Project',
      category: project?.category || null,
      location: project?.location || null,
      methodology: project?.methodology || null,
      developmentStatus: project?.development_status || null,
      submittedAt: project?.created_at || null,
    },
    decision: {
      status: project?.status || null,
      label: DECISION_LABELS[project?.status] || project?.status || 'Unknown',
      decidedAt: project?.verified_at || null,
      notes: project?.verification_notes || null,
    },
    rubric,
    rubricSummary: {
      requiredTotal: requiredItems.length,
      requiredAssessed: assessedRequired.length,
      complete: requiredItems.length > 0 && assessedRequired.length === requiredItems.length,
    },
    timeline: buildProjectTimeline({ project, auditRows }),
    generatedAt: new Date().toISOString(),
  }
}

/** Fetch the pieces and assemble the report for one project. */
export async function getVerificationReport(project) {
  if (!project?.id) throw new Error('Project is required')
  const [checklist, auditRows] = await Promise.all([
    getAssessment(project.id).catch(() => ({})),
    getProjectAuditTrail(project.id).catch(() => []),
  ])
  return buildVerificationReport({ project, checklist, auditRows })
}

/**
 * Flatten the report into CSV rows. One row per rubric item, then one per
 * timeline event, with a `section` column — a single sheet an auditor can read
 * top to bottom without needing several files.
 *
 * Pure — exported for unit testing.
 */
export function reportToCsvRows(report) {
  const rows = [
    { section: 'Project', item: 'Title', value: report.project.title, detail: '' },
    { section: 'Project', item: 'Category', value: report.project.category || '—', detail: '' },
    { section: 'Project', item: 'Location', value: report.project.location || '—', detail: '' },
    { section: 'Project', item: 'Methodology', value: report.project.methodology || '—', detail: '' },
    { section: 'Decision', item: 'Outcome', value: report.decision.label, detail: report.decision.notes || '' },
    { section: 'Decision', item: 'Decided at', value: report.decision.decidedAt || '—', detail: '' },
  ]

  for (const item of report.rubric) {
    rows.push({
      section: 'Rubric',
      item: item.label,
      value: item.assessed ? String(item.score) : 'Not assessed',
      detail: item.required ? 'Required' : 'Optional',
    })
  }

  for (const event of report.timeline) {
    rows.push({
      section: 'Timeline',
      item: event.label,
      value: event.at,
      detail: [event.actor, event.detail].filter(Boolean).join(' — '),
    })
  }

  return rows
}

const CSV_COLUMNS = [
  { key: 'section', header: 'Section' },
  { key: 'item', header: 'Item' },
  { key: 'value', header: 'Value' },
  { key: 'detail', header: 'Detail' },
]

/** Download the verification report as CSV. */
export async function exportVerificationReportCsv(project) {
  const report = await getVerificationReport(project)
  const csv = toCsv(reportToCsvRows(report), CSV_COLUMNS)
  triggerDownload(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    `carbonify-verification-${reportSlug(report.project.title)}.csv`,
  )
  return report
}

/** Download the verification report as a PDF (jsPDF, as certificatePdfService does). */
export async function exportVerificationReportPdf(project) {
  const report = await getVerificationReport(project)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const margin = 48
  const pageHeight = doc.internal.pageSize.getHeight()
  const width = doc.internal.pageSize.getWidth() - margin * 2
  let y = margin

  const line = (text, { size = 10, bold = false, gap = 14 } = {}) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    for (const chunk of doc.splitTextToSize(String(text ?? ''), width)) {
      // Paginate before writing, so a long rubric never runs off the page.
      if (y > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(chunk, margin, y)
      y += gap
    }
  }

  line('Verification Report', { size: 18, bold: true, gap: 24 })
  line(report.project.title, { size: 13, bold: true, gap: 20 })
  line(`Category: ${report.project.category || '—'}    Location: ${report.project.location || '—'}`)
  line(`Methodology: ${report.project.methodology || '—'}`)
  line(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, { gap: 22 })

  line('Decision', { size: 13, bold: true, gap: 18 })
  line(`Outcome: ${report.decision.label}`)
  if (report.decision.decidedAt) line(`Decided: ${new Date(report.decision.decidedAt).toLocaleString()}`)
  if (report.decision.notes) line(`Notes: ${report.decision.notes}`)
  y += 8

  line('Validation rubric', { size: 13, bold: true, gap: 18 })
  line(
    `${report.rubricSummary.requiredAssessed}/${report.rubricSummary.requiredTotal} required items assessed` +
      (report.rubricSummary.complete ? '' : ' — INCOMPLETE'),
    { gap: 18 },
  )
  for (const item of report.rubric) {
    const mark = item.assessed ? item.score : 'not assessed'
    line(`${item.required ? '*' : ' '} ${item.label}: ${mark}`)
  }
  y += 8

  line('Verification timeline', { size: 13, bold: true, gap: 18 })
  if (!report.timeline.length) {
    line('No recorded activity.')
  } else {
    for (const event of report.timeline) {
      const when = event.at ? new Date(event.at).toLocaleString() : '—'
      line(`${when} — ${event.label}${event.actor ? ` (by ${event.actor})` : ''}`)
      if (event.detail) line(`    ${event.detail}`, { size: 9 })
    }
  }

  doc.save(`carbonify-verification-${reportSlug(report.project.title)}.pdf`)
  return report
}

// Re-exported so a caller can label a score without importing the constants
// module separately.
export { ITEM_BY_KEY }
