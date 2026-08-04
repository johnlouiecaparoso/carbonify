#!/usr/bin/env node
/**
 * Ask a URL whether it is serving THIS codebase, and say why not when it isn't.
 *
 *   node scripts/analysis/verify-deploy.mjs https://your-app.vercel.app
 *   node scripts/analysis/verify-deploy.mjs https://your-app.vercel.app --json
 *
 * WHY THIS EXISTS
 * On 2026-08-05 `git push` succeeded, `main` and `origin/main` were level, the
 * working tree was clean, and there was no website. `carbonify13.vercel.app` —
 * the production URL named in every runbook and verified by fetching it four
 * days earlier — returned 404 DEPLOYMENT_NOT_FOUND, because the GitHub repo had
 * been renamed and the Vercel Git integration did not follow.
 *
 * `carbonify.vercel.app` was the more dangerous half: it answered 200 and its
 * <title> said "Carbonify". It was a different app entirely (React, no Supabase,
 * no service worker). **A 200 and a plausible title are not evidence.** That is
 * the specific mistake this script exists to make impossible to repeat.
 *
 * WHAT IT CHECKS, AND WHAT EACH CHECK IS FOR
 *   1. the URL responds at all                  — catches DEPLOYMENT_NOT_FOUND
 *   2. /sw.js exists and reports a CACHE_VERSION — this app ships one; the
 *                                                  impostor 404s here
 *   3. the entry bundle contains app markers     — `credit_listings` etc. cannot
 *                                                  appear in an unrelated app
 *   4. the fetch wrapper is ABSENT               — deleted 2026-08-04; if it is
 *                                                  present you are looking at a
 *                                                  build from before that, and
 *                                                  VITE_GA_TRACKING_ID is unsafe
 *                                                  to set
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It never compares bundle hashes. Vercel inlines its own VITE_* values, so a
 * deployed bundle can never be byte-identical to a local build, and a hash
 * comparison reports a false difference every single time. Compare CONTENT.
 *
 * Exit code 0 = serving this app, 1 = not (or unreachable), so it can gate a
 * pre-flight step.
 */

const MARKERS = [
  // Strings that exist because of this app's schema and RPCs. An unrelated
  // bundle cannot contain them; a stale build of THIS app still will, which is
  // why staleness is checked separately below.
  'credit_listings',
  'policy_acceptances',
  'process_wallet_purchase',
]

// Deleted on 2026-08-04. Its presence dates the build rather than breaking it —
// see the GA warning in docs/HANDOFF.md.
const REMOVED_SINCE = [
  { needle: 'window.fetch=', why: 'the analytics fetch wrapper (deleted 2026-08-04)' },
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
  note(false, 'site responds', `GET / returned ${index.status || 'no response'}${index.error ? ` (${index.error})` : ''}`)
} else {
  note(true, 'site responds', 'GET / returned 200')

  // 2 — the service worker. Cheapest single discriminator: this app ships one at
  // public/sw.js, and a different project almost certainly does not.
  const sw = await get(`${base}/sw.js`)
  const version = sw.body.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1]
  note(
    sw.status === 200 && Boolean(version),
    'service worker',
    sw.status === 200
      ? version
        ? `/sw.js serves CACHE_VERSION = '${version}'`
        : '/sw.js exists but declares no CACHE_VERSION'
      : `/sw.js returned ${sw.status} — this app ships one, so a 404 here means a different app`,
  )

  // 3 — the entry bundle. Vite emits a hashed entry into index.html; follow it
  // rather than guessing a filename, because the hash changes every build and
  // the output directory has changed before (/js/ vs /assets/).
  const entry = index.body.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
  if (!entry) {
    note(false, 'entry bundle', 'no module script found in index.html')
  } else {
    const url = entry.startsWith('http') ? entry : `${base}${entry.startsWith('/') ? '' : '/'}${entry}`
    const bundle = await get(url)
    if (bundle.status !== 200) {
      note(false, 'entry bundle', `${entry} returned ${bundle.status}`)
    } else {
      const missing = MARKERS.filter((m) => !bundle.body.includes(m))
      const isThisApp = missing.length === 0
      note(
        isThisApp,
        'app markers',
        isThisApp
          ? `all ${MARKERS.length} present in ${entry}`
          : `MISSING ${missing.join(', ')} — ${entry} is not this application`,
      )

      // Only meaningful once we know it IS this app. Run unconditionally and a
      // wholly unrelated bundle "passes" for not containing our old code, which
      // is a PASS line nobody should have to reason past.
      if (isThisApp) {
        for (const { needle, why } of REMOVED_SINCE) {
          note(
            !bundle.body.includes(needle),
            'build is current',
            bundle.body.includes(needle)
              ? `found ${needle} — ${why}. This is an OLD build; do not set VITE_GA_TRACKING_ID against it`
              : `${why} is absent, as expected`,
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
    console.log(`  ${f.ok ? 'PASS' : 'FAIL'}  ${f.check.padEnd(18)} ${f.detail}`)
  }
  console.log(
    ok
      ? '\n  → This URL is serving this application.\n'
      : '\n  → NOT confirmed as this application. A 200 and a matching page title are not evidence.\n',
  )
}

process.exit(ok ? 0 : 1)
