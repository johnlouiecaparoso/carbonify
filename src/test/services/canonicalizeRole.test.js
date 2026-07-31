import { describe, it, expect } from 'vitest'
import { ROLES, canonicalizeRole, getRoleDisplayName } from '@/constants/roles'
import { roleService } from '@/services/roleService'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'

/**
 * The client must agree with the database about what a role IS.
 *
 * `public.is_admin()` (migration 20260604020200) is built on
 * `canonicalize_notification_role()` (20260402000100), which folds
 * 'super_admin' into 'admin'. So Postgres grants a super_admin every admin
 * right through RLS. The client compared roles with `===` against the literal
 * 'admin', so the admin guard refused them and redirected them to /admin — the
 * route that had just refused them. Vue Router bailed out with "Infinite
 * redirect in navigation guard" and the account could not use the app at all.
 *
 * Separately, two profile-fetch paths normalized differently: the primary one
 * lowercased and trimmed, the timeout-retry path did neither. A stored 'Admin'
 * therefore worked on first load and silently demoted the user afterwards.
 */
describe('canonicalizeRole', () => {
  it('folds the aliases the database folds', () => {
    // Mirrors canonicalize_notification_role in 20260402000100.
    expect(canonicalizeRole('super_admin')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('superadmin')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('administrator')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('verification')).toBe(ROLES.VERIFIER)
    expect(canonicalizeRole('qa')).toBe(ROLES.VERIFIER)
    expect(canonicalizeRole('developer')).toBe(ROLES.PROJECT_DEVELOPER)
    expect(canonicalizeRole('projectdeveloper')).toBe(ROLES.PROJECT_DEVELOPER)
    expect(canonicalizeRole('investor')).toBe(ROLES.BUYER_INVESTOR)
    expect(canonicalizeRole('buyerinvestor')).toBe(ROLES.BUYER_INVESTOR)
    expect(canonicalizeRole('user')).toBe(ROLES.GENERAL_USER)
    expect(canonicalizeRole('generaluser')).toBe(ROLES.GENERAL_USER)
    expect(canonicalizeRole('lgu')).toBe(ROLES.LGU_USER)
  })

  it('is insensitive to case, padding and separators', () => {
    expect(canonicalizeRole('Admin')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('  ADMIN  ')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('Super Admin')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('super-admin')).toBe(ROLES.ADMIN)
    expect(canonicalizeRole('Project Developer')).toBe(ROLES.PROJECT_DEVELOPER)
    expect(canonicalizeRole('project-developer')).toBe(ROLES.PROJECT_DEVELOPER)
  })

  it('leaves canonical values untouched', () => {
    for (const role of Object.values(ROLES)) {
      expect(canonicalizeRole(role)).toBe(role)
    }
  })

  it('falls back to the least-privileged role for junk input', () => {
    for (const value of [null, undefined, '', '   ', 42, {}, []]) {
      expect(canonicalizeRole(value)).toBe(ROLES.GENERAL_USER)
    }
  })

  it('passes an unknown role through rather than silently promoting it', () => {
    // An unrecognised role must not become admin, and must not become
    // general_user either — that would grant it a buyer's routes.
    expect(canonicalizeRole('some_future_role')).toBe('some_future_role')
  })
})

describe('role predicates', () => {
  it('treats super_admin as an admin, exactly as public.is_admin() does', () => {
    expect(roleService.isAdmin('super_admin')).toBe(true)
    expect(roleService.isAdmin('Administrator')).toBe(true)
    expect(roleService.isAdmin('ADMIN')).toBe(true)
  })

  it('does not let one role leak into another', () => {
    const predicates = {
      [ROLES.ADMIN]: roleService.isAdmin,
      [ROLES.VERIFIER]: roleService.isVerifier,
      [ROLES.PROJECT_DEVELOPER]: roleService.isProjectDeveloper,
      [ROLES.BUYER_INVESTOR]: roleService.isBuyerInvestor,
      [ROLES.LGU_USER]: roleService.isLguUser,
      [ROLES.FARMER]: roleService.isFarmer,
      [ROLES.GENERAL_USER]: roleService.isGeneralUser,
    }

    for (const role of Object.keys(predicates)) {
      for (const [other, predicate] of Object.entries(predicates)) {
        expect(predicate.call(roleService, role)).toBe(role === other)
      }
    }
  })

  it('refuses admin rights to an unknown role', () => {
    expect(roleService.isAdmin('some_future_role')).toBe(false)
    expect(roleService.isAdmin(null)).toBe(false)
    expect(roleService.isAdmin('admin_readonly')).toBe(false)
  })
})

describe('default route', () => {
  it('agrees with the guards about aliases, so no role can loop', () => {
    // getRoleDefaultRoute sending super_admin to /admin while isAdmin refused
    // it is precisely what produced the infinite redirect.
    expect(getRoleDefaultRoute('super_admin')).toBe('/admin')
    expect(roleService.isAdmin('super_admin')).toBe(true)

    expect(getRoleDefaultRoute('developer')).toBe('/developer/projects')
    expect(roleService.isProjectDeveloper('developer')).toBe(true)

    expect(getRoleDefaultRoute('lgu')).toBe('/lgu')
    expect(roleService.isLguUser('lgu')).toBe(true)
  })

  it('sends anything it does not recognise to the buyer dashboard', () => {
    expect(getRoleDefaultRoute(undefined)).toBe('/dashboard')
    expect(getRoleDefaultRoute('some_future_role')).toBe('/dashboard')
  })
})

describe('getRoleDisplayName', () => {
  it('names aliased roles instead of calling them Unknown', () => {
    expect(getRoleDisplayName('super_admin')).toBe('Administrator')
    expect(getRoleDisplayName('Admin')).toBe('Administrator')
    expect(getRoleDisplayName('developer')).toBe('Project Developer')
    expect(getRoleDisplayName(ROLES.FARMER)).toBe('Farmer')
  })

  it('still reports genuinely unknown roles as unknown', () => {
    expect(getRoleDisplayName('some_future_role')).toBe('Unknown Role')
  })
})
