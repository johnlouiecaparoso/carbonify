import { describe, it, expect } from 'vitest'
import { summariseDecisions } from '@/services/verificationService'
import { buildDecisionRows, decisionsFilename } from '@/services/verifierExportService'

/**
 * The verifier's decision record is the answer to "what did you validate, and
 * when?" — the first question an accreditation body asks. These pin the two
 * pure pieces of it: the counts shown on screen and the rows written to the
 * file that gets handed over.
 */

const decisions = [
  {
    id: 'a',
    at: '2026-03-04T09:15:00.000Z',
    action: 'project_validated',
    label: 'Validated',
    kind: 'project',
    resourceId: 'p1',
    projectTitle: 'Bamboo, Nueva Ecija',
    note: 'Boundary evidence complete.',
  },
  {
    id: 'b',
    at: '2026-01-20T02:00:00.000Z',
    action: 'project_rejected',
    label: 'Rejected',
    kind: 'project',
    resourceId: 'p2',
    projectTitle: 'Solar, Cebu',
    note: null,
  },
  {
    id: 'c',
    at: '2026-02-11T11:30:00.000Z',
    action: 'project_needs_revision',
    label: 'Revision requested',
    kind: 'project',
    resourceId: 'p3',
    projectTitle: 'Mangrove, Palawan',
    note: 'Baseline needs a source.',
  },
  {
    id: 'd',
    at: '2026-03-01T00:00:00.000Z',
    action: 'report_approved',
    label: 'MRV report approved',
    kind: 'report',
    resourceId: 'r1',
    projectTitle: 'Bamboo, Nueva Ecija',
    note: null,
  },
]

describe('summariseDecisions', () => {
  it('returns zeros and null bounds for no decisions', () => {
    expect(summariseDecisions([])).toEqual({
      total: 0,
      validated: 0,
      rejected: 0,
      revisions: 0,
      reports: 0,
      firstAt: null,
      lastAt: null,
    })
  })

  it('tolerates being called with nothing at all', () => {
    expect(summariseDecisions().total).toBe(0)
  })

  it('counts each decision type separately', () => {
    const s = summariseDecisions(decisions)
    expect(s.total).toBe(4)
    expect(s.validated).toBe(1)
    expect(s.rejected).toBe(1)
    expect(s.revisions).toBe(1)
    expect(s.reports).toBe(1)
  })

  it('reports the true date range regardless of input order', () => {
    // The list arrives newest-first from the service, but the range has to be
    // the earliest and latest decision — not the first and last array element.
    const s = summariseDecisions(decisions)
    expect(s.firstAt).toBe('2026-01-20T02:00:00.000Z')
    expect(s.lastAt).toBe('2026-03-04T09:15:00.000Z')
  })

  it('does not count an MRV approval as a project validation', () => {
    // Both are approvals; only one is a project decision, and conflating them
    // would overstate how many projects a verifier has passed.
    const s = summariseDecisions([decisions[3]])
    expect(s.reports).toBe(1)
    expect(s.validated).toBe(0)
  })
})

describe('buildDecisionRows', () => {
  it('writes timestamps as ISO-8601 UTC, not a locale string', () => {
    // This file is evidence. "3/4/2026" means March in one country and April in
    // another, and the reader is not necessarily in the verifier's.
    const [row] = buildDecisionRows([decisions[0]])
    expect(row.decidedAt).toBe('2026-03-04T09:15:00.000Z')
  })

  it('labels the subject type so a report is not mistaken for a project', () => {
    const rows = buildDecisionRows(decisions)
    expect(rows.map((r) => r.subjectType)).toEqual([
      'Project',
      'Project',
      'Project',
      'MRV report',
    ])
  })

  it('keeps the reference id, which is what makes a row checkable', () => {
    const rows = buildDecisionRows(decisions)
    expect(rows.map((r) => r.subjectId)).toEqual(['p1', 'p2', 'p3', 'r1'])
  })

  it('renders a missing note as an empty cell rather than "null"', () => {
    const [, rejected] = buildDecisionRows(decisions)
    expect(rejected.note).toBe('')
  })

  it('survives a malformed decision without dropping the rest', () => {
    const rows = buildDecisionRows([{}, decisions[0]])
    expect(rows).toHaveLength(2)
    expect(rows[0].decidedAt).toBe('')
    expect(rows[1].subject).toBe('Bamboo, Nueva Ecija')
  })

  it('returns nothing for nothing', () => {
    expect(buildDecisionRows([])).toEqual([])
    expect(buildDecisionRows()).toEqual([])
  })
})

describe('decisionsFilename', () => {
  it('is dated, so successive exports do not overwrite each other', () => {
    expect(decisionsFilename(new Date('2026-08-02T22:00:00Z'))).toBe(
      'carbonify-my-decisions-2026-08-02.csv',
    )
  })
})
