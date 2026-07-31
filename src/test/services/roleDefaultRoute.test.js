import { describe, it, expect } from 'vitest'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'
import { ROLES } from '@/constants/roles'

/**
 * This function decides where every role lands after login, so a regression here
 * silently drops a whole role onto the wrong page. Buyers in particular used to
 * land on the public marketing homepage instead of a workspace.
 */
describe('getRoleDefaultRoute', () => {
  it('sends buyers and general users to their dashboard, not the marketing homepage', () => {
    expect(getRoleDefaultRoute(ROLES.BUYER_INVESTOR)).toBe('/dashboard')
    expect(getRoleDefaultRoute(ROLES.GENERAL_USER)).toBe('/dashboard')
    expect(getRoleDefaultRoute('user')).toBe('/dashboard')
  })

  it('keeps every other role on its own workspace', () => {
    expect(getRoleDefaultRoute(ROLES.ADMIN)).toBe('/admin')
    expect(getRoleDefaultRoute('super_admin')).toBe('/admin')
    expect(getRoleDefaultRoute(ROLES.VERIFIER)).toBe('/verifier')
    expect(getRoleDefaultRoute(ROLES.PROJECT_DEVELOPER)).toBe('/developer/projects')
    expect(getRoleDefaultRoute(ROLES.LGU_USER)).toBe('/lgu')
    expect(getRoleDefaultRoute('lgu')).toBe('/lgu')
    expect(getRoleDefaultRoute(ROLES.FARMER)).toBe('/farmer')
  })

  it('falls back to the buyer dashboard for unknown or missing roles', () => {
    expect(getRoleDefaultRoute(undefined)).toBe('/dashboard')
    expect(getRoleDefaultRoute(null)).toBe('/dashboard')
    expect(getRoleDefaultRoute('something_else')).toBe('/dashboard')
  })
})
