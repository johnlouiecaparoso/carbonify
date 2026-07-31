import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'

// ============================================================================
// Pilot readiness — does the BACKEND let the closed beta happen at all?
//
// Every other e2e spec exercises the frontend. None of them ask the question
// that actually gates SOFT_LAUNCH_RUNBOOK §3 / YOUR_ACTION_ITEMS Step 4:
// *can an invited pilot user create an account?*
//
// This was found the hard way on 2026-07-29. `auth.spec.js` had a registration
// test that submitted a real signup; it had been failing, and buried in its
// console.log noise was the backend's answer:
//
//     "Signups not allowed for this instance"
//
// Signups are DISABLED on the live project. Every invite in Step 4 would have
// bounced. The e2e job is `continue-on-error: true` in CI, so nothing surfaced
// it.
//
// WHY THIS READS A SETTINGS ENDPOINT INSTEAD OF REGISTERING
//   GoTrue's /auth/v1/settings is public, read-only, and needs only the anon
//   key. A test that proves signups work by *signing up* leaves a junk account
//   on the live database every run — which is exactly the "leftover test data"
//   TESTING_PLAN §3 says to purge before inviting anyone.
//
// These assertions are pre-flight facts, not app behaviour. They fail when the
// dashboard is misconfigured for a pilot, not when code regresses.
// ============================================================================

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: true })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

test.describe('Pilot readiness (backend configuration)', () => {
  test.skip(
    !SUPABASE_URL || !ANON_KEY,
    'Needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (.env / .env.local).',
  )

  /** @type {Record<string, unknown>} */
  let settings

  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
    })
    expect(res.ok(), `GET /auth/v1/settings returned ${res.status()}`).toBeTruthy()
    settings = await res.json()
  })

  // 🔴 The blocker. Invited pilot users cannot register while this is true.
  // Fix: Dashboard → Authentication → Sign In / Providers → allow new users to
  // sign up. See docs/YOUR_ACTION_ITEMS.md Step 2.
  test('the backend accepts new signups', async () => {
    expect(
      settings.disable_signup,
      'Signups are DISABLED on this project — every closed-beta invite will be ' +
        'rejected with "Signups not allowed for this instance".',
    ).toBe(false)
  })

  // Not an assertion about what is *correct* — email confirmation is off by a
  // documented choice (GO_LIVE_ROADMAP P0: it needs a verified sender domain).
  // This records which way it is set so the runbook's briefing to pilot users
  // ("use an address you control") matches reality.
  test('records whether email confirmation is enforced', async () => {
    const autoconfirm = settings.mailer_autoconfirm
    console.log(
      autoconfirm
        ? 'Email confirmation is OFF (mailer_autoconfirm=true) — signups are ' +
            'usable immediately and addresses are UNVERIFIED. Matches the ' +
            'documented pre-domain state; brief pilot users accordingly.'
        : 'Email confirmation is ON (mailer_autoconfirm=false) — signups must ' +
            'click an emailed link. This requires a verified sender domain to ' +
            'be in place, or every invite silently strands.',
    )
    expect(typeof autoconfirm).toBe('boolean')
  })
})
