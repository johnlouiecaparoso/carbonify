/**
 * Shared layout measurement for the responsive specs.
 *
 * Extracted 2026-08-01 when the authenticated spec was added. It is one copy on
 * purpose: this session has spent most of its time on defects caused by the same
 * logic existing twice and only one copy being fixed
 * (`getUserCreditPortfolio`, `getUserTransactionHistory`, the three project
 * submit paths). A second copy of the overflow detector would be the same
 * mistake in the test suite instead of the service layer.
 */

/** Real device widths, smallest first. 320 is an iPhone SE / small Android. */
export const VIEWPORTS = [
  { name: '320 (small phone)', width: 320, height: 640 },
  { name: '390 (iPhone 14)', width: 390, height: 844 },
  { name: '768 (tablet portrait)', width: 768, height: 1024 },
  { name: '1024 (tablet landscape)', width: 1024, height: 768 },
  { name: '1440 (laptop)', width: 1440, height: 900 },
]

/**
 * Elements sticking out past the viewport, excluding anything inside a proper
 * scroll container (that is the intended pattern for wide tables).
 *
 * Measures element geometry rather than `document.scrollWidth`, because
 * `html { overflow-x: clip }` in responsive.css CLIPS a stray wide child instead
 * of dragging the page — which suppresses the scrollbar but also hides the
 * overflow. A scrollWidth check would have passed while a table's last columns
 * were unreachable.
 */
export async function findOverflowing(page, viewportWidth) {
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

/**
 * Sign in using a DEV test account.
 *
 * ⚠️ READ THIS BEFORE TRUSTING WHAT THESE TESTS COVER.
 *
 * `LoginForm` has a development-only branch that assigns a fabricated
 * `mockSession` straight into the store for the four `*@carbonify.test`
 * accounts. Those users **do not exist in Supabase auth**, so the Supabase
 * client never receives the session and every PostgREST request still goes out
 * as `anon` with `auth.uid()` null. This is the same mechanism that made the
 * policy consent gate unsatisfiable on 2026-08-01.
 *
 * For layout measurement that is a usable trade and a real limit:
 *
 *   ✅ MEASURED — the authenticated shell: header, sidebar, page chrome,
 *      role-gated navigation, card grids, forms, and every EMPTY state.
 *   ❌ NOT MEASURED — data-dense layouts. Tables render with zero rows, so a
 *      wide table that only overflows once it has real content will pass here.
 *
 * Closing that second half needs a seeded backend and a genuine Supabase
 * session. Until then these tests catch shell and chrome regressions, which is
 * strictly more than the zero coverage authenticated pages had before.
 */
export async function loginAsTestAccount(page, { email, password }) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')

  // The dev branch redirects to the role's default route. Wait for the URL to
  // stop being /login rather than for a fixed target, so this helper does not
  // encode the role-routing table a second time.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
}

export const TEST_ACCOUNTS = {
  admin: { email: 'admin@carbonify.test', password: 'admin123' },
  verifier: { email: 'verifier@carbonify.test', password: 'verifier123' },
  developer: { email: 'developer@carbonify.test', password: 'developer123' },
  user: { email: 'user@carbonify.test', password: 'user123' },
}
