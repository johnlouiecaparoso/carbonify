import { test, expect } from '@playwright/test'
import { analyze, formatViolations, axeVersion } from './helpers/axe.js'

/**
 * Accessibility audit — MEASURED against WCAG 2.1 AA, in a real browser.
 *
 * The same argument as `responsive.spec.js`: reading markup tells you what an
 * `aria-label` intends, not whether the control ends up with an accessible name
 * once the component has rendered, the icon font has loaded and the label has
 * been overwritten by a `title`. Colour contrast in particular **cannot** be
 * checked without layout — it needs the computed foreground, the computed
 * background, and the actual font size — which is why this runs under Playwright
 * and not in happy-dom.
 *
 * Scope is WCAG 2.1 A + AA only. `best-practice` rules are deliberately off:
 * they are opinions, and a report that mixes them with real conformance
 * failures is one people learn to skip.
 *
 * ⚠️ **What this does and does not prove.** Automated checks catch roughly a
 * third of WCAG failures. A green run here does NOT mean the app is accessible
 * — it means no *machine-detectable* violation remains on these routes. Whether
 * a screen-reader user can actually complete a purchase is a manual question,
 * and it stays open on the register.
 */

/** Public routes — no auth, so this runs anywhere, same set as the responsive spec. */
const ROUTES = ['/home', '/about', '/marketplace', '/registry', '/market', '/login', '/register']

test.describe('accessibility (WCAG 2.1 AA, automated)', () => {
  test('the axe version is pinned so rule changes are visible', () => {
    // If this fails, axe-core was upgraded: re-run the suite and read the diff
    // before adjusting the number. A silent upgrade can add or drop rules,
    // which changes what "green" means.
    expect(axeVersion()).toBe('4.10.3')
  })

  for (const route of ROUTES) {
    test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })

      const violations = await analyze(page)

      expect(
        violations,
        `${route} has ${violations.length} WCAG A/AA violation type(s):${formatViolations(violations)}\n`,
      ).toEqual([])
    })
  }

  test('the login form is fully operable by keyboard alone', async ({ page }) => {
    // Not an axe rule — axe can see that inputs have names, not that you can
    // reach and submit them. This is the flow a keyboard-only user needs on the
    // very first screen.
    await page.goto('/login', { waitUntil: 'networkidle' })

    const email = page.locator('input[type="email"]').first()
    await email.focus()
    await expect(email).toBeFocused()

    // Tab forward and confirm focus actually lands on something interactive
    // each time, rather than disappearing into a div with tabindex="-1".
    const reached = []
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        return { tag: el.tagName.toLowerCase(), type: el.getAttribute('type') }
      })
      if (info) reached.push(info)
    }

    expect(reached.length, 'Tab from the email field reached nothing focusable').toBeGreaterThan(0)
    expect(
      reached.some((r) => ['input', 'button', 'a', 'select', 'textarea'].includes(r.tag)),
      `Tab order reached only non-interactive elements: ${JSON.stringify(reached)}`,
    ).toBe(true)
  })

  // One test per route, not one loop over all of them: seven `networkidle`
  // navigations exceed the default 30s timeout, and a timed-out loop reports as
  // a failure of whatever it happened to reach first. That cost an hour, and it
  // is the same lesson as the rest of this file — a check that cannot report
  // precisely is a check you will misread.
  for (const route of ROUTES) {
    test(`${route} has exactly one main landmark`, async ({ page }) => {
      // Landmarks are how a screen-reader user skips the nav. Missing or
      // duplicated `main` is the difference between one keystroke and forty.
      await page.goto(route, { waitUntil: 'networkidle' })
      const mains = await page.locator('main, [role="main"]').count()
      expect(mains, `${route} has ${mains} main landmarks, expected exactly 1`).toBe(1)
    })
  }

  test('routes do not all share one page title', async ({ page }) => {
    // WCAG 2.4.2. Every route served the SAME title until 2026-08-04, and no
    // automated rule can see that: each page individually has a non-empty
    // title, so axe is satisfied. Only comparing them across routes finds it.
    // A screen-reader user hears the title on every navigation.
    // `networkidle`, not `domcontentloaded`: this is an SPA, so on
    // DOMContentLoaded the router has not navigated yet and every route still
    // shows the static title from index.html — which would make this test pass
    // or fail on timing rather than on behaviour.
    const seen = []
    for (const route of ['/home', '/marketplace', '/login']) {
      await page.goto(route, { waitUntil: 'networkidle' })
      seen.push(await page.title())
    }

    expect(
      new Set(seen).size,
      `these routes all share one title: ${JSON.stringify(seen)}`,
    ).toBe(seen.length)
  })

  test('the skip link is the first thing a keyboard user reaches', async ({ page }) => {
    // Without it, every page load costs a keyboard user the entire header and
    // sidebar before they reach content — on every navigation.
    await page.goto('/home', { waitUntil: 'networkidle' })
    await page.keyboard.press('Tab')

    const first = await page.evaluate(() => {
      const el = document.activeElement
      return el ? { text: (el.textContent || '').trim(), href: el.getAttribute('href') } : null
    })

    expect(first, 'nothing was focusable at all').not.toBeNull()
    expect(first.href, `first tab stop was "${first.text}", not the skip link`).toBe('#main-content')

    // And it must actually go somewhere.
    expect(await page.locator('#main-content').count()).toBe(1)
  })
})
