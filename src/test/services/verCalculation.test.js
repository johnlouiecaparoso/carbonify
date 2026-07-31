import { describe, it, expect } from 'vitest'
import { buildVerCalculation } from '@/services/monitoringService'

/**
 * buildVerCalculation reproduces calculate_report_vers() (20260604010000):
 *   sum(activity.value * factor.factor)
 * joined on metric_key for the project's type. The join is INNER server-side,
 * so an activity metric with no matching factor contributes nothing.
 */
const factors = [
  { metric_key: 'biochar_tonnes', label: 'Biochar produced', unit: 'tonnes', factor: 2.5 },
  { metric_key: 'briquettes_tonnes', label: 'Bio-briquettes produced', unit: 'tonnes', factor: 1.5 },
]

describe('buildVerCalculation', () => {
  it('returns an empty result for no activity', () => {
    expect(buildVerCalculation({ activity: [], factors })).toEqual({
      lines: [],
      total: 0,
      unmatched: 0,
    })
    expect(buildVerCalculation()).toEqual({ lines: [], total: 0, unmatched: 0 })
  })

  it('multiplies each metric by its factor', () => {
    const result = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: 40, unit: 'tonnes' }],
      factors,
    })
    expect(result.lines[0].subtotal).toBe(100)
    expect(result.lines[0].factor).toBe(2.5)
    expect(result.total).toBe(100)
  })

  it('sums across metrics, reproducing the stored proposed_vers', () => {
    const result = buildVerCalculation({
      activity: [
        { metric_key: 'biochar_tonnes', value: 40 },
        { metric_key: 'briquettes_tonnes', value: 10 },
      ],
      factors,
    })
    // 40 * 2.5 + 10 * 1.5 = 115
    expect(result.total).toBe(115)
    expect(result.unmatched).toBe(0)
  })

  it('contributes nothing for a metric with no factor, and flags it', () => {
    const result = buildVerCalculation({
      activity: [
        { metric_key: 'biochar_tonnes', value: 40 },
        { metric_key: 'mystery_metric', value: 9999 },
      ],
      factors,
    })
    expect(result.total).toBe(100)
    expect(result.unmatched).toBe(1)

    const orphan = result.lines.find((l) => l.metricKey === 'mystery_metric')
    expect(orphan.matched).toBe(false)
    expect(orphan.subtotal).toBe(0)
    expect(orphan.factor).toBeNull()
    // Still surfaced as a line — a metric silently worth nothing is exactly
    // what the verifier needs to see.
    expect(result.lines).toHaveLength(2)
  })

  it('prefers the factor label over the raw metric key', () => {
    const result = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: 1 }],
      factors,
    })
    expect(result.lines[0].label).toBe('Biochar produced')
  })

  it('falls back to the metric key when there is no factor label', () => {
    const result = buildVerCalculation({
      activity: [{ metric_key: 'unknown_key', value: 1 }],
      factors,
    })
    expect(result.lines[0].label).toBe('unknown_key')
  })

  it('takes the unit from the activity row, falling back to the factor', () => {
    const [withUnit] = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: 1, unit: 'kg' }],
      factors,
    }).lines
    expect(withUnit.unit).toBe('kg')

    const [withoutUnit] = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: 1 }],
      factors,
    }).lines
    expect(withoutUnit.unit).toBe('tonnes')
  })

  it('treats missing or non-numeric values as zero', () => {
    const result = buildVerCalculation({
      activity: [
        { metric_key: 'biochar_tonnes' },
        { metric_key: 'biochar_tonnes', value: null },
        { metric_key: 'biochar_tonnes', value: 'abc' },
      ],
      factors,
    })
    expect(result.total).toBe(0)
  })

  it('accepts numeric strings, as PostgREST returns numerics', () => {
    const result = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: '40' }],
      factors: [{ metric_key: 'biochar_tonnes', factor: '2.5' }],
    })
    expect(result.total).toBe(100)
  })

  it('counts every metric as unmatched when no factors exist for the type', () => {
    const result = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: 40 }],
      factors: [],
    })
    expect(result.total).toBe(0)
    expect(result.unmatched).toBe(1)
  })

  it('avoids floating-point noise in the total', () => {
    const result = buildVerCalculation({
      activity: [
        { metric_key: 'a', value: 0.1 },
        { metric_key: 'a', value: 0.2 },
      ],
      factors: [{ metric_key: 'a', factor: 1 }],
    })
    expect(result.total).toBe(0.3)
  })

  it('ignores factor rows with no metric key', () => {
    const result = buildVerCalculation({
      activity: [{ metric_key: 'biochar_tonnes', value: 40 }],
      factors: [{ label: 'orphan factor', factor: 99 }, ...factors],
    })
    expect(result.total).toBe(100)
  })
})
