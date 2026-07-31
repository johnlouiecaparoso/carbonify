import { describe, it, expect } from 'vitest'
import { isSuspendedProfile } from '@/services/roleService'

/**
 * The banner in App.vue keys off `profile.is_active === false`, the same rule
 * isSuspendedProfile encodes. These assert the rule directly — the important
 * property is that a MISSING column reads as active, because every existing
 * profile predates 20260722000800 and the opposite default would show the
 * suspension banner to every user on an un-migrated database.
 */
describe('suspension detection', () => {
  it('treats an explicit false as suspended', () => {
    expect(isSuspendedProfile({ is_active: false })).toBe(true)
  })

  it('treats true as active', () => {
    expect(isSuspendedProfile({ is_active: true })).toBe(false)
  })

  it('treats a MISSING column as active, not suspended', () => {
    expect(isSuspendedProfile({})).toBe(false)
    expect(isSuspendedProfile({ full_name: 'Ana' })).toBe(false)
  })

  it('treats a null profile as active rather than throwing', () => {
    expect(isSuspendedProfile(null)).toBe(false)
    expect(isSuspendedProfile(undefined)).toBe(false)
  })

  it('does not treat other falsy values as suspended', () => {
    // Only an explicit boolean false counts; null/0/'' are not "suspended".
    expect(isSuspendedProfile({ is_active: null })).toBe(false)
    expect(isSuspendedProfile({ is_active: 0 })).toBe(false)
    expect(isSuspendedProfile({ is_active: '' })).toBe(false)
  })
})
