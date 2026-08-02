/**
 * The verifier's own decision record, as a file they can hand over.
 *
 * `verificationReportService` exports ONE project's assessment — the document
 * you attach to a single validation. This exports the OTHER shape: every
 * decision one verifier has made, which is what an accreditation body or an
 * internal QA review asks for. Neither substitutes for the other.
 *
 * Pure row builder + a thin download wrapper, matching the convention in the
 * other four export services.
 */
import { toCsv } from '@/services/esgReportService'
import { downloadBlob } from '@/utils/download'

const COLUMNS = [
  { key: 'decidedAt', header: 'Decided at (UTC)' },
  { key: 'decision', header: 'Decision' },
  { key: 'subjectType', header: 'Subject' },
  { key: 'subject', header: 'Project / report' },
  { key: 'subjectId', header: 'Reference' },
  { key: 'note', header: 'Note' },
]

/**
 * Shape decisions into export rows. Pure — unit-testable without a DOM.
 *
 * Timestamps are written as full ISO-8601 in UTC rather than a locale string:
 * this file is evidence, and "3/4/2026" is ambiguous to half the world.
 *
 * @param {Array<Object>} decisions from getMyVerificationDecisions()
 * @returns {Array<Object>}
 */
export function buildDecisionRows(decisions = []) {
  return (decisions || []).map((d) => ({
    decidedAt: d?.at ? new Date(d.at).toISOString() : '',
    decision: d?.label || '',
    subjectType: d?.kind === 'report' ? 'MRV report' : 'Project',
    subject: d?.projectTitle || '',
    subjectId: d?.resourceId || '',
    note: d?.note || '',
  }))
}

/** `carbonify-my-decisions-YYYY-MM-DD.csv` */
export function decisionsFilename(now = new Date()) {
  return `carbonify-my-decisions-${now.toISOString().slice(0, 10)}.csv`
}

/** Download the decision list as CSV. */
export function exportDecisionsCsv(decisions = []) {
  const csv = toCsv(buildDecisionRows(decisions), COLUMNS)
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), decisionsFilename())
  return csv
}
