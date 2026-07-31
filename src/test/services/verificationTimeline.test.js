import { describe, it, expect } from 'vitest'
import { buildProjectTimeline } from '@/services/verificationService'

const project = {
  id: 'p1',
  created_at: '2026-07-01T09:00:00Z',
  status: 'validated',
  verified_at: '2026-07-10T15:00:00Z',
  verification_notes: 'Baseline checks out.',
}

const audit = (over) => ({
  id: 'a1',
  action: 'project_validated',
  created_at: '2026-07-10T15:00:00Z',
  metadata: {},
  profiles: { full_name: 'Ana Reyes' },
  ...over,
})

describe('buildProjectTimeline', () => {
  it('returns nothing for an empty project', () => {
    expect(buildProjectTimeline({ project: {} })).toEqual([])
    expect(buildProjectTimeline()).toEqual([])
  })

  it('derives submission and decision from the project alone', () => {
    // Projects predating audit logging must still show their spine.
    const events = buildProjectTimeline({ project, auditRows: [] })
    expect(events.map((e) => e.label)).toEqual(['Validated', 'Submitted for review'])
    expect(events[0].detail).toBe('Baseline checks out.')
  })

  it('orders newest first', () => {
    const events = buildProjectTimeline({ project, auditRows: [] })
    expect(new Date(events[0].at) >= new Date(events[1].at)).toBe(true)
  })

  it('prefers the audit row over the project-derived duplicate', () => {
    const events = buildProjectTimeline({ project, auditRows: [audit()] })
    const validated = events.filter((e) => e.label === 'Validated')
    expect(validated).toHaveLength(1)
    // The audit row carries the actor; the derived one cannot.
    expect(validated[0].actor).toBe('Ana Reyes')
  })

  it('keeps both when they are far apart in time', () => {
    const events = buildProjectTimeline({
      project,
      auditRows: [audit({ created_at: '2026-07-12T15:00:00Z' })],
    })
    expect(events.filter((e) => e.label === 'Validated')).toHaveLength(2)
  })

  it('gives human labels to known actions', () => {
    const events = buildProjectTimeline({
      project: {},
      auditRows: [
        audit({ action: 'project_needs_revision' }),
        audit({ action: 'project_assigned' }),
        audit({ action: 'project_rejected' }),
      ],
    })
    expect(events.map((e) => e.label)).toEqual(
      expect.arrayContaining(['Revision requested', 'Assigned', 'Rejected']),
    )
  })

  it('falls back to a readable form for an unknown action', () => {
    const events = buildProjectTimeline({
      project: {},
      auditRows: [audit({ action: 'something_odd_happened' })],
    })
    expect(events[0].label).toBe('something odd happened')
  })

  it('surfaces a note from either metadata key', () => {
    const [withNote] = buildProjectTimeline({
      project: {},
      auditRows: [audit({ metadata: { note: 'see attachment' } })],
    })
    expect(withNote.detail).toBe('see attachment')

    const [withNotes] = buildProjectTimeline({
      project: {},
      auditRows: [audit({ metadata: { notes: 'plural key' } })],
    })
    expect(withNotes.detail).toBe('plural key')
  })

  it('skips audit rows with no timestamp', () => {
    const events = buildProjectTimeline({
      project: {},
      auditRows: [audit({ created_at: null })],
    })
    expect(events).toEqual([])
  })

  it('does not invent a decision for an undecided project', () => {
    const events = buildProjectTimeline({
      project: { created_at: '2026-07-01T09:00:00Z', status: 'submitted', verified_at: null },
    })
    expect(events).toHaveLength(1)
    expect(events[0].label).toBe('Submitted for review')
  })

  it('treats the legacy "approved" status as validated', () => {
    const events = buildProjectTimeline({
      project: { ...project, status: 'approved' },
    })
    expect(events.some((e) => e.label === 'Validated')).toBe(true)
  })
})
