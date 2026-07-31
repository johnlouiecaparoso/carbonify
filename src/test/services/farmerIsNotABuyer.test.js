import { describe, it, expect } from 'vitest'
import { buildWorkspace, buildAccountMenu, isBuyerRole } from '@/constants/navigation'
import { ROLES } from '@/constants/roles'

/**
 * Guard for DEFERRED_BACKLOG #31 — decided 2026-07-30: **a farmer is a seller,
 * not a buyer.** They supply feedstock; they do not trade carbon credits.
 *
 * The bug #31 recorded was never "farmers can't buy". It was a CONTRADICTION:
 * every layer of the app already treated a farmer as a non-buyer — `isBuyerRole()`
 * excluded them, their sidebar was Feedstock + Insights, the account menu gave
 * them no wallet — while `src/router/index.js` left the whole buying path
 * reachable by typing the URL. Nothing offered checkout, and nothing stopped it.
 *
 * These tests pin BOTH halves so the two layers cannot drift apart again: the
 * navigation must not offer a farmer the buying path, and the router must not
 * allow it. A farmer's money pages are /farmer and /sales.
 */

/** Minimal stand-in for the Pinia store's role getters. */
function farmer() {
  return {
    isAuthenticated: true,
    isAdmin: false,
    isVerifier: false,
    isProjectDeveloper: false,
    isLguUser: false,
    isFarmer: true,
    isBuyerInvestor: false,
    isGeneralUser: false,
  }
}

/** Every route the buying path is made of. */
const BUYING_PATHS = [
  '/cart',
  '/watchlist',
  '/credit-portfolio',
  '/orders',
  '/receipts',
  '/wallet',
  '/certificates',
  '/dashboard',
]

function pathsIn(groups) {
  return groups.flatMap((g) => (g.items ?? []).map((i) => i.path))
}

describe('a farmer is a seller, not a buyer (#31)', () => {
  it('is not classified as a buyer role', () => {
    expect(isBuyerRole(farmer())).toBe(false)
  })

  it('is offered the feedstock workspace, not the buying path', () => {
    const paths = pathsIn(buildWorkspace(farmer()))

    expect(paths).toContain('/biomass/sell')
    for (const buying of BUYING_PATHS) {
      expect(paths, `farmer sidebar must not offer ${buying}`).not.toContain(buying)
    }
  })

  it('gets no wallet entry in the account menu', () => {
    const paths = buildAccountMenu(farmer()).map((i) => i.path)

    // The wallet funds credit purchases. A farmer is paid directly by the buyer
    // — Carbonify never holds that money — so a wallet would misrepresent how
    // they actually get paid.
    expect(paths).not.toContain('/wallet')
  })

  it('is blocked from the buying routes by the ROUTER, not just the sidebar', async () => {
    // The half that was missing: the nav already agreed, the guard did not.
    const { default: router } = await import('@/router/index.js')

    const blocked = router
      .getRoutes()
      .filter((r) => BUYING_PATHS.includes(r.path))
      .filter((r) => (r.meta?.disallowedRoles ?? []).includes(ROLES.FARMER))
      .map((r) => r.path)

    // /certificates and /receipts et al all sit behind FINANCE_RESTRICTED_ROLES.
    expect(blocked.sort()).toEqual([...BUYING_PATHS].sort())
  })
})
