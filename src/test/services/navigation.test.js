import { describe, it, expect } from 'vitest'
import {
  buildGuestNav,
  buildSidebar,
  buildAccountMenu,
  buildWorkspace,
  homeDestination,
  isBuyerRole,
  DESTINATIONS,
} from '@/constants/navigation'

/**
 * These tests exist because the app previously grew three parallel navigation
 * systems — top nav, profile dropdown, dashboard tiles — that drifted apart.
 * The marketplace was "Marketplace" in one and "Buy credits" in another; the
 * watchlist was "Saved" in one and "Watchlist" in another. The rules below are
 * what stop that from happening again, so a failure here means the information
 * architecture has regressed, not that a label needs updating in the test.
 *
 * Signed-in navigation is now a single surface — the sidebar — so the headline
 * invariant is that every feature is in it exactly once, and that the account
 * menu holds nothing that is.
 */

/** Minimal stand-in for the Pinia store's role getters. */
function userWith(role) {
  return {
    isAuthenticated: true,
    isAdmin: role === 'admin',
    isVerifier: role === 'verifier',
    isProjectDeveloper: role === 'developer',
    isLguUser: role === 'lgu',
    isFarmer: role === 'farmer',
    isBuyerInvestor: role === 'investor',
    isGeneralUser: role === 'buyer',
  }
}

const ROLE_KEYS = ['buyer', 'investor', 'admin', 'verifier', 'developer', 'lgu', 'farmer']

function pathsOf(sections) {
  return sections.flatMap((section) => section.items.map((item) => item.path))
}

describe('navigation information architecture', () => {
  describe('guest header nav', () => {
    it('never exceeds five items, so it cannot wrap', () => {
      expect(buildGuestNav().length).toBeLessThanOrEqual(5)
    })

    it('offers only public pages — nothing that needs an account', () => {
      const publicPaths = new Set(['/', '/marketplace', '/biomass', '/registry', '/about'])
      for (const item of buildGuestNav()) {
        expect(publicPaths.has(item.path)).toBe(true)
      }
    })
  })

  describe('sidebar', () => {
    it('is empty for signed-out visitors, who navigate from the header', () => {
      expect(buildSidebar({ isAuthenticated: false })).toEqual([])
    })

    it('leads with the Explore group, marketplace-first for buying roles', () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        const [first] = buildSidebar(user)
        expect(first.title).toBe('Explore')
        // Farmers sell feedstock, so biomass leads for them; everyone else
        // opens on the marketplace.
        expect(first.items[0].path).toBe(user.isFarmer ? '/biomass' : '/marketplace')
      }
    })

    it("places the role's own landing page right after Explore, in an untitled group", () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        const landing = buildSidebar(user)[1]
        expect(landing.title).toBe('')
        expect(landing.items).toHaveLength(1)
        expect(landing.items[0].path).toBe(homeDestination(user).path)
      }
    })

    it('lists every destination exactly once', () => {
      for (const role of ROLE_KEYS) {
        const paths = pathsOf(buildSidebar(userWith(role)))
        expect(new Set(paths).size).toBe(paths.length)
      }
    })

    it('gives every item an icon, since the collapsed rail shows nothing else', () => {
      for (const role of ROLE_KEYS) {
        for (const section of buildSidebar(userWith(role))) {
          for (const item of section.items) {
            expect(item.icon).toBeTruthy()
          }
        }
      }
    })

    it('titles every group except the single untitled landing group', () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        const untitled = buildSidebar(user).filter((section) => section.title === '')
        // Exactly one group carries no heading: the role's lone landing link.
        expect(untitled).toHaveLength(1)
        expect(untitled[0].items[0].path).toBe(homeDestination(user).path)
      }
    })

    it('never contains an account page — those belong to the avatar menu', () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        const accountPaths = new Set(buildAccountMenu(user).map((item) => item.path))
        for (const path of pathsOf(buildSidebar(user))) {
          expect(accountPaths.has(path)).toBe(false)
        }
      }
    })

    it('lets every role reach the shared public surfaces', () => {
      for (const role of ROLE_KEYS) {
        const paths = pathsOf(buildSidebar(userWith(role)))
        expect(paths).toEqual(
          expect.arrayContaining(['/marketplace', '/registry', '/map', '/biomass']),
        )
      }
    })

    it("contains everything the role's workspace groups declare", () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        const sidebarPaths = pathsOf(buildSidebar(user))
        for (const path of pathsOf(buildWorkspace(user))) {
          expect(sidebarPaths).toContain(path)
        }
      }
    })
  })

  describe('account menu', () => {
    it('stays short enough to render without scrolling', () => {
      for (const role of ROLE_KEYS) {
        expect(buildAccountMenu(userWith(role)).length).toBeLessThanOrEqual(4)
      }
    })

    it('holds only account pages — no product features', () => {
      const accountPaths = new Set(['/profile', '/kyc', '/wallet', '/upgrade'])
      for (const role of ROLE_KEYS) {
        for (const item of buildAccountMenu(userWith(role))) {
          expect(accountPaths.has(item.path)).toBe(true)
        }
      }
    })

    it('always offers profile settings, and offers nothing to signed-out visitors', () => {
      for (const role of ROLE_KEYS) {
        expect(buildAccountMenu(userWith(role))[0].path).toBe('/profile')
      }
      expect(buildAccountMenu({ isAuthenticated: false })).toEqual([])
    })

    it('hides identity, funding and plan from roles that never transact', () => {
      for (const role of ['admin', 'verifier']) {
        const paths = buildAccountMenu(userWith(role)).map((item) => item.path)
        expect(paths).toEqual(['/profile'])
      }
    })
  })

  describe('role workspace groups', () => {
    it('never repeats a shared public surface, which the Explore group owns', () => {
      const explore = new Set(['/marketplace', '/biomass', '/registry', '/map'])
      for (const role of ROLE_KEYS) {
        for (const path of pathsOf(buildWorkspace(userWith(role)))) {
          expect(explore.has(path)).toBe(false)
        }
      }
    })

    it('never repeats a destination already in the account menu', () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        const accountPaths = new Set(buildAccountMenu(user).map((item) => item.path))
        for (const path of pathsOf(buildWorkspace(user))) {
          expect(accountPaths.has(path)).toBe(false)
        }
      }
    })

    it("never repeats the role's own landing page, which the sidebar lists on top", () => {
      for (const role of ROLE_KEYS) {
        const user = userWith(role)
        expect(pathsOf(buildWorkspace(user))).not.toContain(homeDestination(user).path)
      }
    })

    it('lists each destination exactly once across all its groups', () => {
      for (const role of ROLE_KEYS) {
        const paths = pathsOf(buildWorkspace(userWith(role)))
        expect(new Set(paths).size).toBe(paths.length)
      }
    })

    it('keeps every admin compliance tool reachable outside the dropdown', () => {
      // These four lived only in the profile dropdown before the split, so a
      // regression that drops them strands a compliance queue with no route in.
      const paths = pathsOf(buildWorkspace(userWith('admin')))
      expect(paths).toEqual(
        expect.arrayContaining(['/admin/kyb', '/admin/aml', '/admin/privacy', '/admin/refunds']),
      )
    })

    it('gives buyers their orders, receipts and certificates', () => {
      const paths = pathsOf(buildWorkspace(userWith('buyer')))
      expect(paths).toEqual(
        expect.arrayContaining(['/orders', '/receipts', '/certificates', '/watchlist', '/cart']),
      )
    })

    it('shows the cart count in the label only when the cart has something in it', () => {
      const empty = buildWorkspace(userWith('buyer'), { cartCount: 0 })
      const filled = buildWorkspace(userWith('buyer'), { cartCount: 3 })
      const labelFor = (sections) =>
        sections.flatMap((s) => s.items).find((i) => i.path === '/cart').label

      expect(labelFor(empty)).toBe('Cart')
      expect(labelFor(filled)).toBe('Cart (3)')
    })
  })

  describe('canonical labels', () => {
    it('gives every destination a distinct label', () => {
      const labels = Object.values(DESTINATIONS).map((d) => d.label)
      expect(new Set(labels).size).toBe(labels.length)
    })

    it('uses the same label for a destination on every surface it appears on', () => {
      const byPath = new Map()
      for (const role of [...ROLE_KEYS, null]) {
        const user = role ? userWith(role) : { isAuthenticated: false }
        const everywhere = [
          ...buildGuestNav(),
          ...buildAccountMenu(user),
          ...buildSidebar(user).flatMap((section) => section.items),
        ]

        for (const item of everywhere) {
          // The cart is the one intentional exception: it appends a live count.
          if (item.path === '/cart') continue
          if (byPath.has(item.path)) {
            expect(byPath.get(item.path)).toBe(item.label)
          } else {
            byPath.set(item.path, item.label)
          }
        }
      }
    })
  })

  describe('role classification', () => {
    it('treats only the buying roles as buyers', () => {
      expect(isBuyerRole(userWith('buyer'))).toBe(true)
      expect(isBuyerRole(userWith('investor'))).toBe(true)
      for (const role of ['admin', 'verifier', 'developer', 'lgu', 'farmer']) {
        expect(isBuyerRole(userWith(role))).toBe(false)
      }
    })

    it('lands each role on its own workspace', () => {
      expect(homeDestination(userWith('buyer')).path).toBe('/dashboard')
      expect(homeDestination(userWith('admin')).path).toBe('/admin')
      expect(homeDestination(userWith('verifier')).path).toBe('/verifier')
      expect(homeDestination(userWith('developer')).path).toBe('/developer/projects')
      expect(homeDestination(userWith('lgu')).path).toBe('/lgu')
      expect(homeDestination(userWith('farmer')).path).toBe('/farmer')
      expect(homeDestination({ isAuthenticated: false }).path).toBe('/')
    })
  })
})
