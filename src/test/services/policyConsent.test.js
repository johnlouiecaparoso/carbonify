import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

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
