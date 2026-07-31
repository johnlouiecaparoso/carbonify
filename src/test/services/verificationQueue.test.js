import { describe, it, expect } from 'vitest'
import { searchProjects, projectAgeDays, isOverdue } from '@/services/verificationService'

const projects = [
  { id: 'a1b2', title: 'Cebu Solar Rooftop', category: 'Renewable Energy', location: 'Cebu City' },
  { id: 'c3d4', title: 'Mangrove Restoration', category: 'Blue Carbon', location: 'Palawan' },
  { id: 'e5f6', title: 'Biochar Pilot', category: 'Biochar & Bio-briquettes', location: 'Cebu City' },
]

describe('searchProjects', () => {
  it('returns everything for an empty query', () => {
    expect(searchProjects(projects, '')).toHaveLength(3)
    expect(searchProjects(projects, '   ')).toHaveLength(3)
    expect(searchProjects(projects)).toHaveLength(3)
  })

  it('matches on title, case-insensitively', () => {
    expect(searchProjects(projects, 'mangrove')).toHaveLength(1)
    expect(searchProjects(projects, 'MANGROVE')).toHaveLength(1)
  })

  it('matches on category and location', () => {
    expect(searchProjects(projects, 'blue carbon')).toHaveLength(1)
    expect(searchProjects(projects, 'cebu')).toHaveLength(2)
  })

  it('matches on project id, so an id pasted from a support thread works', () => {
    const found = searchProjects(projects, 'c3d4')
    expect(found).toHaveLength(1)
    expect(found[0].title).toBe('Mangrove Restoration')
  })

  it('narrows with each term rather than widening', () => {
    // "cebu solar" must not also return the Cebu biochar project.
    const found = searchProjects(projects, 'cebu solar')
    expect(found).toHaveLength(1)
    expect(found[0].title).toBe('Cebu Solar Rooftop')
  })

  it('returns nothing when a term matches nothing', () => {
    expect(searchProjects(projects, 'antarctica')).toEqual([])
    expect(searchProjects(projects, 'cebu antarctica')).toEqual([])
  })

  it('tolerates missing fields and an empty list', () => {
    expect(searchProjects([{ id: 'x' }], 'x')).toHaveLength(1)
    expect(searchProjects([{}], 'anything')).toEqual([])
    expect(searchProjects([], 'x')).toEqual([])
    expect(searchProjects(null, 'x')).toEqual([])
  })
})

describe('projectAgeDays', () => {
  const now = new Date('2026-07-22T12:00:00Z')

  it('counts whole days since submission', () => {
    expect(projectAgeDays({ created_at: '2026-07-19T12:00:00Z' }, now)).toBe(3)
  })

  it('is 0 for a project submitted today', () => {
    expect(projectAgeDays({ created_at: '2026-07-22T01:00:00Z' }, now)).toBe(0)
  })

  it('is 0 for a missing or unparseable date', () => {
    expect(projectAgeDays({}, now)).toBe(0)
    expect(projectAgeDays({ created_at: 'not a date' }, now)).toBe(0)
    expect(projectAgeDays(null, now)).toBe(0)
  })
})

describe('isOverdue', () => {
  const now = new Date('2026-07-22T12:00:00Z')
  const old = { created_at: '2026-07-01T12:00:00Z' } // 21 days

  it('flags an open submission past the SLA', () => {
    expect(isOverdue({ ...old, status: 'submitted' }, 5, now)).toBe(true)
    // 'pending' is what the create paths actually write.
    expect(isOverdue({ ...old, status: 'pending' }, 5, now)).toBe(true)
    expect(isOverdue({ ...old, status: 'in_review' }, 5, now)).toBe(true)
  })

  it('never flags a decided project, however old', () => {
    for (const status of ['validated', 'rejected', 'needs_revision', 'draft']) {
      expect(isOverdue({ ...old, status }, 5, now)).toBe(false)
    }
  })

  it('does not flag a submission inside the window', () => {
    expect(isOverdue({ created_at: '2026-07-20T12:00:00Z', status: 'submitted' }, 5, now)).toBe(false)
  })
})
