import { describe, it, expect, vi, beforeEach } from 'vitest'

// `getSupabaseAsync` resolves to whatever `getSupabase` is set to, so a test
// configures one client and both entry points agree — the service waits for the
// async one and falls back to the sync one.
vi.mock('@/services/supabaseClient', () => {
  const getSupabase = vi.fn()
  return { getSupabase, getSupabaseAsync: vi.fn(async () => getSupabase()) }
})

import { getSupabase } from '@/services/supabaseClient'
import {
  hasAcceptedCurrentPolicy,
  acceptCurrentPolicy,
} from '@/services/policyService'
import { POLICY_VERSION, POLICY_DOCUMENTS } from '@/constants/policy'

/**
 * The consent gate has one genuinely dangerous property, and it is tested
 * first: **the read fails OPEN.**
 *
 * `policy_acceptances` ships in a migration the owner applies by hand. This
 * project has already had three "built ≠ live" defects in a single day. If a
 * missing table locked every user out of the platform — including the admin
 * who would have to fix it — a consent form would have caused an outage. So a
 * failed read lets people through, loudly, and reports `indeterminate` so no
 * caller can mistake it for recorded consent.
 *
 * The WRITE is the opposite: it must never fail quietly, because a user who
 * ticked the box and was let in without a record is the case that leaves us
 * with no evidence at all.
 */

const DB_DOWN = { message: 'connection terminated unexpectedly', code: '08006' }
const NO_TABLE = { message: 'relation "public.policy_acceptances" does not exist', code: '42P01' }

/** `.select().eq().eq().limit()` */
function readChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(result),
  }
  return chain
}

/**
 * A client whose `auth.getSession()` answers with `sessionUserId` — `null` for
 * "Supabase holds no session", which is what a DEV mock login looks like.
 */
function clientWithSession(sessionUserId, result) {
  return {
    auth: { getSession: async () => ({ data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }) },
    from: () => readChain(result),
  }
}

describe('a session Supabase does not hold — the DEV mock-login case', () => {
  /**
   * The bug this pins cost a day of looking at RLS. `LoginForm` assigns
   * `testAccount.mockSession` in development, so the store believes
   * '11111111-…' is signed in while Supabase holds nothing and every request
   * goes out as `anon`. RLS then filters the read to `[]` *with no error* —
   * indistinguishable from "has not accepted" — so the gate reappeared at every
   * sign-in for all four mock accounts, and the write it wanted was rejected
   * 42501, so it could never be satisfied. `policy_acceptances` stayed empty.
   *
   * An unsatisfiable consent prompt is worse than none: skip it instead.
   */
  const MOCK_ADMIN = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => vi.mocked(getSupabase).mockReset())

  it('does not show the gate when Supabase holds no session', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientWithSession(null, { data: [], error: null }))

    const result = await hasAcceptedCurrentPolicy(MOCK_ADMIN)
    expect(result.accepted).toBe(true)
    // Let through, but never recorded as consent — the same honesty the
    // fail-open read owes.
    expect(result.indeterminate).toBe(true)
  })

  it('does not show the gate when Supabase holds a DIFFERENT user', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientWithSession('a-real-user', { data: [], error: null }),
    )

    expect(await hasAcceptedCurrentPolicy(MOCK_ADMIN)).toEqual({
      accepted: true,
      indeterminate: true,
    })
  })

  it('refuses to record an acceptance it cannot attribute', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getSession: async () => ({ data: { session: null } }) },
      from: () => ({ insert: async () => ({ error: null }) }),
    })

    // Rejected before the insert, so the raw 42501 never reaches the user.
    await expect(acceptCurrentPolicy(MOCK_ADMIN)).rejects.toThrow(/not one Supabase recognises/)
  })

  it('still asks the database when the session IS the user', async () => {
    // The check must not swallow the real case it was added to protect.
    vi.mocked(getSupabase).mockReturnValue(
      clientWithSession('real-user', { data: [], error: null }),
    )

    expect(await hasAcceptedCurrentPolicy('real-user')).toEqual({
      accepted: false,
      indeterminate: false,
    })
  })
})

describe('hasAcceptedCurrentPolicy — fails open, on purpose', () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset())

  it('lets the user through when the table does not exist', async () => {
    // The unapplied-migration case. Locking everyone out here would be an
    // outage caused by a consent form.
    vi.mocked(getSupabase).mockReturnValue({ from: () => readChain({ data: null, error: NO_TABLE }) })

    const result = await hasAcceptedCurrentPolicy('user-1')
    expect(result.accepted).toBe(true)
    expect(result.indeterminate).toBe(true)
  })

  it('lets the user through when the read errors', async () => {
    vi.mocked(getSupabase).mockReturnValue({ from: () => readChain({ data: null, error: DB_DOWN }) })

    const result = await hasAcceptedCurrentPolicy('user-1')
    expect(result.accepted).toBe(true)
    expect(result.indeterminate).toBe(true)
  })

  it('never reports an indeterminate result as real consent', async () => {
    // The distinction that keeps fail-open honest: we let them in, but we do
    // not get to claim they agreed.
    vi.mocked(getSupabase).mockReturnValue({ from: () => readChain({ data: null, error: DB_DOWN }) })

    const { accepted, indeterminate } = await hasAcceptedCurrentPolicy('user-1')
    expect(accepted && indeterminate).toBe(true)
  })

  it('blocks when the user has no acceptance row for this version', async () => {
    vi.mocked(getSupabase).mockReturnValue({ from: () => readChain({ data: [], error: null }) })

    const result = await hasAcceptedCurrentPolicy('user-1')
    expect(result.accepted).toBe(false)
    expect(result.indeterminate).toBe(false)
  })

  it('passes when a row for the current version exists', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: () => readChain({ data: [{ id: 'a-1', policy_version: POLICY_VERSION }], error: null }),
    })

    const result = await hasAcceptedCurrentPolicy('user-1')
    expect(result.accepted).toBe(true)
    expect(result.indeterminate).toBe(false)
  })

  it('is indeterminate rather than blocking with no user or client', async () => {
    vi.mocked(getSupabase).mockReturnValue(null)
    expect(await hasAcceptedCurrentPolicy('user-1')).toEqual({
      accepted: true,
      indeterminate: true,
    })

    vi.mocked(getSupabase).mockReturnValue({ from: () => readChain({ data: [], error: null }) })
    expect(await hasAcceptedCurrentPolicy(null)).toEqual({ accepted: true, indeterminate: true })
  })
})

describe('acceptCurrentPolicy — must never fail quietly', () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset())

  it('records the version and all three documents', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    vi.mocked(getSupabase).mockReturnValue({ from: () => ({ insert }) })

    await acceptCurrentPolicy('user-1')

    const row = insert.mock.calls[0][0]
    expect(row.user_id).toBe('user-1')
    expect(row.policy_version).toBe(POLICY_VERSION)
    // Self-describing: the row says what it covered even if the constant later
    // changes.
    expect(row.documents).toEqual(POLICY_DOCUMENTS.map((d) => d.id))
  })

  it('throws when the insert fails, so the gate stays up', async () => {
    vi.mocked(getSupabase).mockReturnValue({
      from: () => ({ insert: async () => ({ error: DB_DOWN }) }),
    })

    await expect(acceptCurrentPolicy('user-1')).rejects.toThrow()
  })

  it('treats a duplicate as success, not failure', async () => {
    // 23505: they already accepted this version, probably in another tab.
    vi.mocked(getSupabase).mockReturnValue({
      from: () => ({ insert: async () => ({ error: { code: '23505', message: 'duplicate key' } }) }),
    })

    await expect(acceptCurrentPolicy('user-1')).resolves.toEqual({ alreadyAccepted: true })
  })

  it('refuses to record acceptance with no user', async () => {
    vi.mocked(getSupabase).mockReturnValue({ from: () => ({ insert: async () => ({ error: null }) }) })
    await expect(acceptCurrentPolicy(null)).rejects.toThrow()
  })
})

describe('policy constants', () => {
  it('covers exactly the three documents the Terms name', async () => {
    expect(POLICY_DOCUMENTS.map((d) => d.id)).toEqual(['terms', 'privacy', 'carbon'])
  })

  it('has a version string, which is what makes re-consent possible', () => {
    expect(POLICY_VERSION).toBeTruthy()
    expect(typeof POLICY_VERSION).toBe('string')
  })
})
