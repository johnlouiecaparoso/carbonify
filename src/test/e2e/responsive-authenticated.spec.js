import { test, expect } from '@playwright/test'
import { VIEWPORTS, findOverflowing, loginAsTestAccount, TEST_ACCOUNTS } from './helpers/layout.js'

/**
 * Responsive audit of the AUTHENTICATED pages.
 *
 * `responsive.spec.js` covers public routes only, and said so itself:
 * "authenticated pages are the widest layouts in the app, so they are the
 * likeliest remaining offenders." They had zero coverage. This is that half.
 *
 * ── TWO THINGS THIS SPEC LEARNED THE HARD WAY ──
 *
 * 1. **`page.goto()` cannot be used here.** A goto is a full reload, and the DEV
 *    mock session lives only in the Pinia store — it is never handed to Supabase
 *    and never written to storage. A reload empties the store, the router guard
 *    asks Supabase, Supabase says nobody is signed in, and every route bounces to
 *    /login. The first version of this spec did exactly that and reported
 *    **22/22 passing having measured nothing.** Navigation is now in-app only.
 *
 * 2. **The route list is DISCOVERED, not hard-coded.** Hand-written route guesses
 *    were wrong twice (`/portfolio` vs `/credit-portfolio`, `/audit-logs` vs
 *    `/admin/audit-logs`), and a wrong path is indistinguishable from a page with
 *    no overflow. Reading the rendered navigation measures exactly what that role
 *    can actually reach, and stays correct when the nav changes.
 *
 * ⚠️ WHAT THIS DOES AND DOES NOT PROVE — see `loginAsTestAccount`. The DEV
 * accounts install a session Supabase never sees, so every read returns empty:
 *
 *   ✅ the authenticated shell — header, sidebar, page chrome, role-gated nav,
 *      card grids, forms, empty states
 *   ❌ data-dense tables, which render with zero rows here. A table that only
 *      overflows once it holds real content will pass.
 *
 * Stated plainly rather than left to be discovered, because a test that quietly
 * covers less than its name suggests is this project's most expensive recurring
 * bug — `escrow_verification.sql` row 3 reporting PASS across an empty table is
 * the same shape, and so was this spec's own first version.
 */

const ROLES = [
  { role: 'admin', account: TEST_ACCOUNTS.admin },
  { role: 'developer', account: TEST_ACCOUNTS.developer },
  { role: 'verifier', account: TEST_ACCOUNTS.verifier },
  { role: 'user', account: TEST_ACCOUNTS.user },
]

/** In-app routes this role's navigation actually offers. */
async function discoverRoutes(page) {
  return page.evaluate(() => {
    const seen = new Set()
    const nav = document.querySelector('.sidebar') || document.body
    for (const a of nav.querySelectorAll('a[href^="/"]')) {
      const href = a.getAttribute('href')
      // Skip the logo link and anything parameterised.
      if (!href || href === '/' || href.includes(':')) continue
      seen.add(href)
    }
    return [...seen]
  })
}

/** Click an in-app link; returns whether we landed on it. Never reloads. */
async function navigateWithinApp(page, route) {
  const link = page.locator(`a[href="${route}"]`).first()
  if (!(await link.count())) return false

  try {
    await link.click({ timeout: 5000 })
    await page.waitForURL(`**${route}`, { timeout: 5000 })
    await page.waitForLoadState('networkidle')
    return new URL(page.url()).pathname === route
  } catch {
    // Covered by an overlay at this width, or the guard bounced it.
    return false
  }
}

for (const { role, account } of ROLES) {
  test.describe(`${role} pages`, () => {
    for (const vp of VIEWPORTS) {
      test(`no horizontal overflow at ${vp.name}`, async ({ page }) => {
        // Each role's nav offers ~15 routes and every hop waits for networkidle,
        // so the 30s default is not enough. This is a breadth sweep, not a
        // latency test.
        test.setTimeout(180000)
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await loginAsTestAccount(page, account)

        // Bounded so the sweep stays a few minutes rather than tens. The cap is
        // per role and the landing page is always measured on top of it.
        const routes = (await discoverRoutes(page)).slice(0, 10)
        const failures = []
        const measured = []

        // Measure the landing page first — it is always reachable, and on a
        // phone the sidebar may be collapsed so no link is clickable at all.
        const landing = new URL(page.url()).pathname
        measured.push(landing)
        const landingOffenders = await findOverflowing(page, vp.width)
        if (landingOffenders.length) failures.push({ route: landing, offenders: landingOffenders })

        for (const route of routes) {
          if (route === landing) continue
          if (!(await navigateWithinApp(page, route))) continue

          measured.push(route)
          const offenders = await findOverflowing(page, vp.width)
          if (offenders.length) failures.push({ route, offenders })
        }

        // A check that cannot go red proves nothing. Without this, a broken
        // login or a guard bouncing everything would skip the loop entirely and
        // the test would pass having measured NOTHING.
        expect(
          measured.length,
          `${role}: measured no pages at all — login or in-app navigation is broken`,
        ).toBeGreaterThan(0)

        expect(
          failures,
          `${role} overflows at ${vp.width}px (measured ${measured.length} page(s): ` +
            `${measured.join(', ')}):\n${JSON.stringify(failures, null, 2)}`,
        ).toEqual([])
      })
    }
  })
}

test.describe('authenticated chrome on a phone', () => {
  test('the sidebar is either fitted or off-canvas at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsTestAccount(page, TEST_ACCOUNTS.admin)

    // The sidebar is the widest fixed element in the app. If it sits partly
    // on-screen at phone width, every other measurement is taken against a
    // viewport that is already wrong.
    const sidebar = await page.evaluate(() => {
      const el = document.querySelector('.sidebar')
      if (!el) return null
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden') return null
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
    })

    if (sidebar) {
      expect(
        sidebar.right <= 391 || sidebar.left >= 390,
        `sidebar occupies ${JSON.stringify(sidebar)} at 390px — neither fitted nor off-canvas`,
      ).toBe(true)
    }
  })

  test('form inputs stay 16px so iOS does not zoom on focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsTestAccount(page, TEST_ACCOUNTS.developer)

    const tooSmall = await page.evaluate(() => {
      const out = []
      const sel =
        'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea'
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 16) out.push({ name: el.name || el.id || el.type, size })
      }
      return out
    })

    // The public spec asserts this on /login. Authenticated forms had never
    // been checked at all.
    expect(tooSmall, `inputs under 16px: ${JSON.stringify(tooSmall)}`).toEqual([])
  })
})
