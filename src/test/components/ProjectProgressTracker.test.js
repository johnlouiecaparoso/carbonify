import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectProgressTracker from '@/components/ProjectProgressTracker.vue'

/**
 * The tracker's five stages are Registration → Validation → Verification (MRV)
 * → Issuance → Trading. `activeIndex` is not exposed, so these assert against
 * the rendered dots: index < active is `.done`, index === active is `.active`
 * (or `.failed` when rejected).
 */
function stages(wrapper) {
  return wrapper.findAll('.step-dot').map((dot) => {
    if (dot.classes().includes('done')) return 'done'
    if (dot.classes().includes('active')) return 'active'
    if (dot.classes().includes('failed')) return 'failed'
    return 'todo'
  })
}

const activeIndexOf = (wrapper) => {
  const s = stages(wrapper)
  const i = s.findIndex((x) => x === 'active' || x === 'failed')
  return i
}

const mountWith = (project, props = {}) =>
  mount(ProjectProgressTracker, { props: { project, ...props } })

describe('ProjectProgressTracker', () => {
  it('renders all five lifecycle stages', () => {
    const wrapper = mountWith({ status: 'draft' })
    expect(wrapper.findAll('.step-dot')).toHaveLength(5)
    expect(wrapper.text()).toContain('Registration')
    expect(wrapper.text()).toContain('Trading')
  })

  it('sits at Registration for a draft', () => {
    expect(activeIndexOf(mountWith({ status: 'draft' }))).toBe(0)
  })

  it('sits at Validation once submitted or under review', () => {
    for (const status of ['submitted', 'pending', 'in_review', 'under_review']) {
      expect(activeIndexOf(mountWith({ status }))).toBe(1)
    }
  })

  it('sits at Verification when validated with nothing issued yet', () => {
    expect(activeIndexOf(mountWith({ status: 'validated' }))).toBe(2)
    // 'approved' is the legacy alias for validated and must behave identically.
    expect(activeIndexOf(mountWith({ status: 'approved' }))).toBe(2)
  })

  it('advances to Issuance once credits exist', () => {
    const wrapper = mountWith({ status: 'validated' }, { creditsIssued: true })
    expect(activeIndexOf(wrapper)).toBe(3)
    // Everything before it reads as complete.
    expect(stages(wrapper).slice(0, 3)).toEqual(['done', 'done', 'done'])
  })

  it('advances to Trading once the credits are listed', () => {
    const wrapper = mountWith({ status: 'validated' }, { creditsIssued: true, listed: true })
    expect(activeIndexOf(wrapper)).toBe(4)
    expect(stages(wrapper)).toEqual(['done', 'done', 'done', 'done', 'active'])
  })

  it('treats `listed` as the furthest stage even without the issued flag', () => {
    // Defensive: a listing implies credits exist, so the tracker should not
    // regress if only one of the two signals resolves.
    expect(activeIndexOf(mountWith({ status: 'validated' }, { listed: true }))).toBe(4)
  })

  it('regression: a live project no longer freezes at Verification', () => {
    // Before the fix the dashboard never passed these props, so a project with
    // issued, listed credits still rendered stage 3 of 5 as in-progress.
    const stuck = activeIndexOf(mountWith({ status: 'validated' }))
    const live = activeIndexOf(mountWith({ status: 'validated' }, { creditsIssued: true, listed: true }))
    expect(stuck).toBe(2)
    expect(live).toBeGreaterThan(stuck)
  })

  it('marks the current stage failed when rejected', () => {
    const wrapper = mountWith({ status: 'rejected' })
    expect(wrapper.classes()).toContain('rejected')
    expect(stages(wrapper)[1]).toBe('failed')
  })

  it('keeps needs_revision at the Validation stage', () => {
    expect(activeIndexOf(mountWith({ status: 'needs_revision' }))).toBe(1)
  })

  it('falls back to Registration for an unknown or missing status', () => {
    expect(activeIndexOf(mountWith({ status: 'wat' }))).toBe(0)
    expect(activeIndexOf(mountWith({}))).toBe(0)
  })
})
