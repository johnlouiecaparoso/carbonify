import { test, expect } from '@playwright/test'

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

/** Real device widths, smallest first. 320 is an iPhone SE / small Android. */
const VIEWPORTS = [
  { name: '320 (small phone)', width: 320, height: 640 },
  { name: '390 (iPhone 14)', width: 390, height: 844 },
  { name: '768 (tablet portrait)', width: 768, height: 1024 },
  { name: '1024 (tablet landscape)', width: 1024, height: 768 },
  { name: '1440 (laptop)', width: 1440, height: 900 },
]

/** Public routes — no auth needed, so this runs anywhere. */
const ROUTES = ['/home', '/about', '/marketplace', '/registry', '/market', '/login', '/register']

/**
 * Elements sticking out past the viewport, excluding anything inside a proper
 * scroll container (that is the intended pattern for wide tables).
 */
async function findOverflowing(page, viewportWidth) {
  return page.evaluate((vw) => {
    const offenders = []
    const scrollable = (el) => {
      const s = getComputedStyle(el)
      return s.overflowX === 'auto' || s.overflowX === 'scroll'
    }

    for (const el of document.body.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      // 1px of tolerance for sub-pixel rounding.
      if (rect.right <= vw + 1) continue

      // Inside a scroll container? Then overflowing it is correct.
      let inScroller = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (scrollable(p)) {
          inScroller = true
          break
        }
      }
      if (inScroller) continue

      // Deliberately clipped or pinned off-screen (drawers, scrims).
      const style = getComputedStyle(el)
      if (style.position === 'fixed' && parseFloat(style.left) >= vw) continue
      if (style.visibility === 'hidden' || style.display === 'none') continue

      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      })
    }
    // Report the worst few; a parent and its child both overflow together.
    return offenders.sort((a, b) => b.right - a.right).slice(0, 6)
  }, viewportWidth)
}

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
