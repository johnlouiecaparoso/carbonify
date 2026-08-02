import { describe, it, expect } from 'vitest'
import { computeConcentration } from '@/services/portfolioAnalytics'

/**
 * Concentration is the one figure on the analytics page a buyer cannot read off
 * their portfolio by eye, and it is the one a disclosure reviewer asks for. It
 * carries a verdict word ("Concentrated"), so the arithmetic behind that word
 * has to be right — an understated share is a buyer told their exposure is
 * spread when it is not.
 */

const holdings = [
  { quantity: 60, project_id: 'p1', project_title: 'Bamboo', project_category: 'Forestry' },
  { quantity: 20, project_id: 'p2', project_title: 'Solar', project_category: 'Renewable' },
  { quantity: 20, project_id: 'p3', project_title: 'Mangrove', project_category: 'Blue Carbon' },
]

describe('computeConcentration', () => {
  it('reports an explicit empty state rather than zeros that look measured', () => {
    const c = computeConcentration([])
    expect(c.totalCredits).toBe(0)
    expect(c.rating).toBe('none')
    expect(c.topProjects).toEqual([])
  })

  it('tolerates being called with nothing', () => {
    expect(computeConcentration().totalCredits).toBe(0)
  })

  it('computes shares out of the total held', () => {
    const c = computeConcentration(holdings)
    expect(c.totalCredits).toBe(100)
    expect(c.largestShare).toBe(60)
    expect(c.topThreeShare).toBe(100)
    expect(c.projectCount).toBe(3)
    expect(c.categoryCount).toBe(3)
  })

  it('sums repeat purchases of the same project before computing a share', () => {
    // The defect this guards: five separate buys of one project rendering as
    // five 20% holdings, i.e. a concentrated portfolio reported as diversified.
    const repeated = [
      { quantity: 20, project_id: 'p1', project_title: 'Bamboo' },
      { quantity: 20, project_id: 'p1', project_title: 'Bamboo' },
      { quantity: 20, project_id: 'p1', project_title: 'Bamboo' },
      { quantity: 20, project_id: 'p1', project_title: 'Bamboo' },
      { quantity: 20, project_id: 'p2', project_title: 'Solar' },
    ]
    const c = computeConcentration(repeated)
    expect(c.projectCount).toBe(2)
    expect(c.largestShare).toBe(80)
    expect(c.rating).toBe('concentrated')
  })

  it('excludes retired credits — they are spent, not exposure', () => {
    const c = computeConcentration([
      ...holdings,
      { quantity: 500, project_id: 'p9', project_title: 'Retired', ownership_status: 'retired' },
      { quantity: 500, project_id: 'p8', project_title: 'Also retired', ownership_type: 'retired' },
    ])
    expect(c.totalCredits).toBe(100)
    expect(c.projectCount).toBe(3)
  })

  it('ignores zero and negative quantities', () => {
    const c = computeConcentration([...holdings, { quantity: 0, project_id: 'z' }, { quantity: -5, project_id: 'y' }])
    expect(c.totalCredits).toBe(100)
    expect(c.projectCount).toBe(3)
  })

  it('rates a single-project portfolio as concentrated', () => {
    const c = computeConcentration([{ quantity: 10, project_id: 'only', project_title: 'Only' }])
    expect(c.largestShare).toBe(100)
    expect(c.hhi).toBe(10000)
    expect(c.rating).toBe('concentrated')
  })

  it('rates a well-spread portfolio as diversified', () => {
    // Ten equal holdings → HHI 1000, comfortably under the 1500 band.
    const spread = Array.from({ length: 10 }, (_, i) => ({
      quantity: 10,
      project_id: `p${i}`,
      project_title: `Project ${i}`,
    }))
    const c = computeConcentration(spread)
    expect(c.hhi).toBe(1000)
    expect(c.rating).toBe('diversified')
  })

  it('uses the FULL project list for HHI, not just the top N', () => {
    // Truncating to topN would inflate HHI and make a long tail read as
    // concentration. Twenty equal holdings with topN=5 must still be 500.
    const spread = Array.from({ length: 20 }, (_, i) => ({
      quantity: 5,
      project_id: `p${i}`,
      project_title: `Project ${i}`,
    }))
    const c = computeConcentration(spread, { topN: 5 })
    expect(c.topProjects).toHaveLength(5)
    expect(c.hhi).toBe(500)
    expect(c.rating).toBe('diversified')
  })

  it('orders top projects largest first', () => {
    const c = computeConcentration(holdings)
    expect(c.topProjects.map((p) => p.label)).toEqual(['Bamboo', 'Solar', 'Mangrove'])
  })

  it('labels holdings with no category rather than dropping them', () => {
    const c = computeConcentration([{ quantity: 10, project_id: 'p1', project_title: 'X' }])
    expect(c.categories).toEqual([{ label: 'Uncategorised', credits: 10, share: 100 }])
  })
})
