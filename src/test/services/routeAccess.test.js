import { describe, it, expect } from 'vitest'
import router from '@/router'
import { ROLES, canonicalizeRole } from '@/constants/roles'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'
import { buildSidebar } from '@/constants/navigation'

/**
 * Guards against the route table drifting from what the app actually promises.
 *
 * Every finding below was a real defect:
 *   - /marketplace and /projects/:id were reachable only to signed-in users,
 *     because a hand-maintained allowlist of route names in the guard had
 *     fallen behind the route table. The public marketplace linked from the
 *     signed-out header bounced every visitor to /login.
 *   - /cart, /credit-portfolio and /watchlist carried no role restriction, so
 *     admins, verifiers and project developers — none of whom buy credits —
 *     could walk the entire checkout path. (/buy-credits was in this list too,
 *     until it was deleted as an unreachable duplicate of the marketplace
 *     purchase flow.)
 *   - /sales exposed seller earnings to any signed-in account.
 */

const routes = router.getRoutes()
const byName = (name) => routes.find((r) => r.name === name)

/** Every path a signed-out visitor must be able to open. */
const MUST_BE_PUBLIC = [
  'home',
  'about',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'auth-callback',
  'marketplace',
  'biomass-marketplace',
  'registry',
  'market-dashboard',
  'role-application',
  'certificate-verify',
  'project-detail',
]

/** Routes that must never be reachable without a session. */
const MUST_BE_PRIVATE = [
  'buyer-dashboard',
  'admin',
  'admin-users',
  'admin-finance',
  'admin-aml',
  'verifier',
  'developer-projects-dashboard',
  'submit-project',
  'lgu-dashboard',
  'farmer-portal',
  'wallet',
  'cart',
  'orders',
  'receipts',
  'kyc',
  'profile',
  'seller-earnings',
]

describe('route access metadata', () => {
  describe('public routes', () => {
    for (const name of MUST_BE_PUBLIC) {
      it(`${name} is reachable without signing in`, () => {
        const route = byName(name)
        expect(route, `route "${name}" no longer exists`).toBeTruthy()
        expect(route.meta.public).toBe(true)
        // A route cannot be both public and gated.
        expect(route.meta.requiresAuth).toBeFalsy()
      })
    }
  })

  describe('private routes', () => {
    for (const name of MUST_BE_PRIVATE) {
      it(`${name} requires a session`, () => {
        const route = byName(name)
        expect(route, `route "${name}" no longer exists`).toBeTruthy()
        expect(route.meta.public).toBeFalsy()
        expect(route.meta.requiresAuth).toBe(true)
      })
    }
  })

  it('gates every route that is not explicitly public', () => {
    // The one rule that makes the others hold: there is no third state. A new
    // route is private until someone marks it public on purpose.
    const ungoverned = routes
      .filter((r) => r.components || r.component)
      .filter((r) => !r.meta.public && !r.meta.requiresAuth)
      .map((r) => r.name || r.path)

    expect(ungoverned).toEqual([])
  })
})

describe('role restrictions', () => {
  const restricted = (name) => byName(name)?.meta?.disallowedRoles || []

  it('keeps non-buying roles out of the entire buying path', () => {
    for (const name of ['cart', 'credit-portfolio', 'watchlist', 'buyer-dashboard']) {
      const blocked = restricted(name)
      expect(blocked, `${name} has no role restriction`).toContain(ROLES.ADMIN)
      expect(blocked, `${name} allows verifiers`).toContain(ROLES.VERIFIER)
      expect(blocked, `${name} allows developers`).toContain(ROLES.PROJECT_DEVELOPER)
    }
  })

  it('keeps buyers out of seller earnings, and lets sellers in', () => {
    const blocked = restricted('seller-earnings')
    expect(blocked).toContain(ROLES.GENERAL_USER)
    expect(blocked).toContain(ROLES.BUYER_INVESTOR)
    expect(blocked).not.toContain(ROLES.PROJECT_DEVELOPER)
    expect(blocked).not.toContain(ROLES.FARMER)
  })

  it('leaves KYC open to every role that has to move money', () => {
    const blocked = restricted('kyc')
    expect(blocked).toContain(ROLES.ADMIN)
    expect(blocked).toContain(ROLES.VERIFIER)
    for (const role of [
      ROLES.PROJECT_DEVELOPER,
      ROLES.FARMER,
      ROLES.LGU_USER,
      ROLES.GENERAL_USER,
    ]) {
      expect(blocked, `KYC blocked for ${role}`).not.toContain(role)
    }
  })

  it('never blocks a role from its own landing page', () => {
    // A role redirected to a route that then rejects it is an infinite loop —
    // exactly what happened to super_admin.
    for (const role of Object.values(ROLES)) {
      const target = getRoleDefaultRoute(role)
      const route = routes.find((r) => r.path === target)
      expect(route, `no route for ${target}`).toBeTruthy()
      expect(
        route.meta.disallowedRoles || [],
        `${role} is redirected to ${target}, which rejects it`,
      ).not.toContain(canonicalizeRole(role))
    }
  })

  it('lands every role, and every alias, on a route that exists', () => {
    const paths = new Set(routes.map((r) => r.path))
    for (const role of [...Object.values(ROLES), 'super_admin', 'Admin', 'developer', undefined]) {
      expect(paths.has(getRoleDefaultRoute(role))).toBe(true)
    }
  })
})

/**
 * The rule constants/navigation.js states about itself: the sidebar is "the
 * complete list of every product feature the role can reach". Nothing enforced
 * it, and it had already broken — /monitoring, the MRV report editor a
 * developer has to revisit every reporting period, was gated to developers but
 * appeared in no sidebar group. It was reachable only by noticing a card on the
 * dashboard, which is exactly the "three ways to reach one page, none of them
 * the menu" problem navigation.js was written to end.
 *
 * Checking the ROUTE TABLE rather than the nav map is the point: a feature can
 * only go missing from the sidebar by existing as a route and not as a
 * destination, so the route table is the only place the omission is visible.
 */
describe('role-gated routes are reachable from that role sidebar', () => {
  const GATES = [
    { meta: 'requiresProjectDeveloper', role: 'developer' },
    { meta: 'requiresLgu', role: 'lgu' },
    { meta: 'requiresFarmer', role: 'farmer' },
  ]

  /** Minimal stand-in for the Pinia store's role getters. */
  const userWith = (role) => ({
    isAuthenticated: true,
    isAdmin: false,
    isVerifier: false,
    isProjectDeveloper: role === 'developer',
    isLguUser: role === 'lgu',
    isFarmer: role === 'farmer',
    isBuyerInvestor: false,
  })

  /**
   * Routes deliberately absent from the sidebar. Each needs a reason, because
   * "it isn't in the menu" is the bug this suite exists to catch.
   */
  const NOT_IN_SIDEBAR = new Set([])

  for (const { meta, role } of GATES) {
    it(`lists every ${meta} route in the ${role} sidebar`, () => {
      const sidebarPaths = new Set(
        buildSidebar(userWith(role)).flatMap((s) => s.items.map((i) => i.path)),
      )
      const gated = routes
        .filter((r) => r.meta?.[meta] && !NOT_IN_SIDEBAR.has(r.path))
        .map((r) => r.path)

      expect(gated.length, `no ${meta} routes found — did the meta flag get renamed?`).toBeGreaterThan(0)

      for (const path of gated) {
        expect(
          sidebarPaths.has(path),
          `${path} is gated to ${role} but is in no sidebar group — either add it to constants/navigation.js or list it in NOT_IN_SIDEBAR with a reason`,
        ).toBe(true)
      }
    })
  }
})
