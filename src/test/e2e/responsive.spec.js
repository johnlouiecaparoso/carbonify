import { test, expect } from '@playwright/test'
import { VIEWPORTS, findOverflowing } from './helpers/layout.js'

// VIEWPORTS and findOverflowing moved to ./helpers/layout.js on 2026-08-01 when
// responsive-authenticated.spec.js was added. ONE copy on purpose — a second
// detector that only one spec's fixes reach is precisely the duplicate-source
// defect this session spent its time removing from the services.

/**
 * Responsive audit — MEASURED, not read off the stylesheets.
 *
 * Reading CSS tells you what a rule intends. It does not tell you whether a
 * 720px table, a wide flex row or a long unbroken serial actually pushes the
 * page sideways at 360px, because that depends on what wraps it. So this loads
 * the real pages at real widths and asks the browser.
 *
 * `html { overflow-x: clip }` in responsive.css means a stray wide child is
 * CLIPPED rather than dragging the page — which prevents the scrollbar but
 * also HIDES the content that overflowed. Checking `scrollWidth` alone would
 * therefore pass while a table's last columns were unreachable. These tests
 * measure element geometry instead, and treat a legitimate scroll container
 * (overflow-x auto/scroll) as the correct way to hold wide content.
 */

/** Public routes — no auth needed, so this runs anywhere. */
const ROUTES = ['/home', '/about', '/marketplace', '/registry', '/market', '/login', '/register']

for (const vp of VIEWPORTS) {
  test.describe(`at ${vp.name}`, () => {
    for (const route of ROUTES) {
      test(`${route} has no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.goto(route, { waitUntil: 'networkidle' })

        const offenders = await findOverflowing(page, vp.width)
        expect(
          offenders,
          `${route} overflows at ${vp.width}px:\n${JSON.stringify(offenders, null, 2)}`,
        ).toEqual([])
      })
    }
  })
}

test.describe('touch targets and text', () => {
  test('primary actions are big enough to tap at 390px', async ({ page }) => {
    // WCAG 2.5.8 asks for 24x24 CSS px minimum; 40px is the comfortable floor
    // this app already uses on its buttons.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/login', { waitUntil: 'networkidle' })

    const small = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('button, a.btn, [type="submit"]')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.height < 32) out.push({ text: (el.textContent || '').trim().slice(0, 30), h: Math.round(r.height) })
      }
      return out
    })

    expect(small, `buttons under 32px tall: ${JSON.stringify(small)}`).toEqual([])
  })

  test('form inputs are 16px on mobile so iOS does not zoom on focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/login', { waitUntil: 'networkidle' })

    const tooSmall = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, textarea')) {
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 16) out.push({ name: el.name || el.id || el.type, size })
      }
      return out
    })

    expect(tooSmall, `inputs under 16px: ${JSON.stringify(tooSmall)}`).toEqual([])
  })
})
