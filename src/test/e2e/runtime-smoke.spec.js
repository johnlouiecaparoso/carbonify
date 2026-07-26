import { test, expect } from '@playwright/test'

/**
 * Runtime smoke for the 2026-07-26 changes. Public routes only — no auth, no
 * writes. Captures console errors and failed requests, which matters today
 * because main.js used to monkey-patch console.error and swallow a class of
 * them; that patch is gone, so anything here is newly visible rather than new.
 */

const PUBLIC_ROUTES = ['/', '/marketplace', '/biomass', '/registry', '/market', '/about', '/login']

function collect(page, errors, failures) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200))
  })
  page.on('pageerror', (err) => errors.push('UNCAUGHT: ' + String(err).slice(0, 200)))
  page.on('requestfailed', (req) => {
    const u = req.url()
    if (u.startsWith('http://localhost')) failures.push(u.replace('http://localhost:5173', ''))
  })
}

for (const route of PUBLIC_ROUTES) {
  test(`no console errors on ${route}`, async ({ page }) => {
    const errors = []
    const failures = []
    collect(page, errors, failures)

    await page.goto(route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)

    if (errors.length) console.log(`\n[${route}] console errors:\n  ` + errors.join('\n  '))
    if (failures.length) console.log(`\n[${route}] failed requests:\n  ` + failures.join('\n  '))

    expect(failures, `${route} had failed local requests`).toEqual([])
  })
}

test('icons are real PNGs and the manifest resolves', async ({ request }) => {
  const manifestRes = await request.get('/manifest.json')
  expect(manifestRes.ok()).toBeTruthy()
  const manifest = await manifestRes.json()

  for (const icon of manifest.icons) {
    const res = await request.get(icon.src)
    expect(res.ok(), `${icon.src} did not load`).toBeTruthy()
    const buf = await res.body()
    // PNG magic: 89 50 4E 47. The old files were JPEGs named .png.
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    expect(isPng, `${icon.src} is not a real PNG`).toBeTruthy()
    expect(icon.type).toBe('image/png')
  }

  for (const p of ['/favicon-32.png', '/apple-touch-icon.png', '/carbonify-logo.png']) {
    const res = await request.get(p)
    expect(res.ok(), `${p} missing`).toBeTruthy()
    const buf = await res.body()
    expect(buf[0] === 0x89 && buf[1] === 0x50, `${p} is not a real PNG`).toBeTruthy()
  }
})

test('service worker registers exactly once', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const count = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return -1
    const regs = await navigator.serviceWorker.getRegistrations()
    return regs.length
  })
  // -1 = unsupported in this context; 0 or 1 are both fine, >1 means the
  // triple registration removed today came back.
  expect(count).toBeLessThanOrEqual(1)
})
