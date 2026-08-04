#!/usr/bin/env node
/**
 * Ask a URL whether it is serving THIS codebase, and at what vintage.
 *
 *   node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app
 *   node scripts/analysis/verify-deploy.mjs <url> --json
 *
 * WHY THIS EXISTS
 * On 2026-08-05 `git push` succeeded, `main` and `origin/main` were level, the
 * working tree was clean — and the URL in every runbook returned 404. The
 * project had been building fine the whole time, at a hostname nobody had
 * written down. A second host answered 200 with <title>Carbonify</title> and was
 * an unrelated React app. **A 200 and a plausible title are not evidence.**
 *
 * WHY IT FETCHES EVERY CHUNK, WHICH IS THE BUG THE FIRST VERSION SHIPPED WITH
 * The first version checked only the entry bundle and reported the real
 * production site as "not this application" — `credit_listings` and
 * `process_wallet_purchase` live in lazily-loaded chunks that it never fetched.
 * A verifier that cries wolf on the correct answer is worse than no verifier: it
 * spends the credibility you need on the day it is right. So this walks the
 * chunk graph out of the entry bundle and searches the whole client build.
 *
 * That also makes the ABSENCE checks meaningful. "This string is gone" over a
 * partial fetch proves nothing; over the complete bundle it dates the build.
 *
 * WHAT IT CHECKS
 *   1. the URL responds                       — catches DEPLOYMENT_NOT_FOUND
 *   2. /sw.js serves a CACHE_VERSION          — this app ships one; impostors 404
 *   3. identity markers are present           — schema/RPC names an unrelated app
 *                                               cannot contain
 *   4. vintage markers                        — code added on 2026-08-04 is
 *                                               present AND code deleted that day
 *                                               is gone, so a stale-but-genuine
 *                                               build is not mistaken for current
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It never compares bundle hashes or filenames. Vercel inlines its own VITE_*
 * values, so a deployed bundle is never byte-identical to a local build and a
 * hash comparison reports a false difference every time. Compare CONTENT.
 *
 * Exit 0 = serving this app at this vintage, 1 = not (or unreachable).
 */

/** Strings that exist because of this app's schema and RPCs. */
const IDENTITY = ['credit_listings', 'policy_acceptances', 'process_wallet_purchase']

/** Added 2026-08-04. Absent => the deploy predates the pre-pilot defect hunt. */
const ADDED_2026_08_04 = [
  { needle: 'carbonify_onboarding_dismissed_', what: 'per-account onboarding key' },
  { needle: 'ecolink_cart_pending_session', what: 'cart checkout session binding' },
]

/**
 * Deleted 2026-08-04. Presence => an OLD build, and VITE_GA_TRACKING_ID is
 * actively unsafe against it: the wrapper named each metric after the full
 * request URL, query string included, and forwarded it to GA.
 */
const DELETED_2026_08_04 = [
  // The obvious needle is `window.fetch=`, and it is WRONG: html2canvas patches
  // window.fetch in its own vendor bundle, so it is present in a known-good
  // local build too. It was tried, it reported production as stale, and the
  // local build disproved it in one grep. Match the metric name instead — that
  // string existed only in our wrapper (`api_error_${url}`).
  { needle: 'api_error_', what: "the analytics wrapper's per-URL metric names" },
]

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const base = (args.find((a) => !a.startsWith('--')) || '').replace(/\/+$/, '')

if (!base) {
  console.error('usage: node scripts/analysis/verify-deploy.mjs <url> [--json]')
  process.exit(1)
}

const findings = []
const note = (ok, check, detail) => findings.push({ ok, check, detail })

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    return { status: res.status, body: res.ok ? await res.text() : '' }
  } catch (e) {
    return { status: 0, body: '', error: e?.message ?? String(e) }
  }
}

const index = await get(`${base}/`)

if (index.status !== 200) {
  note(
    false,
    'site responds',
    `GET / returned ${index.status || 'no response'}${index.error ? ` (${index.error})` : ''}`,
  )
} else {
  note(true, 'site responds', 'GET / returned 200')

  // 2 — cheapest single discriminator: this app ships public/sw.js.
  const sw = await get(`${base}/sw.js`)
  const version = sw.body.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1]
  note(
    sw.status === 200 && Boolean(version),
    'service worker',
    sw.status === 200
      ? version
        ? `/sw.js serves CACHE_VERSION = '${version}'`
        : '/sw.js exists but declares no CACHE_VERSION'
      : `/sw.js returned ${sw.status} — this app ships one, so a 404 means a different app`,
  )

  // 3 — walk the chunk graph. Follow the entry out of index.html rather than
  // guessing: the hash changes every build and the output directory has been
  // both /js/ and /assets/.
  const entryHref = index.body.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
  if (!entryHref) {
    note(false, 'entry bundle', 'no module script found in index.html')
  } else {
    const abs = (href) =>
      href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`
    const entryUrl = abs(entryHref)
    const entry = await get(entryUrl)

    if (entry.status !== 200) {
      note(false, 'entry bundle', `${entryHref} returned ${entry.status}`)
    } else {
      // Chunk references appear as "./name-hash.js" relative to the entry's own
      // directory. Resolve against the entry URL so /js/ vs /assets/ is handled
      // without hardcoding either.
      //
      // The walk is TRANSITIVE, and it has to be. A one-level version reported
      // production as stale because `cart-*.js` — which carries the 2026-08-04
      // checkout-session binding — is referenced by CartView and
      // PaymentCallbackView, never by the entry. Breadth-first until closure, so
      // "this string is absent" is a statement about the whole client build
      // rather than about the slice that happened to be one hop away.
      const dir = entryUrl.slice(0, entryUrl.lastIndexOf('/'))
      const refsIn = (body) =>
        [...new Set(body.match(/"\.\/[A-Za-z0-9._-]+\.js"/g) ?? [])].map((q) => q.slice(3, -1))

      const sources = [{ name: entryHref.split('/').pop(), body: entry.body }]
      const seen = new Set([sources[0].name])
      let frontier = refsIn(entry.body).filter((n) => !seen.has(n))
      let failed = 0

      while (frontier.length) {
        for (const n of frontier) seen.add(n)
        const fetched = await Promise.all(
          frontier.map(async (n) => ({ name: n, ...(await get(`${dir}/${n}`)) })),
        )
        const next = new Set()
        for (const r of fetched) {
          if (r.status !== 200) {
            failed++
            continue
          }
          sources.push({ name: r.name, body: r.body })
          for (const n of refsIn(r.body)) if (!seen.has(n)) next.add(n)
        }
        frontier = [...next]
      }

      note(
        failed === 0,
        'chunk graph',
        failed === 0
          ? `walked ${sources.length} file(s) to closure (entry + ${sources.length - 1} chunks)`
          : `walked ${sources.length} file(s); ${failed} chunk(s) failed to fetch — absence checks below are unreliable`,
      )

      const findIn = (needle) => sources.find((s) => s.body.includes(needle))?.name

      // 3 — identity
      const missing = IDENTITY.filter((m) => !findIn(m))
      note(
        missing.length === 0,
        'app identity',
        missing.length === 0
          ? `all ${IDENTITY.length} markers found across the bundle`
          : `MISSING ${missing.join(', ')} — this is not this application`,
      )

      // 4 — vintage. Only meaningful once identity holds; otherwise an unrelated
      // bundle "passes" the absence half for containing none of our code at all.
      if (missing.length === 0) {
        for (const { needle, what } of ADDED_2026_08_04) {
          const where = findIn(needle)
          note(
            Boolean(where),
            'build vintage',
            where
              ? `${what} present (${where})`
              : `${what} MISSING — this build predates 2026-08-04`,
          )
        }
        for (const { needle, what } of DELETED_2026_08_04) {
          const where = findIn(needle)
          note(
            !where,
            'build vintage',
            where
              ? `${what} still present (${where}) — OLD build; do NOT set VITE_GA_TRACKING_ID`
              : `${what} is gone, as expected`,
          )
        }
      }
    }
  }
}

const ok = findings.every((f) => f.ok)

if (asJson) {
  console.log(JSON.stringify({ url: base, serving_this_app: ok, findings }, null, 2))
} else {
  console.log(`\n  ${base}\n`)
  for (const f of findings) {
    console.log(`  ${f.ok ? 'PASS' : 'FAIL'}  ${f.check.padEnd(16)} ${f.detail}`)
  }
  console.log(
    ok
      ? '\n  → Serving this application, at or after the 2026-08-04 pass.\n'
      : '\n  → NOT confirmed. A 200 and a matching page title are not evidence.\n',
  )
}

process.exit(ok ? 0 : 1)
