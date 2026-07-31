import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createClientMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => createClientMock(...args),
}))

// `src/test/setup.js` installs a GLOBAL double for this module so services can
// be tested without a client. This file is the one place that must exercise the
// REAL implementation — it is testing the client factory itself.
vi.unmock('@/services/supabaseClient')

const { getSupabase, resetSupabase } = await vi.importActual('@/services/supabaseClient')

/**
 * DEFERRED_BACKLOG #15 — the root of the nullable-client problem.
 *
 * `getSupabase()` used to kick off an async init and return whatever the module
 * singleton happened to hold, which was `null` while that was in flight. The
 * answer to "is Supabase available?" therefore depended on WHEN you asked, and
 * ~125 hand-written guards across the services exist to absorb that.
 *
 * The guard count was never the real problem. The two SHAPES were: 94 of them
 * `throw` and 31 `return []`. One transient race surfaced as a hard error in one
 * service and as an empty list in the next — and an empty list renders as a fact
 * about the user. That is the defect class this repo has been chasing all week,
 * with a startup race as its source. The policy consent gate hit exactly this on
 * 2026-08-01: it sampled the client in the same tick as the first call, got an
 * indeterminate answer, and never retried.
 *
 * `createClient()` does no I/O, so the client is now built on demand and the
 * legacy-session migration runs in the background. A `null` return now means one
 * thing only: the environment is misconfigured.
 */

const ORIGINAL_ENV = { ...import.meta.env }

describe('getSupabase is synchronous and race-free', () => {
  beforeEach(() => {
    resetSupabase()
    createClientMock.mockReset()
    createClientMock.mockReturnValue({
      auth: { onAuthStateChange: vi.fn(), setSession: vi.fn() },
    })
    import.meta.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    import.meta.env.VITE_SUPABASE_ANON_KEY = 'anon-key'
    window._supabaseErrorLogged = false
  })

  afterEach(() => {
    Object.assign(import.meta.env, ORIGINAL_ENV)
    resetSupabase()
  })

  it('returns a client on the VERY FIRST synchronous call', () => {
    // The bug: this returned null, because init had only just been kicked off.
    // Nothing about the first call is special any more.
    expect(getSupabase()).not.toBeNull()
  })

  it('returns the same instance on repeated calls (still a singleton)', () => {
    const first = getSupabase()
    const second = getSupabase()

    expect(first).toBe(second)
    expect(createClientMock).toHaveBeenCalledTimes(1)
  })

  it('never returns null across a burst of same-tick callers', () => {
    // Stands in for the real scenario: the router guard hydrates the session
    // before App.vue mounts, so several services can ask in the same tick.
    const results = Array.from({ length: 25 }, () => getSupabase())

    expect(results.every((client) => client !== null)).toBe(true)
    expect(new Set(results).size).toBe(1)
    expect(createClientMock).toHaveBeenCalledTimes(1)
  })

  it('returns null ONLY when the environment is misconfigured', () => {
    resetSupabase()
    import.meta.env.VITE_SUPABASE_URL = 'your_supabase_project_url_here'

    // This is the one remaining null, and it is a real persistent state a guard
    // should handle — not a timing artefact.
    expect(getSupabase()).toBeNull()
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('does not await the legacy session migration', () => {
    // The migration is the only async step in start-up. If it were awaited,
    // getSupabase() could not be synchronous at all — so a client coming back
    // from a plain synchronous call IS the assertion that it is not awaited.
    localStorage.setItem?.(
      'ecolink-supabase-auth-token',
      JSON.stringify({ access_token: 'a', refresh_token: 'b' }),
    )

    expect(getSupabase()).not.toBeNull()
  })
})
