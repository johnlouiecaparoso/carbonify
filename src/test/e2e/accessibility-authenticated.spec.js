import { test, expect } from '@playwright/test'
import { analyze, formatViolations } from './helpers/axe.js'
import { loginAsTestAccount, dismissOnboarding, TEST_ACCOUNTS } from './helpers/layout.js'

/**
 * Accessibility audit of the AUTHENTICATED pages — WCAG 2.1 A + AA, in a real
 * browser.
 *
 * `accessibility.spec.js` covers seven PUBLIC routes and stops there. Everything
 * a pilot user actually spends time in — the dashboard, the cart, checkout, the
 * wallet, seller earnings, the admin consoles — had no automated WCAG coverage
 * at all, which made "0 violations, WCAG 2.1 AA" a statement about the marketing
 * pages. This is the other half.
 *
 * ── THE TWO TRAPS, INHERITED FROM `responsive-authenticated.spec.js` ──
 *
 * 1. **No `page.goto()` after sign-in.** A goto is a full reload, and the DEV
 *    mock session lives only in the Pinia store — Supabase never receives it and
 *    nothing is written to storage. A reload empties the store, the router guard
 *    asks Supabase, Supabase says nobody is signed in, and every route bounces
 *    to /login. The responsive spec's first version did exactly that and
 *    reported 22/22 passing having measured NOTHING. Navigation here is in-app
 *    only, and `measuredRoutes` is asserted non-empty for the same reason.
 *
 * 2. **Routes are DISCOVERED from the rendered nav, not hard-coded.** Hand-
 *    written guesses were wrong twice on the responsive side (`/portfolio` vs
 *    `/credit-portfolio`), and a wrong path is indistinguishable from a clean
 *    page: both produce zero violations.
 *
 * ⚠️ **WHAT THIS DOES AND DOES NOT PROVE.** Two independent limits, and both
 * matter when reading a green run:
 *
 *   - **Automated rules cover roughly a third of WCAG.** Green means no
 *     *machine-detectable* violation. Whether a screen-reader user can complete
 *     a purchase is a manual question and stays open on the register.
 *   - **The DEV accounts install a session Supabase never sees**, so every read
 *     returns empty (see `loginAsTestAccount`). Measured: the authenticated
 *     shell, role-gated nav, forms, and every EMPTY state. NOT measured: tables
 *     with rows in them — so a data grid whose cells lack headers, or a status
 *     pill that fails contrast, passes here because it never renders.
 *
 * The second limit is the sharper one and it is why this file does not claim to
 * close the authenticated-accessibility gap. It closes the shell half. Stated up
 * front rather than left to be discovered, because a test that quietly covers
 * less than its name suggests is this project's most expensive recurring bug.
 */

const ROLES = [
  { role: 'admin', account: TEST_ACCOUNTS.admin },
  { role: 'developer', account: TEST_ACCOUNTS.developer },
  { role: 'verifier', account: TEST_ACCOUNTS.verifier },
  { role: 'user', account: TEST_ACCOUNTS.user },
]

/**
 * Rules disabled with a reason, not for convenience.
 *
 * `region` is a best-practice rule and is already outside the WCAG A/AA tag set
 * `analyze()` runs, so nothing is listed here today. The parameter exists so
 * that a future exclusion has to carry an argument next to it rather than being
 * dropped into the helper.
 */
const DISABLED_RULES = []

/** In-app routes this role's navigation actually offers. */
async function discoverRoutes(page) {
  return page.evaluate(() => {
    const seen = new Set()
    const nav = document.querySelector('.sidebar') || document.body
    for (const a of nav.querySelectorAll('a[href^="/"]')) {
      const href = a.getAttribute('href')
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
    // 30s, not the 5s this started with. Against a cold dev server Vite
    // compiles each route's chunk on first request, and the role that happens
    // to run first pays that for all ten — the admin sweep took 2.3 minutes
    // while the three after it took 8 seconds each. A navigation that is merely
    // SLOW must not be recorded as a route that does not exist.
    await link.click({ timeout: 30000 })
    await page.waitForURL(`**${route}`, { timeout: 30000 })
    // `networkidle` is a settling hint, not a requirement. Awaited strictly it
    // made this sweep fail under parallel workers — one dev server serving four
    // browsers never goes idle inside five seconds, every route "failed to
    // navigate", and the role fell back to auditing its landing page alone.
    // That is a resource artifact reported as a coverage result, so it is
    // bounded and non-fatal here.
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    return new URL(page.url()).pathname === route
  } catch {
    return false
  }
}

/**
 * Freeze CSS transitions and animations before measuring colour.
 *
 * `.nav-item` transitions its background and colour over 150ms. Running axe
 * immediately after a navigation samples the computed style MID-TRANSITION, so
 * the active nav link reported failures like "#bed5c4 on #40a258 — 2.06:1" for
 * a rule whose settled values are --text-light on --primary-color, which is
 * 4.78:1 and passes. The six distinct greens in that first run form a ramp
 * converging on #058526: they were animation frames, not colours anyone sees.
 *
 * Contrast is a property of the state a user reads, so the settled state is the
 * correct thing to measure. Injected once per page rather than waiting a fixed
 * delay, because a sleep long enough to be safe is long enough to make a 40-page
 * sweep unusable — and would still be a race.
 */
async function freezeAnimations(page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-delay: 0s !important;
    }`,
  })
}

/**
 * Put the sequential focus navigation starting point back at the top of the
 * document.
 *
 * Needed because dismissing the first-run tour leaves the starting point where
 * the overlay was — late in the DOM, next to the footer — so the next Tab
 * continues from there and lands on "Terms & Conditions". Without this reset,
 * a tab-order assertion reports a MISSING SKIP LINK on a page that has a
 * perfectly good one, which is a false finding shaped exactly like a real one.
 *
 * (That focus drop is itself a real defect in the tour — a dialog should return
 * focus to whatever opened it. It is fixed separately; this reset exists so the
 * assertion below measures the page's tab order rather than the tour's exit.)
 */
async function resetTabOrder(page) {
  await page.evaluate(() => {
    document.activeElement?.blur?.()
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
    document.body.removeAttribute('tabindex')
  })
}

// The four role sweeps run one at a time, in one worker.
//
// The config sets `fullyParallel: true`, which is right for short specs and
// wrong for these: four browsers each walking ten routes against a single Vite
// dev server starved it, `waitForURL` timed out, and routes were then recorded
// as unreachable. The sweep silently shrank to the landing page — a RESOURCE
// artifact arriving as a coverage result, which is the failure mode this whole
// file exists to prevent. `mode: 'default'` restores sequential-in-one-worker
// for this describe without skipping later roles when an earlier one fails,
// which `mode: 'serial'` would do.
test.describe.configure({ mode: 'default' })

for (const { role, account } of ROLES) {
  // ONE sweep per role, asserting both things it can learn from a page.
  //
  // This was two tests, and each of them signed in and walked the same ten
  // routes — the same navigation twice for two cheap measurements. That
  // doubled the load on a single dev server, and under parallel workers the
  // resulting contention made `waitForURL` time out, so routes were recorded
  // as unreachable and the sweep silently shrank to one page. Halving the work
  // fixed a correctness problem, not just a slow test.
  test(`${role}: authenticated pages are accessible`, async ({ page }) => {
    // Ten in-app hops, each followed by a full axe pass. The 30s default is
    // nowhere near enough, and a timed-out sweep reports as a failure of
    // whichever route it happened to reach first.
    // Ten hops at up to 30s each, plus an axe pass on every one.
    test.setTimeout(480000)
    await loginAsTestAccount(page, account)
    // Before discovering anything: the first-run tour is an aria-modal overlay
    // and it eats every nav click underneath it. Left up, this sweep audits the
    // landing page and nothing else — and passes.
    await dismissOnboarding(page)

    // Bounded so the sweep stays minutes rather than tens of minutes. The cap
    // is per role, and the landing page is always audited on top of it.
    const routes = (await discoverRoutes(page)).slice(0, 10)
    const measuredRoutes = []
    const violationsByRoute = []
    const badLandmarks = []

    const audit = async (route) => {
      measuredRoutes.push(route)
      // Re-injected per route: `addStyleTag` appends to the current document,
      // and an in-app route change re-renders the view underneath it.
      await freezeAnimations(page)

      const violations = await analyze(page, { disableRules: DISABLED_RULES })
      if (violations.length) violationsByRoute.push({ route, violations })

      // Landmarks are how a screen-reader user skips the nav, and axe does not
      // check for a MISSING one — the app had zero `main` landmarks anywhere
      // until 2026-08-04 while axe reported clean. A duplicate is as bad as
      // none: "skip to content" stops being a single destination.
      const mains = await page.locator('main, [role="main"]').count()
      if (mains !== 1) badLandmarks.push({ route, mains })
    }

    // The landing page first: it is always reachable, and if the sidebar is
    // collapsed there may be no clickable link at all.
    await audit(new URL(page.url()).pathname)

    for (const route of routes) {
      if (measuredRoutes.includes(route)) continue
      // Cheap re-check (no wait): the tour is dismissed above, but anything
      // modal appearing mid-sweep would otherwise eat every remaining click and
      // be reported as ten unreachable routes.
      await dismissOnboarding(page, { waitMs: 0 })
      if (!(await navigateWithinApp(page, route))) continue
      await audit(route)
    }

    // A check that cannot go red proves nothing. Without this, a broken sign-in
    // or a guard bouncing every route would skip the loop entirely and the test
    // would pass having audited NOTHING — precisely how the responsive spec's
    // first version reported 22/22 green.
    expect(
      measuredRoutes.length,
      `${role}: audited no pages at all — sign-in or in-app navigation is broken`,
    ).toBeGreaterThan(0)

    // "> 0" is not enough, and this is the lesson the tour overlay taught: a
    // blocked sweep still audits the landing page, so it clears a non-empty
    // check while covering one route out of ten. If the nav offered routes, at
    // least one of them must actually have been reached.
    if (routes.length) {
      expect(
        measuredRoutes.length,
        `${role}: the nav offered ${routes.length} route(s) [${routes.join(', ')}] but only ` +
          `${measuredRoutes[0]} was audited — something is intercepting in-app navigation`,
      ).toBeGreaterThan(1)
    }

    expect(
      badLandmarks,
      `${role}: pages without exactly one main landmark ` +
        `(audited ${measuredRoutes.length}): ${JSON.stringify(badLandmarks)}`,
    ).toEqual([])

    expect(
      violationsByRoute,
      `${role}: WCAG A/AA violations on ${violationsByRoute.length} of ` +
        `${measuredRoutes.length} audited page(s) [${measuredRoutes.join(', ')}]:\n` +
        violationsByRoute
          .map((f) => `\n── ${f.route} ──${formatViolations(f.violations)}`)
          .join('\n'),
    ).toEqual([])
  })
}

test.describe('authenticated chrome', () => {
  test('the skip link is the first tab stop once signed in', async ({ page }) => {
    // The public spec asserts this on /home. The authenticated shell renders a
    // sidebar the public pages do not have — roughly fifteen more links before
    // the content — so if the skip link is missing here it costs a keyboard user
    // the entire navigation on EVERY in-app navigation, which is the case where
    // it matters most.
    await loginAsTestAccount(page, TEST_ACCOUNTS.admin)
    await dismissOnboarding(page)
    await resetTabOrder(page)
    await page.keyboard.press('Tab')

    const first = await page.evaluate(() => {
      const el = document.activeElement
      return el ? { text: (el.textContent || '').trim(), href: el.getAttribute('href') } : null
    })

    expect(first, 'nothing was focusable at all').not.toBeNull()
    expect(first.href, `first tab stop was "${first.text}", not the skip link`).toBe('#main-content')
    expect(await page.locator('#main-content').count()).toBe(1)
  })

  test('the account menu is reachable and operable by keyboard', async ({ page }) => {
    // The header owns the account dropdown at every width — it is the only route
    // to sign-out and account settings. axe can see that the trigger has an
    // accessible name; it cannot see whether the menu OPENS for someone who
    // never touches a mouse. That is the gap between a name and a control.
    await loginAsTestAccount(page, TEST_ACCOUNTS.user)
    await dismissOnboarding(page)

    const trigger = page
      .locator('header button[aria-haspopup], header button[aria-expanded]')
      .first()

    // Reported rather than asserted-away: if the trigger carries no menu
    // semantics at all, that is itself the finding, and it should read as one
    // line instead of a timeout on a selector.
    expect(
      await trigger.count(),
      'no header button exposes aria-haspopup/aria-expanded — the account menu ' +
        'announces as a plain button, so a screen-reader user is not told it opens a menu',
    ).toBeGreaterThan(0)

    await trigger.focus()
    await expect(trigger).toBeFocused()
    await page.keyboard.press('Enter')

    expect(
      await trigger.getAttribute('aria-expanded'),
      'Enter on the account menu trigger did not set aria-expanded="true" — ' +
        'the menu either did not open, or opened without telling assistive tech',
    ).toBe('true')
  })
})
