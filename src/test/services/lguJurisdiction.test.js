import { describe, it, expect } from 'vitest'
import {
  normalizeJurisdiction,
  inJurisdiction,
  summariseJurisdictionProjects,
} from '@/services/endorsementService'
import { periodSortKey, comparePeriods, buildEmissionsTrend } from '@/services/lguReportService'
import { normalizeDocuments } from '@/services/lguService'

describe('normalizeJurisdiction', () => {
  it('trims, case-folds and collapses whitespace', () => {
    expect(normalizeJurisdiction('  Cabanatuan   City ')).toBe('cabanatuan city')
    expect(normalizeJurisdiction('CABANATUAN CITY')).toBe('cabanatuan city')
  })

  it('returns null for empty input', () => {
    expect(normalizeJurisdiction('')).toBeNull()
    expect(normalizeJurisdiction('   ')).toBeNull()
    expect(normalizeJurisdiction(null)).toBeNull()
    expect(normalizeJurisdiction(undefined)).toBeNull()
  })
})

describe('inJurisdiction', () => {
  it('matches the same municipality regardless of spacing or case', () => {
    expect(inJurisdiction('Cabanatuan City', 'cabanatuan  city')).toBe(true)
  })

  it('rejects a different municipality', () => {
    expect(inJurisdiction('Davao City', 'Cabanatuan City')).toBe(false)
  })

  it('fails OPEN when either side is undeclared', () => {
    // Every LGU account predates the jurisdiction column; enforcing on a null
    // would lock out every existing user on deploy.
    expect(inJurisdiction('Davao City', null)).toBe(true)
    expect(inJurisdiction(null, 'Cabanatuan City')).toBe(true)
    expect(inJurisdiction(null, null)).toBe(true)
    expect(inJurisdiction('', '')).toBe(true)
  })
})

describe('summariseJurisdictionProjects', () => {
  const projects = [
    { status: 'validated', estimated_credits: 100, my_endorsement: { decision: 'endorsed' } },
    { status: 'approved', estimated_credits: 50 },
    { status: 'pending', estimated_credits: 10 },
    { status: 'in_review', estimated_credits: 5 },
    { status: 'needs_revision', estimated_credits: 1 },
    { status: 'rejected', estimated_credits: 999 },
  ]

  it('counts an empty jurisdiction as all zeroes', () => {
    expect(summariseJurisdictionProjects([])).toEqual({
      total: 0, validated: 0, inReview: 0, rejected: 0, endorsedByMe: 0, estimatedCredits: 0,
    })
    expect(summariseJurisdictionProjects().total).toBe(0)
  })

  it('buckets statuses, treating approved as validated', () => {
    const s = summariseJurisdictionProjects(projects)
    expect(s.total).toBe(6)
    expect(s.validated).toBe(2)
    expect(s.inReview).toBe(3)
    expect(s.rejected).toBe(1)
  })

  it('counts only endorsements, not declines', () => {
    const s = summariseJurisdictionProjects([
      { status: 'validated', my_endorsement: { decision: 'endorsed' } },
      { status: 'validated', my_endorsement: { decision: 'declined' } },
      { status: 'validated' },
    ])
    expect(s.endorsedByMe).toBe(1)
  })

  it('sums estimated credits across every status', () => {
    expect(summariseJurisdictionProjects(projects).estimatedCredits).toBe(1165)
  })
})

describe('periodSortKey / comparePeriods', () => {
  it('orders months chronologically, not alphabetically', () => {
    // The bug: localeCompare put "Apr 2026" before "Jan 2026".
    const labels = ['Mar 2026', 'Jan 2026', 'Dec 2026', 'Feb 2026', 'Apr 2026']
    expect([...labels].sort(comparePeriods)).toEqual([
      'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'Dec 2026',
    ])
  })

  it('orders quarters within a year', () => {
    const labels = ['2026 Q3', '2026 Q1', '2026 Q4', '2026 Q2']
    expect([...labels].sort(comparePeriods)).toEqual(['2026 Q1', '2026 Q2', '2026 Q3', '2026 Q4'])
  })

  it('orders across years first', () => {
    expect(['2026 Q1', '2025 Q4'].sort(comparePeriods)).toEqual(['2025 Q4', '2026 Q1'])
  })

  it('sorts a bare year before its own sub-periods', () => {
    expect(['2026 Q1', '2026'].sort(comparePeriods)).toEqual(['2026', '2026 Q1'])
  })

  it('never interleaves quarters and months of the same year', () => {
    const sorted = ['Feb 2026', '2026 Q4', 'Jan 2026', '2026 Q1'].sort(comparePeriods)
    expect(sorted.slice(0, 2)).toEqual(['2026 Q1', '2026 Q4'])
    expect(sorted.slice(2)).toEqual(['Jan 2026', 'Feb 2026'])
  })

  it('pushes unrecognisable labels to the end rather than throwing', () => {
    const sorted = ['Unlabeled', '2026 Q1'].sort(comparePeriods)
    expect(sorted).toEqual(['2026 Q1', 'Unlabeled'])
    expect(periodSortKey('Unlabeled').year).toBe(Infinity)
    expect(() => comparePeriods(null, undefined)).not.toThrow()
  })
})

describe('buildEmissionsTrend', () => {
  it('sums several records in the same period', () => {
    const t = buildEmissionsTrend([
      { period_label: '2026 Q1', avoided_emissions_tco2e: 10, net_emissions_tco2e: 5, waste_generated_tonnes: 1 },
      { period_label: '2026 Q1', avoided_emissions_tco2e: 15, net_emissions_tco2e: 5, waste_generated_tonnes: 2 },
    ])
    expect(t.labels).toEqual(['2026 Q1'])
    expect(t.avoided).toEqual([25])
    expect(t.net).toEqual([10])
  })

  it('emits periods in chronological order', () => {
    const t = buildEmissionsTrend([
      { period_label: 'Mar 2026', avoided_emissions_tco2e: 3 },
      { period_label: 'Jan 2026', avoided_emissions_tco2e: 1 },
    ])
    expect(t.labels).toEqual(['Jan 2026', 'Mar 2026'])
    expect(t.avoided).toEqual([1, 3])
  })

  it('buckets unlabelled records together', () => {
    const t = buildEmissionsTrend([{ avoided_emissions_tco2e: 1 }, { avoided_emissions_tco2e: 2 }])
    expect(t.labels).toEqual(['Unlabeled'])
    expect(t.avoided).toEqual([3])
  })
})

describe('normalizeDocuments', () => {
  it('keeps only renderable fields', () => {
    const [doc] = normalizeDocuments([
      { name: 'log.pdf', type: 'application/pdf', size: 100, url: 'data:...', junk: 'dropped' },
    ])
    expect(Object.keys(doc).sort()).toEqual(['name', 'size', 'type', 'uploaded_at', 'url'])
    expect(doc.junk).toBeUndefined()
  })

  it('drops entries with no url', () => {
    expect(normalizeDocuments([{ name: 'a.pdf' }, null, { url: '' }])).toEqual([])
  })

  it('defaults a missing name and size', () => {
    const [doc] = normalizeDocuments([{ url: 'data:x' }])
    expect(doc.name).toBe('document')
    expect(doc.size).toBe(0)
    expect(doc.uploaded_at).toBeTruthy()
  })

  it('returns an empty array for non-array input', () => {
    expect(normalizeDocuments(null)).toEqual([])
    expect(normalizeDocuments('nope')).toEqual([])
    expect(normalizeDocuments()).toEqual([])
  })
})
