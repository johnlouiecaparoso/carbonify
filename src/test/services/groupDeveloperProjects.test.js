import { describe, it, expect } from 'vitest'
import {
  groupDeveloperProjects,
  PROJECT_GROUPS,
  ACTION_STATUSES,
} from '@/utils/groupDeveloperProjects'

const project = (id, status) => ({ id, status, title: `Project ${id}` })

const keysOf = (groups) => groups.map((g) => g.key)
const idsIn = (groups, key) =>
  (groups.find((g) => g.key === key)?.items || []).map((item) => item.id)

describe('groupDeveloperProjects', () => {
  it('puts every project in exactly one group', () => {
    const projects = [
      project(1, 'draft'),
      project(2, 'needs_revision'),
      project(3, 'pending'),
      project(4, 'approved'),
      project(5, 'rejected'),
    ]

    const groups = groupDeveloperProjects(projects)
    const placed = groups.flatMap((group) => group.items.map((item) => item.id))

    expect(placed).toHaveLength(projects.length)
    expect(new Set(placed).size).toBe(projects.length)
  })

  it('never drops a project whose status matches no group', () => {
    // The projects table's CHECK constraint has gained values before. A status
    // this file has never heard of must still reach its owner's dashboard.
    const groups = groupDeveloperProjects([project(1, 'approved'), project(2, 'some_new_status')])

    expect(idsIn(groups, 'other')).toEqual([2])
    expect(groups.flatMap((g) => g.items)).toHaveLength(2)
  })

  it('treats a missing status as ungrouped rather than losing the row', () => {
    const groups = groupDeveloperProjects([{ id: 1, title: 'No status' }])
    expect(idsIn(groups, 'other')).toEqual([1])
  })

  it('groups the two "you must act" statuses together, ahead of everything else', () => {
    const groups = groupDeveloperProjects([
      project(1, 'approved'),
      project(2, 'rejected'),
      project(3, 'draft'),
      project(4, 'needs_revision'),
    ])

    expect(groups[0].key).toBe('action')
    expect(idsIn(groups, 'action')).toEqual([3, 4])
  })

  it('collapses the legacy review statuses into one bucket', () => {
    const groups = groupDeveloperProjects([
      project(1, 'pending'),
      project(2, 'submitted'),
      project(3, 'in_review'),
      project(4, 'under_review'),
    ])

    expect(keysOf(groups)).toEqual(['review'])
    expect(idsIn(groups, 'review')).toEqual([1, 2, 3, 4])
  })

  it('treats validated as live, alongside approved', () => {
    const groups = groupDeveloperProjects([project(1, 'approved'), project(2, 'validated')])
    expect(idsIn(groups, 'live')).toEqual([1, 2])
  })

  it('hides groups nobody is in, so an empty bucket never takes up space', () => {
    const groups = groupDeveloperProjects([project(1, 'approved')])
    expect(keysOf(groups)).toEqual(['live'])
  })

  it('returns nothing at all for a developer with no projects', () => {
    expect(groupDeveloperProjects([])).toEqual([])
    expect(groupDeveloperProjects()).toEqual([])
  })

  it('orders groups by urgency, not by status name', () => {
    const groups = groupDeveloperProjects([
      project(1, 'rejected'),
      project(2, 'approved'),
      project(3, 'pending'),
      project(4, 'draft'),
    ])

    expect(keysOf(groups)).toEqual(['action', 'review', 'live', 'closed'])
  })

  it('preserves the order projects arrive in within a group', () => {
    const groups = groupDeveloperProjects([
      project(3, 'approved'),
      project(1, 'approved'),
      project(2, 'approved'),
    ])

    expect(idsIn(groups, 'live')).toEqual([3, 1, 2])
  })

  it('gives every group a stable key and a distinct title', () => {
    const keys = PROJECT_GROUPS.map((g) => g.key)
    const titles = PROJECT_GROUPS.map((g) => g.title)

    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(titles).size).toBe(titles.length)
    expect(keys).not.toContain('other') // reserved for the catch-all
  })

  it('claims no status for more than one group', () => {
    const all = PROJECT_GROUPS.flatMap((g) => g.statuses)
    expect(new Set(all).size).toBe(all.length)
  })

  it('exposes exactly the statuses that require developer action', () => {
    expect(ACTION_STATUSES).toEqual(['draft', 'needs_revision'])
  })
})
