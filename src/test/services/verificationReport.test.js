import { describe, it, expect } from 'vitest'
import {
  buildVerificationReport,
  reportToCsvRows,
  reportSlug,
} from '@/services/verificationReportService'
import { CHECKLIST_ITEMS, REQUIRED_KEYS } from '@/constants/verificationChecklist'

const project = {
  id: 'p1',
  title: 'Cebu Mangrove Restoration',
  category: 'Blue Carbon',
  location: 'Cebu',
  methodology: 'Verra VM0033',
  created_at: '2026-07-01T09:00:00Z',
  status: 'validated',
  verified_at: '2026-07-10T15:00:00Z',
  verification_notes: 'Baseline verified against survey data.',
}

const fullChecklist = () => Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, 2]))

describe('reportSlug', () => {
  it('makes a filename-safe slug', () => {
    expect(reportSlug('Cebu Mangrove Restoration')).toBe('cebu-mangrove-restoration')
    expect(reportSlug('A/B: test!')).toBe('a-b-test')
  })

  it('falls back rather than producing an empty filename', () => {
    expect(reportSlug('')).toBe('project')
    expect(reportSlug('!!!')).toBe('project')
    expect(reportSlug(null)).toBe('project')
  })
})

describe('buildVerificationReport', () => {
  it('captures the project and the decision', () => {
    const report = buildVerificationReport({ project })
    expect(report.project.title).toBe('Cebu Mangrove Restoration')
    expect(report.project.methodology).toBe('Verra VM0033')
    expect(report.decision.label).toBe('Validated')
    expect(report.decision.notes).toBe('Baseline verified against survey data.')
  })

  it('labels the legacy approved status as validated', () => {
    const report = buildVerificationReport({ project: { ...project, status: 'approved' } })
    expect(report.decision.label).toBe('Validated')
  })

  it('includes every rubric item, assessed or not', () => {
    const report = buildVerificationReport({ project, checklist: {} })
    expect(report.rubric).toHaveLength(CHECKLIST_ITEMS.length)
    expect(report.rubric.every((r) => r.assessed === false)).toBe(true)
  })

  it('reports an unassessed item as null, never as a zero score', () => {
    // A zero would read as "assessed and failed", which is a different claim.
    const report = buildVerificationReport({ project, checklist: {} })
    expect(report.rubric.every((r) => r.score === null)).toBe(true)
  })

  it('distinguishes a genuine zero score from not assessed', () => {
    const key = CHECKLIST_ITEMS[0].key
    const report = buildVerificationReport({ project, checklist: { [key]: 0 } })
    const item = report.rubric.find((r) => r.key === key)
    expect(item.score).toBe(0)
    expect(item.assessed).toBe(true)
  })

  it('summarises required-item completion', () => {
    const complete = buildVerificationReport({ project, checklist: fullChecklist() })
    expect(complete.rubricSummary.requiredTotal).toBe(REQUIRED_KEYS.length)
    expect(complete.rubricSummary.requiredAssessed).toBe(REQUIRED_KEYS.length)
    expect(complete.rubricSummary.complete).toBe(true)

    const partial = buildVerificationReport({
      project,
      checklist: { [REQUIRED_KEYS[0]]: 2 },
    })
    expect(partial.rubricSummary.requiredAssessed).toBe(1)
    expect(partial.rubricSummary.complete).toBe(false)
  })

  it('embeds the timeline', () => {
    const report = buildVerificationReport({ project })
    expect(report.timeline.length).toBeGreaterThan(0)
    expect(report.timeline.some((e) => e.label === 'Submitted for review')).toBe(true)
  })

  it('survives an empty project', () => {
    const report = buildVerificationReport({})
    expect(report.project.title).toBe('Untitled Project')
    expect(report.decision.label).toBe('Unknown')
    expect(report.timeline).toEqual([])
  })
})

describe('reportToCsvRows', () => {
  const report = buildVerificationReport({ project, checklist: fullChecklist() })

  it('emits project, decision, rubric and timeline sections', () => {
    const sections = new Set(reportToCsvRows(report).map((r) => r.section))
    expect(sections).toEqual(new Set(['Project', 'Decision', 'Rubric', 'Timeline']))
  })

  it('emits one row per rubric item', () => {
    const rubricRows = reportToCsvRows(report).filter((r) => r.section === 'Rubric')
    expect(rubricRows).toHaveLength(CHECKLIST_ITEMS.length)
  })

  it('marks unassessed rubric items in words, not as a number', () => {
    const bare = buildVerificationReport({ project, checklist: {} })
    const rubricRows = reportToCsvRows(bare).filter((r) => r.section === 'Rubric')
    expect(rubricRows.every((r) => r.value === 'Not assessed')).toBe(true)
  })

  it('flags which rubric items are required', () => {
    const rows = reportToCsvRows(report).filter((r) => r.section === 'Rubric')
    expect(rows.filter((r) => r.detail === 'Required')).toHaveLength(REQUIRED_KEYS.length)
  })

  it('gives every row the four CSV columns', () => {
    for (const row of reportToCsvRows(report)) {
      expect(Object.keys(row).sort()).toEqual(['detail', 'item', 'section', 'value'])
    }
  })
})
